# Plan: user-initiated model import and download (verified against the manifest)

Status: both increments implemented (2026-08-29). Increment 1 (import):
`model_store.rs` (import/status/delete, verify-on-copy), the app-data
fallback in `read_model_file`/`resolve_model_path`, and the settings UI.
Increment 2 (download): `model_download`/`model_store_poll`/
`model_store_cancel` in `model_store.rs`, wrappers in `utils/tauri.ts`,
and the Download button with confirmation, progress, and cancel in the
settings. Scope grew beyond this plan: after GitHub's 2 GiB release-asset
cap broke the 1.13.1-0 release, installers bundle only the lite model and
every Llama (GGUF and ONNX, all platforms) goes through this store.
Multi-file ONNX models download file by file; import stays GGUF-only.
The claim change in "Changes, in order" step 4 is applied.

## Context

Windows installers cap near 2 GB (both NSIS and MSI), so the Windows bundle carries only the 1B GGUF — Windows users cannot get the 3B at all. Today the app's stance is absolute: "weights are a build-time input only; the app never downloads weights at runtime."

This plan relaxes that stance carefully, in two increments: first an **offline import** (user supplies the file, the app verifies it), then an optional **downloader** on top of the same machinery. The compliance story stays defensible: evidence and notes still never leave the machine, network happens only on an explicit user request for one named, sha256-pinned artifact, and air-gapped organizations are served by the import path with no network claim change at all. Precedent: the app already talks to keygen.sh for license activation, so "no network ever" was never the claim — "no evidence leaves, no silent network" is, and both survive.

## Decisions

- Import first, download second. Both verify against the same pinned manifest entry (`url`, `size`, `sha256` — already recorded for every file) and share one storage location.
- Storage: `app_data_dir()/models/{repo}/{path}`, mirroring the resource layout. Bundle resources win when both exist; app-data is a fallback location, not an override.
- Scope v1: pinned GGUF models absent from the local bundle, on native builds — concretely, the 3B on Windows. ONNX models for the Intel-mac webview build are out of scope (same mechanism would extend there later).
- The downloader lives in the Rust process (reqwest is already a dependency via licensing): stream to a `.partial` file, hash while streaming, rename only on a verified hash, delete on mismatch or cancel. Https-only and the manifest URL's host pinned as defense in depth (the sha256 is the real guarantee).
- No resume in v1. A failed 2 GB download restarts; the `.partial` is cleaned up. Range-resume is a later increment if field reports demand it.

## Changes, in order

### 1. Rust: app-data fallback for the model store

- `read_model_file` and `resolve_model_path` (src-tauri lib.rs / native.rs) try `resource_dir()/models/<path>` first, then `app_data_dir()/models/<path>`. Same containment validation. This alone makes every existing probe (`resolveWeightSource`'s 64-byte read) and `native_load` work for imported models with no frontend changes.

### 2. Rust: verified store commands

New module (model_store.rs), same poll pattern as native.rs:

- `model_import(repo, path, sha256, size)` — native open dialog (tauri-plugin-dialog, already used), stream-hash the picked file, reject on size/hash mismatch, copy into app-data. Returns the verified state.
- `model_download(repo, path, url, sha256, size)` — blocks until done or error; a `model_store_poll()` command reports `{ bytes, total }` for progress; `model_store_cancel()` aborts and removes the `.partial`. One transfer at a time.
- `model_delete(repo)` — remove the app-data copy (reclaim disk); refuses paths outside `app_data_dir()/models`.

The frontend passes the manifest entry's fields; Rust never reads the manifest itself. Validation: https URL, host from the manifest entry, relative forward-slash paths (same rules as `read_model_file`).

### 3. Frontend: settings UI

`model_settings.tsx`, for a pinned model whose weights probe absent on a native build:

- Replace the bare "(not available in this build)" state with: size + license notice line (`licenseNotice`/`licenseUrl` from the manifest), an "Import model file…" button, and a "Download (X GB)" button with an explicit confirmation naming the source domain.
- Progress row while a transfer runs (poll-driven, like the load progress), with cancel.
- A "Remove downloaded model" row when the weights live in app-data.
- After import/download completes: re-run the weights probe so the picker enables the model without a page reload.

`utils/tauri.ts` gains the wrappers (`modelImport`, `modelDownload`, `modelStorePoll`, `modelStoreCancel`, `modelDelete`), browser no-ops as usual.

### 4. Docs

`docs/local-ai.md`:

- Overview: replace "The app never downloads weights at runtime" with: weights ship in the installer; a user can explicitly import or download an additional pinned model; every byte is verified against the manifest before use; nothing downloads without a user action.
- Privacy checklist: the zero-network audit during summarize/review is unchanged. Add: trigger a model download and confirm exactly one host is contacted, and only then; confirm the import path works fully offline.
- Air-gap note: import is the supported path; the file can arrive by any approved transfer mechanism.

## Risks

- Weakened claim: "never downloads" becomes "downloads only on explicit request". This is the real cost; the docs change is the mitigation, and the import-only subset carries no claim change at all — the downloader could ship dark (feature-flagged) if the claim needs more review time.
- Manifest revision bumps orphan app-data copies (hash no longer matches): the probe must treat a mismatched app-data file as absent and the UI offer re-download/delete, not load unverified bytes.
- 2 GB single-shot downloads fail on flaky links (no resume in v1); the retry story is "start over". Windows Defender scans large writes — expect slow final rename on some machines.
- Disk space: check free space against `size` before starting; fail with a clear message.

## Verification

1. Import: wrong file rejected (size fast-path, then hash), correct file accepted; picker enables the 3B; `native_load` runs it from app-data; breadcrumb shows the load.
2. Download: happy path with progress; cancel mid-transfer removes the `.partial`; kill the network mid-transfer and confirm a clean error and retry; tamper with a byte (proxy) and confirm hash rejection.
3. Precedence: with the same model in resources and app-data, resources load; delete the app-data copy of a bundled model is refused/no-op.
4. Privacy: mitmproxy audit — zero requests during summarize/review/draft; exactly one host during an explicit download; import path with network disabled entirely.
5. Manifest bump: re-pin the 3B GGUF to a new revision, confirm the stale app-data copy reads as absent with a re-download offer.
6. Windows end-to-end: fresh install (0.81 GB bundle), download the 3B, generate; uninstall/reinstall keeps the app-data model usable (hash still matches).
