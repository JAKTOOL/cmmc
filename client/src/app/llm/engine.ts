"use client";
// Main-thread side of the local inference runtime: worker lifecycle, weight
// download with hash verification, and a status store for React. Lazy
// singleton, following utils/pdf.ts — nothing loads until the feature is
// first used.
//
// Weight sourcing has two modes, decided per build at load time:
//   - "local": the desktop build bundles weights at /models/ (see flake.nix);
//     the worker reads them from the app's own origin. No network at all.
//   - "cache": the browser build downloads each manifest-pinned URL once,
//     verifies its sha256, and stores it in the Cache API under the exact URL
//     transformers.js will request — so the worker is always served from
//     cache and never performs a real network fetch.

import { registerLocalModel } from "@/app/ai/model";
import {
    CONTEXT_TOKENS,
    LlmDevice,
    LlmModel,
    MAX_NEW_TOKENS,
    hasBundledWeights,
    isPinned,
} from "./config";
import { getDeviceCapabilities } from "./capabilities";
import type { ChatMessage, FromWorker, ToWorker, WeightSource } from "./protocol";

// transformers.js's own Cache API bucket. Deliberately not the service
// worker's build-stamped cache: sw.js purges that on every release, and the
// weights must survive upgrades.
const TRANSFORMERS_CACHE = "transformers-cache";

export type LlmPhase =
    | "idle"
    | "downloading"
    | "loading"
    | "ready"
    | "generating"
    | "error";

export interface LlmStatus {
    phase: LlmPhase;
    modelId?: string;
    device?: LlmDevice;
    /** 0..1 for downloading/loading phases. */
    progress?: number;
    error?: string;
}

export interface GenerateHandle {
    /** Resolves with the full text once generation finishes or is stopped. */
    result: Promise<{ text: string; stats: { tokens: number; ms: number } }>;
    abort(): void;
}

type Listener = (status: LlmStatus) => void;

let status: LlmStatus = { phase: "idle" };
const listeners = new Set<Listener>();

const setStatus = (next: LlmStatus) => {
    status = next;
    listeners.forEach((listener) => listener(status));
};

export const getLlmStatus = (): LlmStatus => status;

export const subscribeLlmStatus = (listener: Listener): (() => void) => {
    listeners.add(listener);
    listener(status);
    return () => listeners.delete(listener);
};

const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

/** True when every manifest file for the model sits in the weights cache. */
export const isDownloaded = async (model: LlmModel): Promise<boolean> => {
    if (!isPinned(model)) {
        return false;
    }
    const cache = await caches.open(TRANSFORMERS_CACHE);
    for (const file of model.files) {
        if (!(await cache.match(file.url))) {
            return false;
        }
    }
    return true;
};

/** Download every manifest file, verify its sha256, and cache it under the
 *  URL transformers.js will request. Rejects (and caches nothing for the
 *  failing file) on any hash mismatch — a changed upstream file must fail
 *  loudly, never run silently. */
export const downloadModel = async (
    model: LlmModel,
    onProgress?: (loaded: number, total: number) => void,
): Promise<void> => {
    if (!isPinned(model)) {
        throw new Error(
            `Model ${model.id} is not pinned in models.manifest.json`,
        );
    }
    const cache = await caches.open(TRANSFORMERS_CACHE);
    const total = model.totalBytes;
    let doneBytes = 0;
    setStatus({ phase: "downloading", modelId: model.id, progress: 0 });
    try {
        for (const file of model.files) {
            if (await cache.match(file.url)) {
                doneBytes += file.size;
                onProgress?.(doneBytes, total);
                continue;
            }
            const response = await fetch(file.url);
            if (!response.ok || !response.body) {
                throw new Error(`${response.status} fetching ${file.path}`);
            }
            const reader = response.body.getReader();
            const parts: Uint8Array[] = [];
            let received = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                parts.push(value);
                received += value.byteLength;
                onProgress?.(doneBytes + received, total);
                setStatus({
                    phase: "downloading",
                    modelId: model.id,
                    progress: total ? (doneBytes + received) / total : 0,
                });
            }
            const buffer = new Uint8Array(received);
            let offset = 0;
            for (const part of parts) {
                buffer.set(part, offset);
                offset += part.byteLength;
            }
            const digest = await sha256Hex(buffer.buffer);
            if (digest !== file.sha256) {
                throw new Error(
                    `Hash mismatch for ${file.path}: expected ${file.sha256}, got ${digest}. The upstream file changed — re-pin with scripts/update-model-manifest.mjs after review.`,
                );
            }
            await cache.put(
                file.url,
                new Response(buffer, {
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "Content-Length": String(received),
                    },
                }),
            );
            doneBytes += file.size;
        }
        setStatus({ phase: "idle", modelId: model.id });
    } catch (error) {
        setStatus({
            phase: "error",
            modelId: model.id,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};

export const deleteModel = async (model: LlmModel): Promise<void> => {
    const cache = await caches.open(TRANSFORMERS_CACHE);
    for (const file of model.files) {
        await cache.delete(file.url);
    }
    if (loadedModelId === model.id) {
        worker?.terminate();
        worker = undefined;
        loadedModelId = undefined;
        registerLocalModel(undefined);
    }
    setStatus({ phase: "idle" });
};

/** Bytes the model occupies locally: manifest total when downloaded, zero
 *  otherwise (bundled desktop weights live in the app install, not here). */
export const downloadedBytes = async (model: LlmModel): Promise<number> =>
    (await isDownloaded(model)) ? model.totalBytes : 0;

let worker: Worker | undefined;
let loadedModelId: string | undefined;
let loadPromise: Promise<void> | undefined;
let requestCounter = 0;
let activeGeneration = false;

interface PendingRequest {
    onToken: (text: string) => void;
    resolve: (value: { text: string; stats: { tokens: number; ms: number } }) => void;
    reject: (reason: Error) => void;
}
const pending = new Map<number, PendingRequest>();
let onWorkerReady: (() => void) | undefined;
let onWorkerLoadError: ((error: Error) => void) | undefined;

const getWorker = (): Worker => {
    if (!worker) {
        worker = new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
        });
        worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data;
            switch (message.type) {
                case "progress": {
                    setStatus({
                        phase: "loading",
                        modelId: loadedModelId,
                        progress: message.total
                            ? message.loaded / message.total
                            : undefined,
                    });
                    break;
                }
                case "ready": {
                    onWorkerReady?.();
                    break;
                }
                case "token": {
                    pending.get(message.requestId)?.onToken(message.text);
                    break;
                }
                case "done": {
                    const request = pending.get(message.requestId);
                    pending.delete(message.requestId);
                    activeGeneration = false;
                    setStatus({
                        phase: "ready",
                        modelId: loadedModelId,
                        device: status.device,
                    });
                    request?.resolve({
                        text: message.text,
                        stats: message.stats,
                    });
                    break;
                }
                case "error": {
                    const error = new Error(message.message);
                    if (message.requestId !== undefined) {
                        const request = pending.get(message.requestId);
                        pending.delete(message.requestId);
                        activeGeneration = false;
                        setStatus({
                            phase: "ready",
                            modelId: loadedModelId,
                            device: status.device,
                        });
                        request?.reject(error);
                    } else {
                        onWorkerLoadError?.(error);
                    }
                    break;
                }
            }
        };
    }
    return worker;
};

