#!/usr/bin/env node
// Regenerates client/src/app/llm/models.manifest.json for one model entry.
//
// The manifest pins every model file (URL, revision, size, sha256) and is the
// single source of truth for three consumers:
//   - flake.nix fetches each file as a fixed-output derivation and bundles
//     the weights into the desktop app.
//   - The runtime downloader (client/src/app/llm/engine.ts) fetches the same
//     URLs in the browser and rejects any file whose sha256 does not match.
//   - client/src/app/llm/config.ts renders sizes and license notices.
//
// Run inside `nix develop` (needs node >= 18 and network access):
//   node scripts/update-model-manifest.mjs --id llama-3.2-1b-instruct
//   node scripts/update-model-manifest.mjs --id gemma-3-270m-it --revision <sha>
//   node scripts/update-model-manifest.mjs --verify
//
// With --id, the script resolves the repo's current revision through the
// Hugging Face API (unless --revision pins one), downloads each required
// file, hashes it, and rewrites that model's entry in place. Treat the diff
// like a lockfile change. With --verify, the script re-downloads every file
// in the manifest and confirms the recorded hashes still match.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(
    ROOT,
    "client/src/app/llm/models.manifest.json",
);

const args = process.argv.slice(2);
const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
};

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

// transformers.js's dtype -> ONNX filename suffix mapping (q8 is the
// historical "quantized" name; fp32 has no suffix).
const dtypeSuffix = (dtype) =>
    dtype === "fp32" ? "" : dtype === "q8" ? "_quantized" : `_${dtype}`;

// The exact file set transformers.js requests for a text-generation model:
// tokenizer + config + the single quantized ONNX graph named by dtype.
const requiredFiles = (dtype) => [
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    `onnx/model${dtypeSuffix(dtype)}.onnx`,
];

const resolveUrl = (repo, revision, path) =>
    `https://huggingface.co/${repo}/resolve/${revision}/${path}`;

const fetchOk = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    return response;
};

// Stream-download a file, returning its size and sha256 without buffering
// the whole payload (ONNX graphs are hundreds of MB).
const hashRemote = async (url) => {
    const response = await fetchOk(url);
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of response.body) {
        hash.update(chunk);
        size += chunk.length;
    }
    return { size, sha256: hash.digest("hex") };
};

const updateModel = async (id) => {
    const model = manifest.models.find((entry) => entry.id === id);
    if (!model) {
        const known = manifest.models.map((entry) => entry.id).join(", ");
        throw new Error(`Unknown model id "${id}". Known ids: ${known}`);
    }

    const revision =
        getArg("revision") ??
        (
            await (
                await fetchOk(
                    `https://huggingface.co/api/models/${model.repo}`,
                )
            ).json()
        ).sha;
    if (!revision) {
        throw new Error(`Could not resolve a revision for ${model.repo}`);
    }
    console.log(`${model.repo} @ ${revision}`);

    const files = [];
    for (const path of requiredFiles(model.dtype)) {
        const url = resolveUrl(model.repo, revision, path);
        process.stdout.write(`  ${path} ... `);
        const { size, sha256 } = await hashRemote(url);
        console.log(`${(size / 1e6).toFixed(1)} MB ${sha256}`);
        files.push({ path, url, size, sha256 });
    }

    model.revision = revision;
    model.files = files;
    model.totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 4) + "\n");
    console.log(`Wrote ${MANIFEST_PATH}`);
};

const verify = async () => {
    let failures = 0;
    for (const model of manifest.models) {
        for (const file of model.files) {
            if (!file.sha256) {
                console.log(`MISSING HASH ${model.id} ${file.path}`);
                failures++;
                continue;
            }
            process.stdout.write(`${model.id} ${file.path} ... `);
            const { sha256 } = await hashRemote(file.url);
            if (sha256 === file.sha256) {
                console.log("ok");
            } else {
                console.log(`MISMATCH (upstream ${sha256})`);
                failures++;
            }
        }
    }
    if (failures) {
        throw new Error(`${failures} file(s) failed verification`);
    }
};

const id = getArg("id");
if (args.includes("--verify")) {
    await verify();
} else if (id) {
    await updateModel(id);
} else {
    console.error(
        "Usage: update-model-manifest.mjs --id <model-id> [--revision <sha>] | --verify",
    );
    process.exit(1);
}
