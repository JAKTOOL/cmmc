# Plan: add Llama 3.2 3B Instruct as an opt-in large model

Status: in progress (2026-08-28). Updated for the adaptive context window
(`contextTokensFor` in `client/src/app/llm/config.ts`), which replaced the
fixed `CONTEXT_TOKENS` window this plan originally assumed.

## Context

The summarizer tops out at Llama 3.2 1B (q4f16, ~1.1 GB, WebGPU). Gemma 3 270M is the WASM fallback. A larger model improves draft quality. Decisions:

- Model: `onnx-community/Llama-3.2-3B-Instruct-ONNX`, dtype `q4f16`, ~2.4 GB. Verified against the Hugging Face API: `onnx/model_q4f16.onnx` (0.3 MB), `onnx/model_q4f16.onnx_data` (2,095.9 MB), `onnx/model_q4f16.onnx_data_1` (311.4 MB). Two external data chunks.
- Llama 3B was chosen over Qwen3 4B to keep the "models are US-developed" claim in `docs/local-ai.md` true. Phi-4-mini was rejected because its 200k vocabulary raises prefill-logits memory (~0.8 MB per input token). Under the adaptive window (`contextTokensFor`, keyed by `LOGIT_BYTES_PER_TOKEN`), a large vocabulary shrinks the window on every adapter tier — Gemma's 262k vocabulary already demonstrates this. Llama 3B shares the 1B's 128k vocabulary, so it inherits the 1B's window at every tier.
- The model ships alongside the current models as an opt-in choice. Llama 1B stays `DEFAULT_MODEL_ID`.
- Windows bundles do not include the model. The Windows NSIS installer has a hard ~2 GB limit. Current weights (~1.66 GB) plus 2.4 GB cannot fit. macOS and Linux bundles include it.

## Verified groundwork (no code change needed)

- The pipeline is manifest-driven. `flake.nix` iterates pinned models. `scripts/fetch-model-weights.mjs` fetches and prunes from the manifest. `client/scripts/strip-model-assets.mjs` strips all of `out/models`. `tauri.conf.json` bundles the whole `public/models` directory.
- `scripts/update-model-manifest.mjs` requires a stubbed entry and only overwrites `revision`, `files`, and `totalBytes`. Hand-authored fields survive re-pinning. Its file filter captures all three ONNX chunks.
- The runtime detects absent weights. `resolveWeightSource` (`client/src/app/llm/engine.ts:30`) probes the real file over IPC. `model_settings.tsx` shows "(not available in this build)" and blocks selection when weights are missing.
- `externalDataChunks()` in `config.ts` and the worker option `use_external_data_format` already handle multi-chunk models.
- Llama 3B shares the 1B chat template, vocabulary (128k), and license machinery. No worker, protocol, or engine changes.
- The context window is per-model and per-device: `contextTokensFor` (`config.ts`) scales it from the adapter's buffer limit and the model's `LOGIT_BYTES_PER_TOKEN` entry. The 3B shares the 1B's 128,256 vocabulary, so it gets the 1B's window on any adapter: 3,200 tokens on a 4 GiB-limit adapter, the 2,560 floor at 2 GiB, and unusable (falls back) below ~1.5 GiB. The KV cache scales with the window: ~294 MB at 2,560 grows to ~705 MB at the 6,144 cap. Peak GPU use at the floor window is ~3.2 GB.

## Changes, in order

### 1. `client/src/app/llm/models.manifest.json` — stub the entry

Append after the gemma entry:

```json
{
    "id": "llama-3.2-3b-instruct",
    "label": "Llama 3.2 3B Instruct (large)",
    "repo": "onnx-community/Llama-3.2-3B-Instruct-ONNX",
    "revision": "",
    "dtype": "q4f16",
    "minDevice": "webgpu",
    "bundlePlatforms": ["darwin", "linux"],
    "license": "Llama 3.2 Community License",
    "licenseNotice": "Built with Llama",
    "licenseUrl": "https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct-ONNX",
    "totalBytes": 0,
    "files": []
}
```

Empty `revision` and `files` keep the entry invisible to builds (`isPinned` is false). The stub is safe to commit before pinning. Update the manifest `note` to describe `bundlePlatforms`.

### 2. `client/src/app/llm/config.ts` — type the new field, wire the window

Add to `LlmModel` after `minDevice`:

```ts
/** Node process.platform values whose desktop bundles include the weights.
 *  Absent = all platforms. Runtime never reads this — missing weights are
 *  detected by probing (engine.ts resolveWeightSource); this field only
 *  drives build-time fetching. */
bundlePlatforms?: string[];
```

Two adaptive-window integrations in the same file:

- Add `"llama-3.2-3b-instruct": 128256 * 4` to `LOGIT_BYTES_PER_TOKEN`. Without the entry, the fallback constant assumes a 262k vocabulary and under-sizes the 3B's window.
- Change the `resolveUsableModel` candidate list from `[selectedId, LITE_MODEL_ID]` to `[selectedId, DEFAULT_MODEL_ID, LITE_MODEL_ID]`. A device that cannot run the 3B then falls back to the 1B, not all the way to the lite model.

### 3. `scripts/fetch-model-weights.mjs` — honor `bundlePlatforms`

