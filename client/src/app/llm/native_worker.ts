// Poll-based transport to the native llama.cpp engine (src-tauri
// native.rs). It presents the same surface engine.ts already drives for
// the in-webview Worker ("load"/"generate"/"abort" in, FromWorker
// messages out), so the engine's status store, request queue, and error
// recovery run unchanged on top of it.
//
// Polling instead of Tauri events on purpose: the app talks to the shell
// exclusively through __TAURI_INTERNALS__.invoke (utils/tauri.ts, no
// @tauri-apps/api dependency), and the event bridge's callback protocol
// is an internals detail that shifts between Tauri versions. A ~10 Hz
// poll is version-proof and its cost is noise next to token generation.
//
// Command contract with native.rs:
//   native_load(path, nCtx)      blocks until the model is resident
//   native_generate({...})       blocks until generation ends; returns
//                                { text, tokens, ms }; rejects with
//                                { message, fatal }
//   native_poll(requestId)       drains streamed chunks (each returned
//                                exactly once)
//   native_abort(requestId)      cooperative cancel
//   native_unload()              frees the model and context

import { nativeInvoke } from "@/app/utils/tauri";
import type { LlmModel } from "./config";
import type { FromWorker, ToWorker } from "./protocol";

/** The subset of Worker that engine.ts uses. `new Worker()` satisfies it
 *  structurally, so the engine holds a WorkerLike and never cares which
 *  transport is behind it. */
export interface WorkerLike {
    onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage(message: ToWorker, transfer?: Transferable[]): void;
    terminate(): void;
}

const POLL_MS = 100;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorShape = (
    error: unknown,
): { message: string; fatal?: boolean } => {
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
    ) {
        return error as { message: string; fatal?: boolean };
    }
    return { message: String(error) };
};

export class NativeWorker implements WorkerLike {
    onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    private terminated = false;
    private readonly ggufPath: string;
    private readonly totalBytes: number;
    private readonly nCtx: number;

    constructor(model: LlmModel, contextTokens: number) {
        // A pinned GGUF entry has exactly one file: the model itself.
        this.ggufPath = `${model.repo}/${model.files[0]?.path ?? ""}`;
        this.totalBytes = model.totalBytes;
        this.nCtx = contextTokens;
    }

    postMessage(message: ToWorker): void {
        switch (message.type) {
            case "load":
                void this.runLoad();
                break;
            case "generate":
                void this.runGenerate(message);
                break;
            case "abort":
                void nativeInvoke("native_abort", {
                    requestId: message.requestId,
                }).catch(() => {});
                break;
            default:
                // "file-data" never occurs: the Rust engine reads the
                // weights from the resource dir itself.
                break;
        }
    }

    terminate(): void {
        this.terminated = true;
        void nativeInvoke("native_unload").catch(() => {});
    }

    private emit(message: FromWorker): void {
        if (!this.terminated) {
            this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
        }
    }

    private async runLoad(): Promise<void> {
        // native_load blocks until the model is resident; a parallel poll
        // reports mmap/upload progress for the status bar.
        let loading = true;
        const progress = (async () => {
            while (loading && !this.terminated) {
                try {
                    const state = await nativeInvoke<{
                        loadProgress: number;
                    }>("native_poll", { requestId: 0 });
                    this.emit({
                        type: "progress",
                        file: this.ggufPath,
                        loaded: Math.round(
                            state.loadProgress * this.totalBytes,
                        ),
                        total: this.totalBytes,
                    });
                } catch {
                    // Progress is cosmetic; the load invoke carries errors.
                }
                await sleep(POLL_MS);
            }
        })();
        try {
            await nativeInvoke("native_load", {
                path: this.ggufPath,
                nCtx: this.nCtx,
            });
            loading = false;
            await progress;
            this.emit({ type: "ready", device: "native" });
        } catch (error) {
            loading = false;
            await progress;
            this.emit({ type: "error", message: errorShape(error).message });
        }
    }

    private async runGenerate(
        message: Extract<ToWorker, { type: "generate" }>,
    ): Promise<void> {
        const { requestId } = message;
        let running = true;
        const drain = async () => {
            const { chunks } = await nativeInvoke<{ chunks: string[] }>(
                "native_poll",
                { requestId },
            );
            for (const text of chunks) {
                this.emit({ type: "token", requestId, text });
            }
        };
        const poll = (async () => {
            while (running && !this.terminated) {
                try {
                    await drain();
                } catch {
                    // The generate invoke below carries the real error.
                }
                await sleep(POLL_MS);
            }
        })();
        try {
            const result = await nativeInvoke<{
                text: string;
                tokens: number;
                ms: number;
            }>("native_generate", {
                requestId,
                messages: message.messages,
                maxNewTokens: message.maxNewTokens,
                contextTokens: message.contextTokens,
            });
            running = false;
            await poll;
            // Final drain: generation is finished, so this collects every
            // chunk the loop missed — streamed consumers assemble the same
            // text the done message carries.
            try {
                await drain();
            } catch {
                // The done message below still carries the full text.
            }
            this.emit({
                type: "done",
                requestId,
                text: result.text,
                stats: { tokens: result.tokens, ms: result.ms },
            });
        } catch (error) {
            running = false;
            await poll;
            const { message: text, fatal } = errorShape(error);
            this.emit({ type: "error", requestId, message: text, fatal });
        }
    }
}
