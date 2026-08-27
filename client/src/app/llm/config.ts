// Model registry for the local summarizer, built from the pinned manifest.
// The manifest (models.manifest.json) is the single source of truth shared
// with flake.nix (desktop weight bundling) and scripts/update-model-manifest.mjs
// (regeneration) — nothing here hardcodes a URL or hash.

import manifest from "./models.manifest.json";

export type LlmDevice = "webgpu" | "wasm";

export interface ManifestFile {
    path: string;
    url: string;
    size: number;
    sha256: string;
}

export interface LlmModel {
    id: string;
    label: string;
    repo: string;
    revision: string;
    /** transformers.js dtype key; also names the ONNX file (model_<dtype>.onnx). */
    dtype: string;
    /** Weakest device this model is usable on. "webgpu" bars slow WASM-only
     *  machines from a model that would generate at unusable speed. */
    minDevice: LlmDevice;
    license: string;
    licenseNotice: string;
    licenseUrl: string;
    totalBytes: number;
    files: ManifestFile[];
}

export const MODELS: LlmModel[] = manifest.models;

export const DEFAULT_MODEL_ID = "llama-3.2-1b-instruct";
export const LITE_MODEL_ID = "gemma-3-270m-it";

export const getModel = (id: string): LlmModel | undefined =>
    MODELS.find((model) => model.id === id);

/** A model is usable only once the manifest pins every file's sha256.
 *  Unpinned entries are placeholders awaiting update-model-manifest.mjs. */
export const isPinned = (model: LlmModel): boolean =>
    model.revision !== "" &&
    model.files.length > 0 &&
    model.files.every((file) => file.sha256 !== "");

/** Models eligible on a device, pinned entries only. */
export const availableModels = (device: LlmDevice): LlmModel[] =>
    MODELS.filter(
        (model) =>
            isPinned(model) && (device === "webgpu" || model.minDevice === "wasm"),
    );

// Where the desktop build bundles weights (see flake.nix: model-weights is
// copied into public/models/ before the frontend build). transformers.js
// resolves local models as `${localModelPath}/${repo}/<file>`.
export const LOCAL_MODEL_PATH = "/models/";

/** True when this build ships the model's weights as static assets (desktop
 *  Nix/CI builds). Probes the smallest manifest file; the web build has no
 *  /models/ directory and 404s. */
export const hasBundledWeights = async (model: LlmModel): Promise<boolean> => {
    try {
        const response = await fetch(
            `${LOCAL_MODEL_PATH}${model.repo}/config.json`,
            { method: "GET", cache: "no-store" },
        );
        if (!response.ok) {
            return false;
        }
        // GitHub Pages serves an HTML 404 page for some paths with a 200-ish
        // custom setup; require JSON to count as a real bundled config.
        const text = await response.text();
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};

// Generation budget. Both candidate models accept far larger windows, but 4K
// caps KV-cache memory in the browser and keeps WASM latency tolerable.
export const CONTEXT_TOKENS = 4096;
export const MAX_NEW_TOKENS = 512;
/** Conservative chars-per-token estimate for budget math done outside the
 *  tokenizer; the worker re-checks with the real tokenizer and trims. */
export const CHARS_PER_TOKEN = 4;
/** Token budget for evidence excerpts (instructions ~250 + control and
 *  objectives ~600 + output 512 leaves ~2,600 of 4,096). */
export const EVIDENCE_TOKEN_BUDGET = 2600;
export const EVIDENCE_CHAR_BUDGET = EVIDENCE_TOKEN_BUDGET * CHARS_PER_TOKEN;
