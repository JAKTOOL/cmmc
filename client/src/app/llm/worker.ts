// Inference Web Worker: hosts transformers.js (ONNX Runtime Web) so token
// generation never blocks the UI thread. All runtime JS/WASM is bundled
// locally (pdf.ts precedent), and weights come only from the bundled
// /models/ tree that the build placed there (flake.nix or
// scripts/fetch-model-weights.mjs). The worker performs no network fetch.

import {
    AutoModelForCausalLM,
    AutoTokenizer,
    InterruptableStoppingCriteria,
    TextStreamer,
    env,
} from "@huggingface/transformers";
import type { FromWorker, ToWorker } from "./protocol";

const post = (message: FromWorker) => self.postMessage(message);
const log = (message: string) => post({ type: "log", message });

// ONNX Runtime's WASM build reports real error text through console.error
// (Emscripten printErr) right before it throws an opaque numeric abort —
// and the webview console is invisible in the desktop shell. Mirror console
// traffic onto the breadcrumb channel so the actual message reaches stderr.
for (const level of ["error", "warn", "info", "log"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
        original(...args);
        try {
            const text = args
                .map((arg) =>
                    typeof arg === "string"
                        ? arg
                        : arg instanceof Error
                          ? `${arg.message}\n${arg.stack ?? ""}`
                          : JSON.stringify(arg),
                )
                .join(" ")
                .slice(0, 4000);
            post({ type: "log", message: `console.${level}: ${text}` });
        } catch {
            // Never let logging break the runtime.
        }
    };
}

log("worker: script evaluated");

// ONNX Runtime's WASM binaries ship in the app bundle at /ort/ (copied from
// node_modules by client/scripts/copy-ort-assets.mjs). Without this,
// transformers.js loads them from a CDN — forbidden here.
env.backends.onnx.wasm.wasmPaths = new URL("/ort/", self.location.origin).href;
// Weights are build-time assets under /models/{repo}/ — never remote. The
// browser cache is pointless for same-origin files (and the service worker
// already caches the app shell), so it stays off.
env.localModelPath = new URL("/models/", self.location.origin).href;
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;

interface Loaded {
    tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
    model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
}

let loaded: Loaded | undefined;
let loading: Promise<Loaded> | undefined;
const stoppingCriteria = new InterruptableStoppingCriteria();
let activeRequestId: number | undefined;

// Pending "read-file" round trips to the engine (desktop ipc mode).
let fileIdCounter = 0;
const pendingFiles = new Map<number, (data: ArrayBuffer | null) => void>();

const requestFile = (path: string): Promise<ArrayBuffer | null> =>
    new Promise((resolve) => {
        const fileId = ++fileIdCounter;
        pendingFiles.set(fileId, resolve);
        post({ type: "read-file", fileId, path });
    });

const load = async (message: Extract<ToWorker, { type: "load" }>) => {
    // Fixed-width SIMD support probe (wasm-feature-detect's test module) —
    // ONNX Runtime's wasm build requires it, and a JIT lacking or
    // miscompiling it is a prime crash suspect on webkitgtk.
    const simd = WebAssembly.validate(
        new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
            10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
        ]),
    );
    log(
        `load: repo=${message.repo} dtype=${message.dtype} device=${message.device} ipc=${!!message.ipc} externalDataChunks=${message.externalDataChunks} wasmSimd=${simd} sab=${typeof SharedArrayBuffer !== "undefined"} cores=${navigator.hardwareConcurrency}`,
    );
    if (message.ipc) {
        // Desktop path: weights are Tauri bundle resources, unreachable by
        // URL from the webview. A custom cache asks the engine for each file
        // the moment transformers.js requests it; the buffer is transferred,
        // consumed, and released — this worker retains nothing, so peak
        // memory stays at one in-flight file plus ONNX Runtime's own copy.
        env.useCustomCache = true;
        env.customCache = {
            match: async (request: Request | string) => {
                const key =
                    typeof request === "string" ? request : request.url;
                // Keys vary by resolution path ("<repo>/<file>" or the full
                // localModelPath URL) — the repo-relative part follows the
                // repo id in either form.
                const marker = `${message.repo}/`;
                const index = key.lastIndexOf(marker);
                if (index === -1) {
                    return undefined;
                }
                const path = key.slice(index + marker.length);
                log(`cache: requesting ${path}`);
                const data = await requestFile(path);
                log(
                    `cache: received ${path} (${data ? data.byteLength : "null"} bytes)`,
                );
                return data ? new Response(data) : undefined;
            },
            put: async () => {},
        };
    }

    const options = {
        revision: message.revision,
        progress_callback: (progress: {
            status: string;
            file?: string;
            loaded?: number;
            total?: number;
        }) => {
            if (progress.status === "progress" && progress.file) {
                post({
                    type: "progress",
                    file: progress.file,
                    loaded: progress.loaded ?? 0,
                    total: progress.total ?? 0,
                });
            }
        },
    };

    log("load: tokenizer starting");
    const tokenizer = await AutoTokenizer.from_pretrained(
        message.repo,
        options,
    );
    log("load: tokenizer ready; model starting (next: weight transfer, then ONNX session creation)");
    const model = await AutoModelForCausalLM.from_pretrained(message.repo, {
        ...options,
        dtype: message.dtype,
        device: message.device,
        // The manifest is authoritative on external weight data: a count
        // (possibly 0) always overrides whatever the repo config claims, so
        // the runtime only ever requests files the build actually bundled.
        use_external_data_format: message.externalDataChunks,
        // Maximum ONNX Runtime verbosity: failure text lands in
        // console.error (mirrored to the breadcrumb log above) instead of
        // only an opaque numeric abort.
        session_options: {
            logSeverityLevel: 0,
            logVerbosityLevel: 0,
        },
    });
    log("load: model session created");
    return { tokenizer, model };
};

