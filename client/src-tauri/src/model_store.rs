// Verified model store: weights added by the user, checked byte-for-byte
// against the pinned manifest before use (docs/model-download-plan.md).
// Two entry paths share the machinery: offline import (the user supplies
// the file) and explicit download (one pinned https URL, streamed and
// hashed in-flight). The store lives at app_data_dir()/models/{repo}/
// {path}, mirroring the bundle's resource layout; read_model_file and the
// native engine fall back here when a file is absent from resources, so a
// stored model needs no other plumbing.
//
// The frontend passes the manifest entry's repo/path/url/sha256/size —
// Rust never reads the manifest. Nothing lands under a loadable name
// before its hash matches the pin, and a mismatch removes the partial
// file. Network happens only inside model_download, only on a user
// action.

use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

// Same containment rules as read_model_file: relative, forward-slash
// manifest paths only.
fn valid_rel(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn store_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("models"))
}

/// Copy into the store, then verify size and sha256 on the copy, then
/// rename into place. A mismatch removes the copy and reports what
/// differed — never leaves unverified bytes under a loadable name.
fn import_file(
    source: &PathBuf,
    target: &PathBuf,
    expected_sha256: &str,
    expected_size: u64,
) -> Result<(), String> {
    let meta =
        std::fs::metadata(source).map_err(|err| format!("read failed: {err}"))?;
    if meta.len() != expected_size {
        return Err(format!(
            "size mismatch: the pinned model is {expected_size} bytes, the selected file is {} bytes",
            meta.len()
        ));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let partial = target.with_extension("partial");
    let cleanup = |message: String| {
        let _ = std::fs::remove_file(&partial);
        message
    };
    std::fs::copy(source, &partial)
        .map_err(|err| cleanup(format!("copy failed: {err}")))?;

    let mut file = std::fs::File::open(&partial)
        .map_err(|err| cleanup(format!("read failed: {err}")))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 4 * 1024 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|err| cleanup(format!("read failed: {err}")))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        return Err(cleanup(
            "checksum mismatch — the selected file is not the pinned model"
                .into(),
        ));
    }
    std::fs::rename(&partial, target)
        .map_err(|err| cleanup(format!("rename failed: {err}")))
}

/// Pick a file and import it as the given manifest entry. Resolves false
/// when the user cancels the picker, true on a verified import; rejects
/// with a message on any mismatch or IO failure.
#[tauri::command]
pub async fn model_import(
    app: tauri::AppHandle,
    repo: String,
    path: String,
    sha256: String,
    size: u64,
) -> Result<bool, String> {
    let rel = format!("{repo}/{path}");
    if !valid_rel(&rel) {
        return Err(format!("invalid model path: {rel}"));
    }
    let target = store_root(&app)?.join(&rel);
    let extension = std::path::Path::new(&path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("gguf")
        .to_string();
    let picked = app
        .dialog()
        .file()
        .add_filter("Model weights", &[&extension])
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(false);
    };
    let source = picked.into_path().map_err(|err| err.to_string())?;
    // Hashing gigabytes takes seconds — keep it off the async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        import_file(&source, &target, &sha256, size)
    })
    .await
    .map_err(|err| err.to_string())??;
    Ok(true)
}

/// One transfer at a time: the worker loads one model at a time anyway,
/// and a single slot keeps progress reporting and cancel unambiguous.
struct Transfer {
    bytes: u64,
    total: u64,
    active: bool,
}

static TRANSFER: Mutex<Transfer> = Mutex::new(Transfer {
    bytes: 0,
    total: 0,
    active: false,
});
static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize)]
pub struct StoreProgress {
    pub bytes: u64,
    pub total: u64,
    pub active: bool,
}

