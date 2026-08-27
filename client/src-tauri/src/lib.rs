use base64::Engine as _;
use tauri_plugin_dialog::DialogExt;
#[cfg(not(target_os = "linux"))]
use tauri_plugin_opener::OpenerExt;

mod license;
mod update;

// File bytes cross the IPC bridge base64-encoded: serde parses one string
// instead of a JSON number per byte, which stalled on 100MB+ exports.
fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|err| err.to_string())
}

// Launch the XDG opener directly instead of going through the opener plugin.
// Two Linux-specific problems with the plugin path:
//  - The Nix wrapper points library/module env vars at the app's own
//    (webkit-pinned) GTK stack. Spawned children inherit them, so the helper
//    and the viewer it launches load mismatched libraries and die before
//    showing anything — scrub those vars from the child environment.
//  - The plugin's detached spawn reports success the moment xdg-open starts,
//    so those failures never surfaced. Waiting on the exit status gives the
//    frontend a real error (and its in-app fallback) instead of a silent no-op.
// Handler and content-type lookup walk $XDG_DATA_DIRS for .desktop entries
// and the shared-mime-info database, and the inherited value is only as good
// as the launching environment — `nix run` from a shell that had clobbered
// the variable left gio typing every file as application/octet-stream with
// no handler. Append the standard host locations whenever they're missing:
// order preserved, nothing removed, harmless where a dir doesn't exist. This
// lives here rather than in the Nix wrapper because the wrapper is a
// compiled binary with no launch-time scripting (no --run).
#[cfg(target_os = "linux")]
fn augmented_xdg_data_dirs() -> String {
    let current = std::env::var("XDG_DATA_DIRS").unwrap_or_default();
    let mut dirs: Vec<String> = current
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(String::from)
        .collect();

    let mut standard = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        standard.push(format!("{home}/.local/share/flatpak/exports/share"));
        standard.push(format!("{home}/.nix-profile/share"));
    }
    if let Ok(user) = std::env::var("USER") {
        standard.push(format!("/etc/profiles/per-user/{user}/share"));
    }
    standard.extend(
        [
            "/var/lib/flatpak/exports/share",
            "/var/lib/snapd/desktop",
            "/nix/var/nix/profiles/default/share",
            "/run/current-system/sw/share",
            "/usr/local/share",
            "/usr/share",
        ]
        .map(String::from),
    );

    for dir in standard {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

#[cfg(target_os = "linux")]
fn open_with_system_handler(target: &std::ffi::OsStr) -> Result<(), String> {
    // Wrapper-set vars pointing at the app's own (webkit-pinned) GTK stack;
    // the launched viewer must load the host's libraries, not ours.
    const WRAPPER_VARS: &[&str] = &[
        "LD_LIBRARY_PATH",
        "GIO_MODULE_DIR",
        "GIO_EXTRA_MODULES",
        "GDK_PIXBUF_MODULE_FILE",
        "GI_TYPELIB_PATH",
        "GSETTINGS_SCHEMA_DIR",
    ];
    let data_dirs = augmented_xdg_data_dirs();
    let mut errors = Vec::new();
    for (program, args) in [("xdg-open", &[][..]), ("gio", &["open"][..])] {
        let mut command = std::process::Command::new(program);
        command.args(args).arg(target);
        command.env("XDG_DATA_DIRS", &data_dirs);
        for var in WRAPPER_VARS {
            command.env_remove(var);
        }
        match command.status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => errors.push(format!("{program}: exited with {status}")),
            Err(err) => errors.push(format!("{program}: {err}")),
        }
    }
    Err(errors.join("; "))
}

// Open a URL in the user's default browser. Invoked from the frontend; runs
// Rust-side so it isn't subject to the opener plugin's JS capability scope.
// async so the Linux path can wait on the opener without holding up the main
// thread.
#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = &app;
        return open_with_system_handler(std::ffi::OsStr::new(&url));
    }
    #[cfg(not(target_os = "linux"))]
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| err.to_string())
}

// Write an evidence artifact to a temp file and open it in the OS default
// application. The webview can't open the blob URLs the web build uses, so the
// desktop app round-trips the bytes through disk instead. async so the Linux
// path can wait on the opener without holding up the main thread.
#[tauri::command]
async fn open_evidence(
    app: tauri::AppHandle,
    filename: String,
    data_b64: String,
) -> Result<(), String> {
    let data = decode_base64(&data_b64)?;
    let safe_name = std::path::Path::new(&filename)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "evidence".to_string());

    let mut path = std::env::temp_dir();
    path.push("cmmc-evidence");
    std::fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    path.push(safe_name);
    std::fs::write(&path, &data).map_err(|err| err.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = &app;
        return open_with_system_handler(path.as_os_str());
    }
    #[cfg(not(target_os = "linux"))]
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|err| err.to_string())
}

