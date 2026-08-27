// Inference Web Worker: hosts transformers.js (ONNX Runtime Web) so token
// generation never blocks the UI thread. All runtime JS/WASM is bundled
// locally (pdf.ts precedent). Weights are never fetched from the network
// here: they come from the bundled /models/ tree (desktop) or from Cache API
// entries the engine hash-verified beforehand (see engine.ts).

import {
    AutoModelForCausalLM,
    AutoTokenizer,
    InterruptableStoppingCriteria,
    TextStreamer,
    env,
} from "@huggingface/transformers";
import type { FromWorker, ToWorker } from "./protocol";

const post = (message: FromWorker) => self.postMessage(message);

// ONNX Runtime's WASM binaries ship in the app bundle at /ort/ (copied from
// node_modules by client/scripts/copy-ort-assets.mjs). Without this,
// transformers.js loads them from a CDN — forbidden here.
env.backends.onnx.wasm.wasmPaths = new URL("/ort/", self.location.origin).href;
env.useBrowserCache = true;
env.localModelPath = new URL("/models/", self.location.origin).href;

interface Loaded {
    tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
    model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
}

let loaded: Loaded | undefined;
let loading: Promise<Loaded> | undefined;
const stoppingCriteria = new InterruptableStoppingCriteria();
let activeRequestId: number | undefined;

const load = async (message: Extract<ToWorker, { type: "load" }>) => {
    // "local" reads the bundled tree; "cache" resolves the same HF URLs the
    // engine pre-cached, so cache.match() serves every file and the worker
    // performs no real network fetch.
    env.allowLocalModels = message.source === "local";
    env.allowRemoteModels = message.source === "cache";

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

    const tokenizer = await AutoTokenizer.from_pretrained(
        message.repo,
        options,
    );
    const model = await AutoModelForCausalLM.from_pretrained(message.repo, {
        ...options,
        dtype: message.dtype,
        device: message.device,
    });
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
        post({
            type: "error",
            requestId: "requestId" in message ? message.requestId : undefined,
            message: error instanceof Error ? error.message : String(error),
        });
    }
};