const generate = async (
    message: Extract<ToWorker, { type: "generate" }>,
    { tokenizer, model }: Loaded,
) => {
    const inputBudget = message.contextTokens - message.maxNewTokens;

    // The prompt builder budgets by a chars-per-token estimate; re-check with
    // the real tokenizer and trim the user message if the estimate ran hot.
    // Chat-template overhead stays constant, so proportional trimming of the
    // largest message converges in one or two passes.
    const messages = message.messages.map((m) => ({ ...m }));
    let inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true,
    }) as { input_ids: { dims: number[] } };
    for (
        let pass = 0;
        pass < 3 && inputs.input_ids.dims[1] > inputBudget;
        pass++
    ) {
        const excess = inputs.input_ids.dims[1] - inputBudget;
        const largest = messages.reduce((a, b) =>
            b.content.length > a.content.length ? b : a,
        );
        largest.content = largest.content.slice(
            0,
            Math.max(0, largest.content.length - (excess + 64) * 6),
        );
        inputs = tokenizer.apply_chat_template(messages, {
            add_generation_prompt: true,
            return_dict: true,
        }) as { input_ids: { dims: number[] } };
    }

    let text = "";
    let tokens = 0;
    const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => {
            text += chunk;
            tokens++;
            post({ type: "token", requestId: message.requestId, text: chunk });
        },
    });

    const started = performance.now();
    stoppingCriteria.reset();
    activeRequestId = message.requestId;
    try {
        await model.generate({
            ...inputs,
            max_new_tokens: message.maxNewTokens,
            do_sample: false,
            repetition_penalty: 1.1,
            streamer,
            stopping_criteria: stoppingCriteria,
        });
    } finally {
        activeRequestId = undefined;
    }

    post({
        type: "done",
        requestId: message.requestId,
        text,
        stats: { tokens, ms: Math.round(performance.now() - started) },
    });
};

self.onmessage = async (event: MessageEvent<ToWorker>) => {
    const message = event.data;
    try {
        switch (message.type) {
            case "file-data": {
                const resolve = pendingFiles.get(message.fileId);
                pendingFiles.delete(message.fileId);
                resolve?.(message.data);
                break;
            }
            case "load": {
                if (!loading) {
                    loading = load(message);
                }
                loaded = await loading;
                post({ type: "ready", device: message.device });
                break;
            }
            case "generate": {
                if (!loaded) {
                    throw new Error("Model not loaded");
                }
                await generate(message, loaded);
                break;
            }
            case "abort": {
                if (activeRequestId === message.requestId) {
                    stoppingCriteria.interrupt();
                }
                break;
            }
        }
    } catch (error) {
        loading = message.type === "load" ? undefined : loading;
        // ONNX Runtime's WASM build throws bare numbers (abort pointers) for
        // C++ exceptions — most often a graph whose external weight data is
        // missing. Translate instead of surfacing "10736416" to the user.
        const description =
            typeof error === "number"
                ? `ONNX Runtime error ${error}. This usually means the model's external weight data (.onnx_data) is missing from the bundle or not declared in models.manifest.json.`
                : error instanceof Error
                  ? error.message
                  : String(error);
        post({
            type: "error",
            requestId: "requestId" in message ? message.requestId : undefined,
            message: description,
        });
    }
};