// Prompt for a destination and write a single exported file (report, POA&M,
// database, evidence map, …). Returns false if the user cancels the dialog.
// async so it runs off the main thread — the blocking dialog calls need the
// main thread free to pump the native dialog.
#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    filename: String,
    data_b64: String,
) -> Result<bool, String> {
    let data = decode_base64(&data_b64)?;
    match app.dialog().file().set_file_name(&filename).blocking_save_file() {
        Some(path) => {
            let path = path.into_path().map_err(|err| err.to_string())?;
            std::fs::write(&path, &data).map_err(|err| err.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

// Prompt for a JSON file and return its contents (database import). The
// webview's <input type=file> is unreliable in the desktop shell — WebView2
// derives its dialog filter from the accept MIME type via the registry, and
// when .json has no mapping there the dialog hides *.json entirely — so
// import uses the native dialog like the save paths do. Returns None when
// the user cancels.
#[tauri::command]
async fn open_json_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    {
        Some(path) => {
            let path = path.into_path().map_err(|err| err.to_string())?;
            let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
            Ok(Some(text))
        }
        None => Ok(None),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutgoingFile {
    filename: String,
    data_b64: String,
}

// Prompt for a folder and write several files into it (bulk evidence export),
// so the user picks a destination once instead of per file.
#[tauri::command]
async fn save_files(
    app: tauri::AppHandle,
    files: Vec<OutgoingFile>,
) -> Result<bool, String> {
    match app.dialog().file().blocking_pick_folder() {
        Some(folder) => {
            let dir = folder.into_path().map_err(|err| err.to_string())?;
            for file in files {
                let name = std::path::Path::new(&file.filename)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| "evidence".to_string());
                let data = decode_base64(&file.data_b64)?;
                std::fs::write(dir.join(name), &data).map_err(|err| err.to_string())?;
            }
            Ok(true)
        }
        None => Ok(false),
    }
}

// Stderr breadcrumbs for the local-AI path. The webview's console is
// invisible in release builds on webkitgtk, and the web-process crash under
// investigation takes the console down with it — stderr from the host
// process survives and shows in the launching terminal. Timestamped so
// stages can be correlated with the crash moment.
#[tauri::command]
fn ai_debug_log(message: String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    eprintln!("[ai {}.{:03}] {message}", now.as_secs(), now.subsec_millis());
}

// Model weights ship as bundle resources (resource_dir()/models — see
// tauri.conf.json), NOT as embedded frontend assets: generate_context!
// compiles everything under ../out into the binary, and gigabytes of
// weights there blow rustc's memory (OOM SIGKILL) and would bloat the
// executable. The webview reads the files through this command instead.
// async so a large read never blocks the main thread.
// Returns the bytes base64-encoded, matching the app's other large IPC
// payloads (see decode_base64 above): a raw-bytes tauri::ipc::Response of a
// 300 MB weight file killed the WebKitWebProcess outright, while base64
// strings are the pattern this app already ships >100 MB exports through.
// Optional offset/len window a chunked read: the engine reads big weight
// files in bounded slices so no single IPC message carries hundreds of MB.
#[tauri::command]
async fn read_model_file(
    app: tauri::AppHandle,
    path: String,
    offset: Option<u64>,
    len: Option<u64>,
) -> Result<String, String> {
    use tauri::Manager;
    // Relative, forward-slash paths from the manifest only — reject anything
    // that could escape the models directory.
    let valid = !path.is_empty()
        && !path.contains('\\')
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    if !valid {
        return Err(format!("invalid model path: {path}"));
    }
    let file = app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?
        .join("models")
        .join(&path);
    let data = match (offset, len) {
        (Some(offset), Some(len)) => {
            use std::io::{Read, Seek, SeekFrom};
            let mut handle =
                std::fs::File::open(&file).map_err(|err| format!("{path}: {err}"))?;
            handle
                .seek(SeekFrom::Start(offset))
                .map_err(|err| format!("{path}: {err}"))?;
            let mut buffer = Vec::with_capacity(len as usize);
            handle
                .take(len)
                .read_to_end(&mut buffer)
                .map_err(|err| format!("{path}: {err}"))?;
            buffer
        }
        _ => std::fs::read(&file).map_err(|err| format!("{path}: {err}"))?,
    };
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's memory-pressure monitor kills the web process at
    // conservative thresholds, and loading the local-AI model weights
    // (hundreds of MB in the inference worker + ONNX Runtime's heap) trips
    // it even with plenty of free RAM. Must be set before the first webview
    // spawns. The Nix wrapper also sets it, but .deb/.rpm installs launch
    // the binary directly.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_MEMORY_PRESSURE_MONITOR").is_none() {
        std::env::set_var("WEBKIT_DISABLE_MEMORY_PRESSURE_MONITOR", "1");
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    // Self-update only where the updater supports in-place installs; Linux
    // (.deb/.rpm, no AppImage) is notify-only and never loads the plugin.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::PendingUpdate::default());

    builder
        .invoke_handler(tauri::generate_handler![
            ai_debug_log,
            open_external,
            open_evidence,
            open_json_file,
            read_model_file,
            save_file,
            save_files,
            license::license_status,
            license::license_key_reveal,
            license::license_activate,
            license::license_import,
            license::license_refresh,
            license::license_deactivate,
            update::update_check,
            update::update_install,
            update::update_restart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
