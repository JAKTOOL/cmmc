"use client";
// Persisted user preferences for the local summarizer. localStorage, not
// IndexedDB: these are per-device UI prefs, never exported with compliance
// data, and needed synchronously before the DB opens.

import { DEFAULT_MODEL_ID } from "./config";

const ENABLED_KEY = "llm.enabled";
const MODEL_KEY = "llm.model";
const CONSENT_KEY_PREFIX = "llm.consent.";

const storage = (): Storage | undefined =>
    typeof window !== "undefined" ? window.localStorage : undefined;

/** Master switch for the AI feature; on by default (the feature still does
 *  nothing until weights exist and consent is recorded). */
export const isAiEnabled = (): boolean =>
    storage()?.getItem(ENABLED_KEY) !== "false";

export const setAiEnabled = (enabled: boolean): void =>
    storage()?.setItem(ENABLED_KEY, String(enabled));

export const getSelectedModelId = (): string =>
    storage()?.getItem(MODEL_KEY) ?? DEFAULT_MODEL_ID;

export const setSelectedModelId = (id: string): void =>
    storage()?.setItem(MODEL_KEY, id);

/** Per-model download consent: the user explicitly approved the one-time
 *  weight download for this model id. Bundled desktop weights never need it. */
export const hasDownloadConsent = (modelId: string): boolean =>
    storage()?.getItem(CONSENT_KEY_PREFIX + modelId) === "true";

export const setDownloadConsent = (modelId: string): void =>
    storage()?.setItem(CONSENT_KEY_PREFIX + modelId, "true");
