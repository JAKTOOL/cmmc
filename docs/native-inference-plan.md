# Plan: native inference on Linux desktop (llama.cpp behind the LocalModel seam)

Status: planned, not implemented (2026-08-28).

## Context

The Linux desktop app runs WebKitGTK, which reports no WebGPU or a 1 GiB buffer limit. Linux users therefore get the lite model on WASM — the weakest configuration — while the same hardware runs the 1B at a 3,200-token window in Chromium (measured: AMD 780M, RADV, `maxStorageBufferRange` 4 GiB−1, heaps ~10 GiB). The webview is the only bottleneck.

`client/src/app/llm/protocol.ts` was built for this moment: its header says the message shapes are transport-agnostic so "a future native path (llama.cpp behind a Tauri command) can speak the same shapes over IPC instead of postMessage". This plan implements that path. Inference moves into the Rust process, where the GPU is reached directly through Vulkan. The webview stays WebKitGTK and only renders UI.

## Decisions

- Runtime: **llama.cpp with the Vulkan backend, in-process** via the `llama-cpp-2` Rust bindings. No local HTTP server (`llama-server`) — an in-process library keeps the zero-network privacy audit trivial and avoids port management.
- Why not native ONNX Runtime: it would reuse the pinned ONNX weights, but it has no workable GPU path for AMD APUs on Linux (CUDA and DirectML are wrong-platform, ROCm does not cover gfx1103-class iGPUs). llama.cpp's Vulkan backend is mature on RADV.
- Weights: **GGUF Q4_K_M** variants of the same models, pinned in `models.manifest.json` as separate entries with `bundlePlatforms: ["linux"]`. Sizes: 1B ~0.8 GB, 3B ~2.0 GB. Select the source repo at pin time (candidates: `bartowski/…-GGUF`, `unsloth/…-GGUF`; the "US-developed" claim concerns the model, not the quantizer). Review the manifest diff like a lockfile.
- Linux bundle composition changes: the llama ONNX entries gain `bundlePlatforms` that exclude linux (1B ONNX → `["darwin", "win32"]`, 3B ONNX → `["darwin"]`). Gemma ONNX stays on all platforms as the universal fallback. Net Linux bundle: ~0.6 GB ONNX + ~2.8 GB GGUF.
- Device model: `LlmDevice` gains `"native"`. Detection asks the shell (a `native_probe` Tauri command) instead of the webview. GGUF entries get `minDevice: "native"`, so the existing `usableDevice`/`resolveUsableModel` machinery gates them: on Linux desktop the ONNX llama entries stay unusable (webview limits) and the GGUF entries take over; in browsers the GGUF entries never appear.
- Context window: native entries use `MAX_CONTEXT_TOKENS` (6,144) as `n_ctx`. No adapter-limit math applies — the constraint is KV-cache memory (~700 MB for the 3B at 6,144), well inside the measured heaps. The evidence budgets already scale through `evidenceCharBudget`, so prompts grow with no further change. A larger native-only window is a later, separate decision.
- CPU fallback is free: when Vulkan is absent, llama.cpp runs on CPU with SIMD — still far faster than WASM in the webview. `native_probe` reports which backend it got; both count as `"native"`.

## Changes, in order

### 1. `models.manifest.json` — GGUF stub entries

Append stubs for `llama-3.2-1b-instruct-gguf` and `llama-3.2-3b-instruct-gguf`: `format: "gguf"`, `minDevice: "native"`, `bundlePlatforms: ["linux"]`, empty `revision`/`files` (invisible until pinned). Adjust the ONNX llama entries' `bundlePlatforms` as decided above. Extend the manifest note.

### 2. `scripts/update-model-manifest.mjs` — format-aware file enumeration

The required-file logic enumerates the `onnx/` tree today. For `format: "gguf"` entries it must instead pin the single `.gguf` file (plus nothing else — GGUF embeds tokenizer and chat template). `fetch-model-weights.mjs` and `flake.nix` iterate manifest files generically and need no format logic, but `flake.nix` must learn the `bundlePlatforms` filter (it currently takes every pinned model; after step 1 it would otherwise still bundle the ONNX llamas on Linux).