Extend the `pinned` filter (line ~43) with `!model.bundlePlatforms || model.bundlePlatforms.includes(process.platform)`. Excluded models must count as unlisted for the existing prune step. A Windows machine that fetched the 3B before then removes it. Tauri builds run on the target OS, so `process.platform` is the correct signal.

Check `scripts/sync-models.mjs` for a second iteration point. If it fetches independently, apply the same filter.

`flake.nix` needs no change. Nix builds are the Linux path, and Linux includes the model. Confirm that the macOS CI job uses `npm run models`, per `docs/local-ai.md`.

### 4. `client/src/app/components/ai/model_settings.tsx` — memory advisory

The picker picks up the new entry automatically, and the windowing work already added the availability labels: "(needs WebGPU)" when no adapter exists and "(needs more GPU memory)" when `usableDevice` rejects the adapter's buffer limit. Only the size advisory is new. Add one manifest-driven advisory near the bundled-weights row when the selected model is large:

```tsx
{model.totalBytes >= 2e9 && (
    <p className="text-xs text-muted-foreground">
        Large model: needs roughly 4 GB of GPU memory. If generation
        fails with an out-of-memory error, switch back to the default
        model.
    </p>
)}
```

Do not add a `shaderF16` hard gate. Without shader-f16 the model runs slower through fp32 emulation, or fails with an out-of-memory error. That error already surfaces through the fatal-error recovery: worker disposal, error status, and a model switch in settings.

### 5. Pin and fetch

```
cd client && npm run models:sync -- --id llama-3.2-3b-instruct
```

The script resolves upstream HEAD, hashes the files, writes `revision`, `files`, and `totalBytes`, then fetches into `client/public/models/`. Expect seven files (four config/tokenizer and three ONNX) at ~2.4 GB total. On a Nix machine, the hash pass runs through `nix store prefetch-file`, so the ~2.4 GB downloads once into the Nix store and the fetch pass copies from there. Without Nix, the process streams ~2.4 GB twice (one hash pass, one fetch pass). Review the manifest diff like a lockfile.

### 6. `docs/local-ai.md` — update

- Add the 3B to the model list as the opt-in large model. Keep the "US-developed" sentence.
- Note the platform split: Windows desktop builds do not bundle the 3B (NSIS ~2 GB installer limit). The app shows it as "not available in this build" there.
- Note installer growth on macOS and Linux (~+2.4 GB).

## Risks

- Window heuristic blind spot: `contextTokensFor` budgets only the logits' share of the adapter's *buffer limit*. It does not know weights size or free VRAM. A 4 GiB-limit adapter admits the 3B at a 3,200-token window while the weights alone are 2.4 GB. A real-VRAM OOM surfaces through the existing fatal-error recovery (worker disposed, error status, model switch in settings), and the memory advisory names the way out. Adapters with 1 GiB limits (Linux webkitgtk today) mark the 3B unusable up front, and the fallback chain runs the 1B or lite model instead.
- ORT-web wasm32 heap ceiling: session creation stages ~2.4 GB of external data inside a 4 GB wasm32 heap before weights move to the GPU. A load-time failure surfaces cleanly as an error status. Test the real load early, before UI polish.
- Desktop IPC peak memory: `readResourceFile` assembles the 2,096 MB shard in the webview before transfer. Expect ~2+ GB transient webview memory on load. Observe on an 8 GB machine.
- CI artifact growth: the macOS dmg and the Linux AppImage/deb grow ~+2.4 GB. Confirm that `warm-cache.yml` and release storage tolerate the size.

## Verification

1. After step 5, confirm that the manifest entry has seven files, `totalBytes` ≈ 2.4e9, and no empty sha256 values.
2. Run `npm run dev` in `client/` and open the AI Assistant settings. Confirm that the 3B appears and is selectable on a WebGPU browser with a large adapter limit, and that it renders the memory advisory, size, and license lines. Confirm the disabled labels: "(needs WebGPU)" with no adapter, "(needs more GPU memory)" on a small-limit adapter (Linux webkitgtk), "(not available in this build)" without weights.
3. Run a summarize pass on a WebGPU machine with a GPU of 6 GB or more. Confirm that the debug log shows `load: repo=onnx-community/Llama-3.2-3B-Instruct-ONNX dtype=q4f16 ... externalDataChunks=2`, that output streams, and that tokens per second are sane.
4. Test the out-of-memory path on a ~4 GB GPU, or lower `RAISE_HEADROOM_DIVISOR` temporarily to force a larger window. Confirm the sequence: fatal error, worker disposed, error shown in settings, and a clean recovery after a switch back to Llama 1B.
4a. Test the fallback chain: select the 3B on a small-limit adapter and confirm the 1B runs (settings modal shows the "runs instead" hint); on a WASM-only browser confirm the lite model runs.
5. Test the platform filter. Run `npm run models` on Windows (or force `process.platform` to `win32`) and confirm that the 3B is skipped and pruned. On Linux and macOS, confirm that it fetches. In a weights-absent build, confirm that the picker shows "(not available in this build)".
6. Build the desktop app on Linux or macOS. Confirm that the IPC path streams the 2 GB shard with progress and that generation works. Confirm that the Windows CI bundle stays under the NSIS limit.
