// Verified model store: user-supplied weights, checked byte-for-byte
// against the pinned manifest before use (docs/model-download-plan.md).
// Import only for now — the optional downloader is a later increment on
// the same machinery. The store lives at app_data_dir()/models/{repo}/
// {path}, mirroring the bundle's resource layout; read_model_file and the
// native engine fall back here when a file is absent from resources, so
// an imported model needs no other plumbing.
//
// The frontend passes the manifest entry's repo/path/sha256/size — Rust
// never reads the manifest. The hash check runs on the store's own copy
// (copy first, then hash the copy, then rename), so the verified bytes
// are exactly the bytes that get loaded.

use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
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
