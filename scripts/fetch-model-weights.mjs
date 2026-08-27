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
import {
    createReadStream,
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "client/src/app/llm/models.manifest.json");
const TARGET_ROOT = join(ROOT, "client/public/models");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

// Streaming hash: weight shards run to hundreds of MB, too big to buffer.
const sha256File = async (path) => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) {
        hash.update(chunk);
    }
    return hash.digest("hex");
};

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
        if (existsSync(target) && (await sha256File(target)) === file.sha256) {
            console.log(`ok       ${model.repo}/${file.path}`);
            continue;
        }
        process.stdout.write(`fetching ${model.repo}/${file.path} ... `);
        const response = await fetch(file.url);
        if (!response.ok || !response.body) {
            throw new Error(`${response.status} fetching ${file.url}`);
        }
        // Stream to a temp path; only a verified file lands at the target,
        // so an interrupted or corrupt download can never enter a bundle.
        mkdirSync(dirname(target), { recursive: true });
        const partial = `${target}.partial`;
        await pipeline(
            Readable.fromWeb(response.body),
            createWriteStream(partial),
        );
        const digest = await sha256File(partial);
        if (digest !== file.sha256) {
            rmSync(partial);
            throw new Error(
                `Hash mismatch for ${file.path}: expected ${file.sha256}, got ${digest}`,
            );
        }
        renameSync(partial, target);
        console.log(`${(file.size / 1e6).toFixed(1)} MB verified`);
    }
}

// Prune anything the manifest no longer lists (old revisions, dropped
// models, leftover .partial files) so stale weights never enter a bundle.
const wanted = new Set(
    pinned.flatMap((model) =>
        model.files.map((file) => join(TARGET_ROOT, model.repo, file.path)),
    ),
);
const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(path);
        } else if (!wanted.has(path) && entry.name !== ".gitkeep") {
            // .gitkeep stays: it keeps the Tauri resource source present on
            // fresh clones (see client/.gitignore).
            console.log(`pruning  ${path}`);
            rmSync(path);
        }
    }
};
if (existsSync(TARGET_ROOT)) {
    walk(TARGET_ROOT);
}
console.log(`fetch-model-weights: weights ready in ${TARGET_ROOT}`);
