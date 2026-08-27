#!/usr/bin/env node
// Downloads the pinned model weights into client/public/models/ for desktop
// builds that run outside Nix (Windows/macOS CI, local `cargo tauri build`).
// Verifies every file against the sha256 in models.manifest.json — the same
// pins flake.nix uses — and fails the build on any mismatch. Unpinned
// manifest entries (empty sha256) are skipped; the app then falls back to
// its verified runtime download for those models.
//
// Usage: node scripts/fetch-model-weights.mjs
// Idempotent: files that already exist with the right hash are kept.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "client/src/app/llm/models.manifest.json");
const TARGET_ROOT = join(ROOT, "client/public/models");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const sha256File = (path) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");

const pinned = manifest.models.filter(
    (model) =>
        model.revision !== "" &&
        model.files.length > 0 &&
        model.files.every((file) => file.sha256 !== ""),
);
if (!pinned.length) {
    console.log("fetch-model-weights: no pinned models in the manifest, skipping");
    process.exit(0);
}

for (const model of pinned) {
    for (const file of model.files) {
        const target = join(TARGET_ROOT, model.repo, file.path);
        if (existsSync(target) && sha256File(target) === file.sha256) {
            console.log(`ok       ${model.repo}/${file.path}`);
            continue;
        }
        process.stdout.write(`fetching ${model.repo}/${file.path} ... `);
        const response = await fetch(file.url);
        if (!response.ok) {
            throw new Error(`${response.status} fetching ${file.url}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const digest = createHash("sha256").update(buffer).digest("hex");
        if (digest !== file.sha256) {
            throw new Error(
                `Hash mismatch for ${file.path}: expected ${file.sha256}, got ${digest}`,
            );
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, buffer);
        console.log(`${(buffer.length / 1e6).toFixed(1)} MB verified`);
    }
}
console.log(`fetch-model-weights: weights ready in ${TARGET_ROOT}`);
