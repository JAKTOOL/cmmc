// Copies ONNX Runtime's WASM binaries (and their loader modules) out of
// @huggingface/transformers into public/ort/, so the inference worker loads
// them from the app's own origin. Without this, transformers.js fetches them
// from a CDN at runtime — forbidden here (see utils/pdf.ts for the same
// rule applied to pdf.js). Runs as npm predev/prebuild, cwd = client.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Two sources: transformers.js ships only the JSEP (WebGPU-bridging) build;
// onnxruntime-web's own dist adds the plain ort-wasm-simd-threaded pair the
// worker prefers for CPU-only sessions (the JSEP build's async machinery
// crashes JavaScriptCore — see docs/local-ai.md). Same onnxruntime-web
// version either way, so glue and JS stay compatible.
const SOURCES = [
    "node_modules/@huggingface/transformers/dist",
    "node_modules/onnxruntime-web/dist",
];
const TARGET = "public/ort";
// All runtime variants: plain (CPU), jsep (WebGPU), and onnxruntime-web
// 1.26+'s jspi/asyncify splits — the runtime picks one at load time and
// only the chosen pair is ever fetched.
const WANTED = /^ort-wasm-simd-threaded(\.jsep|\.jspi|\.asyncify)?\.(wasm|mjs)$/;

let copied = 0;
mkdirSync(TARGET, { recursive: true });
for (const source of SOURCES) {
    let names;
    try {
        names = readdirSync(source).filter((name) => WANTED.test(name));
    } catch {
        // Dependency not installed yet (fresh checkout mid-setup): the app
        // still builds, and the AI feature reports the missing runtime at
        // use time.
        console.warn(`copy-ort-assets: ${source} not found, skipping`);
        continue;
    }
    for (const name of names) {
        copyFileSync(join(source, name), join(TARGET, name));
        copied++;
    }
}
console.log(`copy-ort-assets: copied ${copied} file(s) to ${TARGET}`);
