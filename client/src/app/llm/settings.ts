"use client";
// Persisted user preferences for the local summarizer. localStorage, not
// IndexedDB: these are per-device UI prefs, never exported with compliance
// data, and needed synchronously before the DB opens.

import { DEFAULT_MODEL_ID } from "./config";

const ENABLED_KEY = "llm.enabled";
const MODEL_KEY = "llm.model";
const AUTO_SUMMARIZE_KEY = "llm.autoSummarize";

const storage = (): Storage | undefined =>
    typeof window !== "undefined" ? window.localStorage : undefined;

/** Master switch for the AI feature; on by default (the feature still does
 *  nothing unless the build bundled model weights). */
export const isAiEnabled = (): boolean =>
    storage()?.getItem(ENABLED_KEY) !== "false";

export const setAiEnabled = (enabled: boolean): void =>
    storage()?.setItem(ENABLED_KEY, String(enabled));

export const getSelectedModelId = (): string =>
    storage()?.getItem(MODEL_KEY) ?? DEFAULT_MODEL_ID;

export const setSelectedModelId = (id: string): void =>
    storage()?.setItem(MODEL_KEY, id);

/** Background evidence summarization; off by default — it loads the model
 *  and runs the GPU without a user action, so it is opt-in. */
export const isAutoSummarizeEnabled = (): boolean =>
    storage()?.getItem(AUTO_SUMMARIZE_KEY) === "true";

export const setAutoSummarizeEnabled = (enabled: boolean): void =>
    storage()?.setItem(AUTO_SUMMARIZE_KEY, String(enabled));