### 3. `src-tauri` — the native engine

New module behind three commands plus a stream:

- `native_probe()` → `{ available, backend: "vulkan" | "cpu" }`. Loads nothing; checks the library and enumerates devices.
- `native_load(modelPath, nCtx)` → loads the GGUF from `resource_dir()/models/…` (mmap keeps RSS low), reports progress events.
- `native_generate(requestId, messages, maxNewTokens)` → applies the GGUF's embedded chat template (`llama_chat_apply_template`), streams tokens over a Tauri channel, ends with the same `done`/`error(fatal)` semantics as the worker.
- `native_abort(requestId)` → cooperative cancel, same contract as `InterruptableStoppingCriteria`.

Dependencies: `llama-cpp-2` in `Cargo.toml`; llama.cpp with Vulkan from nixpkgs in the flake (build inputs + runtime `vulkan-loader`). The deb/rpm packaging must declare the Vulkan loader dependency.

### 4. `client/src/app/llm/` — transport seam

- `engine.ts`: extract the postMessage plumbing into a `Transport` interface that speaks `ToWorker`/`FromWorker`. The existing worker becomes `WorkerTransport`; add `NativeTransport` (Tauri `invoke` + event channel). `ensureLoaded` picks the transport from the resolved device. Everything above the transport — status store, request queue, `LocalModel` adapter, fingerprints — is untouched.
- `capabilities.ts`: when `isTauri()`, call `native_probe` first; `"native"` wins over the webview probe when available and a native-format model is present.
- `config.ts`: `format?: "gguf"` on `LlmModel`, `"native"` in `LlmDevice`, `contextTokensFor` returns `MAX_CONTEXT_TOKENS` for native, `LOGIT_BYTES_PER_TOKEN` entries for the GGUF ids (used only for logging), and the `resolveUsableModel` default chain gains the native 1B before the ONNX default.

### 5. Docs

Update `docs/local-ai.md`: the Linux row of the build-path table, the device-policy section (native path, CPU fallback, window), and the privacy checklist (the audit now also covers the Rust process — llama.cpp makes no network calls; verify behind mitmproxy as usual).

## Risks

- Template parity: the GGUF chat template must produce the same conversation shape as `tokenizer.apply_chat_template` in the worker. A divergence changes prompt behavior between platforms. Verify with a fixture prompt on both paths.
- Token-count parity: the prompt builders budget in tokens via `CHARS_PER_TOKEN` estimates and the worker re-trims with the real tokenizer. The native path must expose a count/trim step with the llama.cpp tokenizer, or over-long prompts truncate at `n_ctx` silently.
- Version coupling: `llama-cpp-2` tracks llama.cpp closely; pin both (crate version + nixpkgs llama.cpp) and bump them together.
- Model identity: GGUF entries carry new ids, so summaries and review verdicts regenerate once on Linux after the switch. Same behavior as any model change; document it.
- Q4_K_M is a different quantization than q4f16 ONNX. Verdicts can differ slightly across platforms for the same evidence. Acceptable — the fingerprint records the model id — but worth a spot-check during verification.

## Verification

1. Privacy audit: full summarize + review in the Tauri app behind mitmproxy. Zero network from both the webview and the Rust process.
2. Parity: one fixture requirement reviewed on Chromium/WebGPU (ONNX) and Linux desktop (GGUF). Compare prompts token-for-token where the template allows; compare verdicts for sanity, not equality.
3. Performance: tokens/sec on the 780M for 1B and 3B GGUF via Vulkan; then force CPU (`native_probe` override) and confirm usable 1B speeds. Record numbers in `local-ai.md`.
4. Abort: stop a native generation mid-stream; confirm the partial draft survives and a new run starts cleanly.
5. Fallback: break the native probe (rename the GGUF) and confirm the app degrades to the lite model on WASM with the settings hint, not an error.
6. Packaging: `nix build` bundles GGUF + gemma ONNX only on Linux; deb/rpm install and run on a non-NixOS distro with only the distro Vulkan loader.