/// Stream one pinned file into the store: write to a .partial path, hash
/// while streaming, verify size and sha256, and only then rename into
/// place. Any failure or cancel removes the partial file.
async fn download_file(
    app: &tauri::AppHandle,
    rel: &str,
    url: &str,
    expected_sha256: &str,
    expected_size: u64,
) -> Result<(), String> {
    let target = store_root(app)?.join(rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let partial = target.with_extension("partial");
    let cleanup = |message: String| {
        let _ = std::fs::remove_file(&partial);
        message
    };

    let mut response = reqwest::get(url)
        .await
        .map_err(|err| format!("download failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }
    let mut file = std::fs::File::create(&partial)
        .map_err(|err| cleanup(format!("write failed: {err}")))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|err| cleanup(format!("download failed: {err}")))?;
        let Some(chunk) = chunk else {
            break;
        };
        if CANCEL.load(Ordering::SeqCst) {
            return Err(cleanup("download cancelled".into()));
        }
        received += chunk.len() as u64;
        if received > expected_size {
            return Err(cleanup(
                "download failed: the server sent more bytes than the pinned size"
                    .into(),
            ));
        }
        file.write_all(&chunk).map_err(|err| {
            cleanup(format!("write failed: {err} — check free disk space"))
        })?;
        hasher.update(&chunk);
        TRANSFER.lock().unwrap().bytes = received;
    }
    file.flush()
        .map_err(|err| cleanup(format!("write failed: {err}")))?;
    drop(file);

    if received != expected_size {
        return Err(cleanup(format!(
            "size mismatch: the pinned file is {expected_size} bytes, the server sent {received}"
        )));
    }
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        return Err(cleanup(
            "checksum mismatch — the downloaded bytes are not the pinned model"
                .into(),
        ));
    }
    std::fs::rename(&partial, &target)
        .map_err(|err| cleanup(format!("rename failed: {err}")))
}

/// Download one manifest file into the store. The sha256 pin is the real
/// integrity guarantee; the https/host check is defense in depth (the
/// redirect target — Hugging Face's CDN — inherits trust from it).
#[tauri::command]
pub async fn model_download(
    app: tauri::AppHandle,
    repo: String,
    path: String,
    url: String,
    sha256: String,
    size: u64,
) -> Result<(), String> {
    let rel = format!("{repo}/{path}");
    if !valid_rel(&rel) {
        return Err(format!("invalid model path: {rel}"));
    }
    if !url.starts_with("https://huggingface.co/") {
        return Err("refusing download: not a pinned huggingface.co URL".into());
    }
    {
        let mut transfer = TRANSFER.lock().unwrap();
        if transfer.active {
            return Err("a model download is already running".into());
        }
        *transfer = Transfer {
            bytes: 0,
            total: size,
            active: true,
        };
    }
    CANCEL.store(false, Ordering::SeqCst);
    let result = download_file(&app, &rel, &url, &sha256, size).await;
    TRANSFER.lock().unwrap().active = false;
    result
}

/// Progress of the running transfer (zeros when idle). The frontend polls
/// this — same transport pattern as native_poll.
#[tauri::command]
pub async fn model_store_poll() -> StoreProgress {
    let transfer = TRANSFER.lock().unwrap();
    StoreProgress {
        bytes: transfer.bytes,
        total: transfer.total,
        active: transfer.active,
    }
}

/// Abort the running transfer; the download loop removes the partial file.
#[tauri::command]
pub async fn model_store_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// True when an imported copy of this repo exists in the store. Presence
/// only — verification happened at import, and a manifest re-pin makes
/// the frontend's byte probe fail rather than load stale weights.
#[tauri::command]
pub async fn model_store_status(
    app: tauri::AppHandle,
    repo: String,
) -> Result<bool, String> {
    if !valid_rel(&repo) {
        return Err(format!("invalid repo: {repo}"));
    }
    Ok(store_root(&app)?.join(&repo).is_dir())
}

/// Remove an imported model (reclaim disk). Bundled resources are
/// untouched — this only ever deletes inside the app-data store.
#[tauri::command]
pub async fn model_delete(
    app: tauri::AppHandle,
    repo: String,
) -> Result<(), String> {
    if !valid_rel(&repo) {
        return Err(format!("invalid repo: {repo}"));
    }
    let dir = store_root(&app)?.join(&repo);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|err| err.to_string())?;
    }
    Ok(())
}
