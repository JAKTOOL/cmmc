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

// ONNX Runtime's WASM throws C++ exceptions into JS as bare heap pointers
// with no message — but the message text lives in the WASM heap. Capture
// the module memory at instantiation so a numeric abort can be decoded by
// scanning around (and through pointers near) the exception object.
let ortMemory: WebAssembly.Memory | undefined;

const findMemory = (value: unknown, depth: number): WebAssembly.Memory | undefined => {
    if (value instanceof WebAssembly.Memory) {
        return value;
    }
    // Instance.exports is a prototype accessor — Object.values() misses it.
    if (value instanceof WebAssembly.Instance) {
        return findMemory(value.exports, 2);
    }
    if (depth > 0 && value && typeof value === "object") {
        for (const child of Object.values(value)) {
            const memory = findMemory(child, depth - 1);
            if (memory) {
                return memory;
            }
        }
    }
    return undefined;
};

const captureMemory = (result: unknown, imports: unknown) => {
    const memory = findMemory(result, 3) ?? findMemory(imports, 3);
    if (memory) {
        ortMemory = memory;
        log("worker: captured WASM memory for abort decoding");
    }
};

const originalInstantiate = WebAssembly.instantiate.bind(WebAssembly);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(WebAssembly as any).instantiate = async (a: any, b: any) => {
    const result = await originalInstantiate(a, b);
    captureMemory(result, b);
    return result;
};
if ("instantiateStreaming" in WebAssembly) {
    const originalStreaming = WebAssembly.instantiateStreaming.bind(WebAssembly);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (WebAssembly as any).instantiateStreaming = async (a: any, b: any) => {
        const result = await originalStreaming(a, b);
        captureMemory(result, b);
        return result;
    };
}

/** Best-effort recovery of the C++ exception text behind a numeric abort:
 *  printable ASCII runs at the pointer itself (SSO strings) and behind any
 *  plausible heap pointers stored in the object's first words. */
const decodeAbort = (pointer: number): string[] => {
    try {
        if (!ortMemory) {
            return [];
        }
        const heap = new Uint8Array(ortMemory.buffer);
        const view = new DataView(ortMemory.buffer);
        if (pointer <= 0 || pointer >= heap.length - 128) {
            return [];
        }
        const found = new Set<string>();
        const runAt = (address: number) => {
            let text = "";
            for (
                let i = address;
                i < Math.min(address + 300, heap.length);
                i++
            ) {
                const byte = heap[i];
                if (byte >= 32 && byte < 127) {
                    text += String.fromCharCode(byte);
                } else {
                    break;
                }
            }
            if (text.length >= 8 && /[a-zA-Z]{4}/.test(text)) {
                found.add(text);
            }
        };
        for (let offset = 0; offset <= 96; offset += 4) {
            const word = view.getUint32(pointer + offset, true);
            if (word > 1024 && word < heap.length - 8) {
                runAt(word);
            }
        }
        for (let offset = 0; offset <= 64; offset++) {
            runAt(pointer + offset);
        }
        // Overlapping scans produce suffixes of the same string — keep only
        // maximal ones.
        const texts = [...found];
        return texts
            .filter(
                (text) =>
                    !texts.some(
                        (other) => other !== text && other.includes(text),
                    ),
            )
            .slice(0, 4);
    } catch {
        return [];
    }
};

log("worker: script evaluated");

