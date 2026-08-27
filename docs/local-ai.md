# Local AI: evidence-based control summaries

## Overview

The app can draft a control narrative from the evidence that is attached to a requirement. A small language model runs fully on the user's device. Evidence and notes never leave the machine. The models are US-developed (Meta Llama, Google Gemma). The feature is available on full-tier builds only. The free web tier does not register a model.

## Architecture

- Runtime: `@huggingface/transformers` (ONNX Runtime Web) in a Web Worker (`client/src/app/llm/worker.ts`). The runtime uses WebGPU when available, with a WASM fallback.
- The ONNX WASM binaries ship in the app bundle at `/ort/`. The script `client/scripts/copy-ort-assets.mjs` copies them from node_modules on each build. The runtime never fetches them from a CDN.
- Weights: pinned in `client/src/app/llm/models.manifest.json` (URL, revision, size, sha256 for each file). This manifest is the single source of truth for:
  - `flake.nix` — fetches each file as a fixed-output derivation and bundles the weights into the desktop app at `public/models/`.
  - `client/src/app/llm/engine.ts` — the browser downloader. It verifies each file's sha256 before it caches the file.
  - `scripts/fetch-model-weights.mjs` — verified weight fetch for the Windows and macOS CI jobs.
- Consumers reach the model through the `LocalModel` seam in `client/src/app/ai/model.ts`. The engine registers itself there when the weights load. The RAG review layer (`docs/rag-review-plan.md`) builds on the same seam.
- Prompt assembly (`client/src/app/llm/prompt.ts`): evidence text comes from the `evidence_text` IndexedDB store. Chunks are ranked with the hand-rolled BM25 index (`TextIndex.searchAny`). The budget is 4,096 context tokens with 512 reserved for output.
- UI: a "Draft from evidence" button on the requirement page opens the draft panel (`client/src/app/components/ai/draft_panel.tsx`). The user reviews the streamed draft, then inserts it into a description field. Insertion goes through the normal autosave path. Nothing persists until the user inserts. Model download and deletion live in the "AI Assistant" menu entry.

## One-time setup after this change

The build sandbox for this change had no network. Complete these steps in `nix develop`:

1. Run `cd client && npm install`. This updates `package-lock.json` for `@huggingface/transformers`. Confirm that the pinned version exists. If npm reports that version `3.7.5` does not exist, pick the latest 3.x version and pin it exactly.
2. Pin the models:
   - `node scripts/update-model-manifest.mjs --id llama-3.2-1b-instruct`
   - `node scripts/update-model-manifest.mjs --id gemma-3-270m-it`
3. Review the manifest diff. Commit it like a lockfile change.
4. If a repo name or file layout changed upstream, correct the `repo` or `dtype` field in the manifest first. Then run the script again.

## Service worker

`client/public/sw.js` does not cache requests to huggingface.co or hf.co hosts. The engine stores verified weights in the persistent `transformers-cache` bucket instead. The release purge of the build-stamped cache must not evict weights.

## Device policy

- The 1B model requires WebGPU. Chromium, WebView2, and recent WKWebView provide it.
- Linux webkitgtk has no WebGPU. Those machines can use the lite model on WASM only.
- GitHub Pages cannot set COOP/COEP headers, so threaded WASM is not available on the web build.

## Verification checklist

1. Privacy audit (critical). Complete the model download. Set DevTools to offline mode. Run a full summarize. It must succeed with zero network requests. During the download, only huggingface hosts appear, with GET requests only. Repeat once inside Tauri behind a proxy such as mitmproxy.
2. Fresh-profile flow. Open the AI Assistant menu entry. Consent, download, generate, insert. Reload and confirm that the inserted note persisted. Delete the model and confirm that the download button returns. Inspect `caches.keys()`: weights live only in `transformers-cache`, never in the build-stamped cache.
3. Release-upgrade simulation. Bump the build id and reload. Confirm that the service worker purge does not evict the weights.
4. Nix. Run `nix build .#model-weights`. It must fetch and verify the pinned files. Run `nix build`. The desktop app must summarize with no network access. Corrupt one hash in the manifest and confirm that the build fails with a hash mismatch.
5. Matrix. Test Chrome with WebGPU, Chrome with `--disable-features=WebGPU` (WASM plus lite model), the free-tier build (feature absent), and Tauri on each OS.
6. Regression. Confirm that evidence attach, text extraction, search, and exports are unaffected. The feature is additive and lazy.

## Known limits

- The summarizer reads extracted text only. Image-only evidence appears in the panel as "no readable text".
- A stopped generation keeps the partial draft. The user can still insert or regenerate.
- One generation runs at a time. The engine rejects a second concurrent request.
