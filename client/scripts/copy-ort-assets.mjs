// Copies ONNX Runtime's WASM binaries (and their loader modules) out of
// @huggingface/transformers into public/ort/, so the inference worker loads
// them from the app's own origin. Without this, transformers.js fetches them
// from a CDN at runtime — forbidden here (see utils/pdf.ts for the same
// rule applied to pdf.js). Runs as npm predev/prebuild, cwd = client.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "node_modules/@huggingface/transformers/dist";
const TARGET = "public/ort";

let assets;
try {
    assets = readdirSync(SOURCE).filter(
        (name) => name.endsWith(".wasm") || name.endsWith(".mjs"),
    );
} catch {
    // Dependency not installed yet (fresh checkout mid-setup): the app still
    // builds, and the AI feature reports the missing runtime at use time.
    console.warn(`copy-ort-assets: ${SOURCE} not found, skipping`);
    process.exit(0);
}

mkdirSync(TARGET, { recursive: true });
for (const name of assets) {
    copyFileSync(join(SOURCE, name), join(TARGET, name));
}
console.log(`copy-ort-assets: copied ${assets.length} file(s) to ${TARGET}`);