// ONNX Runtime's WASM binaries ship in the app bundle at /ort/ (copied from
// node_modules by client/scripts/copy-ort-assets.mjs). Without this,
// transformers.js loads them from a CDN — forbidden here. The default prefix
// resolves the JSEP (WebGPU) build; load() overrides it with the plain pair
// for CPU-only sessions.
env.backends.onnx.wasm.wasmPaths = new URL("/ort/", self.location.origin).href;
// Weights are build-time assets under /models/{repo}/ — never remote. The
// browser cache is pointless for same-origin files (and the service worker
// already caches the app shell), so it stays off. localModelPath must stay a
// RELATIVE path: transformers.js v4's file-metadata probe treats an
// http(s)-shaped localModelPath as "not local" and skips it, which surfaced
// as "Cannot read properties of undefined (reading 'tokenizer_class')".
env.localModelPath = "/models/";
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

    // CPU-only sessions use the plain (non-JSEP) ONNX Runtime build. The
    // JSEP build's asyncify trampolines for WebGPU bridging abort on
    // JavaScriptCore during session creation; the plain build has none of
    // that machinery. WebGPU devices keep the prefix default (JSEP glue).
    if (message.device === "wasm") {
        env.backends.onnx.wasm.wasmPaths = {
            mjs: new URL("/ort/ort-wasm-simd-threaded.mjs", self.location.origin)
                .href,
            wasm: new URL(
                "/ort/ort-wasm-simd-threaded.wasm",
                self.location.origin,
            ).href,
        };
        log("load: using plain (non-JSEP) ONNX Runtime WASM build");
    }
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
    // Best effort: when the runtime exposes its GPUDevice, log why it dies.
    // A lost device is the usual story behind "Mapping WebGPU buffer failed:
    // Invalid buffer" during Download, and the reason string names the
    // culprit (GPU process reset, out of memory, driver timeout).
    try {
        // The repo types WebGPU by hand (capabilities.ts) — same here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const device = (env.backends.onnx as any)?.webgpu?.device as
            | { lost?: Promise<{ reason: string; message: string }> }
            | undefined;
        device?.lost?.then((info) =>
            log(`webgpu device lost: ${info.reason} — ${info.message}`),
        );
    } catch {
        // Diagnostics only.
    }
    return { tokenizer, model };
};

/** Errors after which the ONNX session cannot be trusted: a lost WebGPU
 *  device (all buffers invalid from then on) or any OrtRun failure, which
 *  leaves the autoregressive loop's KV-cache state undefined. */
const isFatalGenerateError = (description: string): boolean =>
    /OrtRun|webgpu|device.*lost|invalid buffer/i.test(description);

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
    const untrimmedTokens = inputs.input_ids.dims[1];
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

    // Size breadcrumb for OOM reports: the prefill logits buffer is
    // input x vocab x 4 bytes fp32 — the allocation that dies first when
    // the window outruns GPU memory. Vocab comes from the loaded model's
    // own config, so the estimate matches what ONNX Runtime allocates.
    const inputTokens = inputs.input_ids.dims[1];
    const vocab = (model as { config?: { vocab_size?: number } }).config
        ?.vocab_size;
    log(
        `generate: input=${inputTokens} tokens` +
            (inputTokens === untrimmedTokens
                ? ""
                : ` (trimmed from ${untrimmedTokens})`) +
            ` budget=${inputBudget} window=${message.contextTokens}` +
            ` maxNew=${message.maxNewTokens}` +
            (vocab
                ? ` prefillLogits~${Math.round((inputTokens * vocab * 4) / 2 ** 20)}MiB (vocab=${vocab})`
                : ""),
    );

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
        // C++ exceptions with no message — seen for missing external weight
        // data and for allocation failure (std::bad_alloc) when the engine
        // caps WASM memory. On a numeric throw, probe how much WASM memory
        // this engine will actually grant, so the log pins down whether the
        // heap ceiling is the culprit.
        let decoded: string[] = [];
        if (typeof error === "number") {
            decoded = decodeAbort(error);
            for (const text of decoded) {
                log(`abort-decode: ${text}`);
            }
        }
        const description =
            typeof error === "number"
                ? decoded.length
                    ? `ONNX Runtime: ${decoded[0]}`
                    : `ONNX Runtime error ${error} (a C++ exception whose message could not be decoded — see the debug log).`
                : error instanceof Error
                  ? error.message
                  : String(error);
        post({
            type: "error",
            requestId: "requestId" in message ? message.requestId : undefined,
            message: description,
            fatal:
                message.type === "generate" &&
                isFatalGenerateError(description),
        });
    }
};
