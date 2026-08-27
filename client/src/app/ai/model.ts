// Narrow seam between model consumers (the evidence summarizer today, the
// RAG review layer in docs/rag-review-plan.md next) and whatever runtime
// provides inference. The embedded transformers.js engine registers itself
// here when its weights finish loading; a future native (Tauri/llama.cpp)
// path registers through the same call. Consumers never import the runtime.

import { isUnlocked } from "@/app/utils/tier";

export interface GenerateOptions {
    signal?: AbortSignal;
    maxNewTokens?: number;
}

export interface LocalModel {
    /** Stable id, part of any derived-result fingerprint. */
    readonly id: string;
    /** Prompt builders budget against this window. */
    readonly contextTokens: number;
    generate(prompt: string, opts?: GenerateOptions): AsyncIterable<string>;
    /** Optional exact count; callers fall back to estimateTokens. */
    countTokens?(text: string): number;
}

/** Conservative chars-per-token fallback used wherever the tokenizer is out
 *  of reach (main thread, budget precomputation). */
export const estimateTokens = (text: string): number =>
    Math.ceil(text.length / 4);

/** Fired on window whenever the registered model changes, so panels appear
 *  the moment weights finish loading (same idiom as TABLE_CHANGED_EVENT). */
export const MODEL_CHANGED_EVENT = "local-model-changed";

let current: LocalModel | undefined;

export const registerLocalModel = (model: LocalModel | undefined): void => {
    current = model;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MODEL_CHANGED_EVENT));
    }
};

export const getLocalModel = (): LocalModel | undefined => current;

/** Single gating seam for AI features on a requirement: the build tier must
 *  unlock the requirement and a model must be registered. The free web build
 *  never registers a model, so AI stays desktop/full-tier only. */
export const aiReviewAvailable = (requirementId: string): boolean =>
    isUnlocked(requirementId) && getLocalModel() !== undefined;