const send = (message: ToWorker) => getWorker().postMessage(message);

/** Load the model into the worker (idempotent). Requires bundled weights or
 *  a completed, verified download — this function never downloads. */
export const ensureLoaded = async (model: LlmModel): Promise<void> => {
    if (loadedModelId === model.id) {
        return loadPromise;
    }
    if (worker) {
        // One model at a time: replacing means a fresh worker so the old
        // graph's memory is actually released.
        worker.terminate();
        worker = undefined;
        loadedModelId = undefined;
        registerLocalModel(undefined);
    }

    const { device } = await getDeviceCapabilities();
    if (model.minDevice === "webgpu" && device !== "webgpu") {
        throw new Error(
            `${model.label} needs WebGPU, which this browser does not provide. Choose the lite model instead.`,
        );
    }

    let source: WeightSource;
    if (await hasBundledWeights(model)) {
        source = "local";
    } else if (await isDownloaded(model)) {
        source = "cache";
    } else {
        throw new Error(`Weights for ${model.label} are not downloaded yet`);
    }

    loadedModelId = model.id;
    setStatus({ phase: "loading", modelId: model.id, device });
    loadPromise = new Promise<void>((resolve, reject) => {
        onWorkerReady = () => {
            onWorkerReady = undefined;
            onWorkerLoadError = undefined;
            setStatus({ phase: "ready", modelId: model.id, device });
            registerLocalModel(makeLocalModel(model));
            resolve();
        };
        onWorkerLoadError = (error) => {
            onWorkerReady = undefined;
            onWorkerLoadError = undefined;
            loadedModelId = undefined;
            setStatus({
                phase: "error",
                modelId: model.id,
                error: error.message,
            });
            reject(error);
        };
        send({
            type: "load",
            repo: model.repo,
            revision: model.revision,
            dtype: model.dtype,
            device,
            source,
        });
    });
    return loadPromise;
};

/** Stream a chat completion. One generation at a time — the worker is a
 *  single model instance and interleaved streams would corrupt both. */
export const generate = (
    messages: ChatMessage[],
    onToken: (text: string) => void,
): GenerateHandle => {
    if (!loadedModelId) {
        throw new Error("No model loaded");
    }
    if (activeGeneration) {
        throw new Error("A generation is already running");
    }
    activeGeneration = true;
    const requestId = ++requestCounter;
    setStatus({ phase: "generating", modelId: loadedModelId, device: status.device });
    const result = new Promise<{
        text: string;
        stats: { tokens: number; ms: number };
    }>((resolve, reject) => {
        pending.set(requestId, { onToken, resolve, reject });
    });
    send({
        type: "generate",
        requestId,
        messages,
        maxNewTokens: MAX_NEW_TOKENS,
        contextTokens: CONTEXT_TOKENS,
    });
    return {
        result,
        abort: () => send({ type: "abort", requestId }),
    };
};

// Adapter satisfying the LocalModel contract (docs/rag-review-plan.md): a
// single prompt string in, an async token stream out. The chat template is
// applied worker-side, so the plain prompt becomes one user turn.
const makeLocalModel = (model: LlmModel) => ({
    id: `${model.id}@${model.revision.slice(0, 12)}`,
    contextTokens: CONTEXT_TOKENS,
    async *generate(prompt: string, opts?: { signal?: AbortSignal }) {
        const queue: string[] = [];
        let notify: (() => void) | undefined;
        let finished = false;
        let failure: Error | undefined;
        const handle = generate([{ role: "user", content: prompt }], (text) => {
            queue.push(text);
            notify?.();
        });
        opts?.signal?.addEventListener("abort", () => handle.abort(), {
            once: true,
        });
        handle.result
            .catch((error: Error) => {
                failure = error;
            })
            .finally(() => {
                finished = true;
                notify?.();
            });
        for (;;) {
            while (queue.length) {
                yield queue.shift()!;
            }
            if (finished) {
                if (failure) {
                    throw failure;
                }
                return;
            }
            await new Promise<void>((resolve) => {
                notify = resolve;
            });
            notify = undefined;
        }
    },
});
