"use client";
// "AI Assistant" settings: model choice, one-time weight download with
// explicit consent, engine status, and the master switch. The menu item only
// dispatches an open event; the modal itself is mounted at the app level
// (layout.tsx) because the nav dropdown unmounts its children on any outside
// click (same pattern as the License modal).

import { useEffect, useMemo, useState } from "react";
import { FREE_TIER } from "@/app/utils/tier";
import {
    DEFAULT_MODEL_ID,
    LlmDevice,
    LlmModel,
    MODELS,
    getModel,
    hasBundledWeights,
    isPinned,
} from "@/app/llm/config";
import { getDeviceCapabilities } from "@/app/llm/capabilities";
import {
    LlmStatus,
    deleteModel,
    downloadModel,
    isDownloaded,
    subscribeLlmStatus,
} from "@/app/llm/engine";
import {
    getSelectedModelId,
    hasDownloadConsent,
    isAiEnabled,
    setAiEnabled,
    setDownloadConsent,
    setSelectedModelId,
} from "@/app/llm/settings";
import { InfoModal } from "../modal";
import { Badge, Button, Label, Select, menuItemClasses } from "../ui";

export const AI_SETTINGS_OPEN_EVENT = "ai-settings-open";

export const openAiSettings = (): void => {
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_OPEN_EVENT));
};

const formatBytes = (bytes: number): string =>
    bytes >= 1e9
        ? `${(bytes / 1e9).toFixed(1)} GB`
        : `${Math.round(bytes / 1e6)} MB`;

export const AiMenuItem = () => {
    // The free web tier has no AI feature at all (see ai/model.ts gating).
    if (FREE_TIER) {
        return null;
    }
    return (
        <button
            type="button"
            className={menuItemClasses()}
            onClick={openAiSettings}
            tabIndex={-1}
        >
            <span>AI Assistant</span>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="h-4"
                aria-hidden="true"
            >
                <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                />
            </svg>
        </button>
    );
};

/** Weight state for the selected model on this device/build. */
type WeightState = "checking" | "bundled" | "downloaded" | "absent";

export const AiSettingsModal = () => {
    const [open, setOpen] = useState(false);
    const [device, setDevice] = useState<LlmDevice>();
    const [enabled, setEnabled] = useState(true);
    const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
    const [weights, setWeights] = useState<WeightState>("checking");
    const [status, setStatus] = useState<LlmStatus>({ phase: "idle" });
    const [error, setError] = useState<string | null>(null);

    const model = useMemo(
        () => getModel(modelId) ?? MODELS[0],
        [modelId],
    );

    useEffect(() => {
        const onOpen = () => {
            setEnabled(isAiEnabled());
            setModelId(getSelectedModelId());
            setError(null);
            setOpen(true);
        };
        window.addEventListener(AI_SETTINGS_OPEN_EVENT, onOpen);
        return () => window.removeEventListener(AI_SETTINGS_OPEN_EVENT, onOpen);
    }, []);

    useEffect(() => subscribeLlmStatus(setStatus), []);

    useEffect(() => {
        if (!open || !model) {
            return;
        }
        let cancelled = false;
        setWeights("checking");
        (async () => {
            const capabilities = await getDeviceCapabilities();
            if (cancelled) {
                return;
            }
            setDevice(capabilities.device);
            if (await hasBundledWeights(model)) {
                if (!cancelled) setWeights("bundled");
            } else if (await isDownloaded(model)) {
                if (!cancelled) setWeights("downloaded");
            } else if (!cancelled) {
                setWeights("absent");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, model, status.phase === "downloading"]);

    if (FREE_TIER || !model) {
        return null;
    }

    const downloading =
        status.phase === "downloading" && status.modelId === model.id;
    const deviceOk = device === "webgpu" || model.minDevice === "wasm";

    const onDownload = async () => {
        setError(null);
        setDownloadConsent(model.id);
        try {
            await downloadModel(model);
            setWeights("downloaded");
        } catch (downloadError) {
            setError(
                downloadError instanceof Error
                    ? downloadError.message
                    : String(downloadError),
            );
        }
    };

    const onDelete = async () => {
        setError(null);
        await deleteModel(model);
        setWeights("absent");
    };

    return (
        <InfoModal
            open={open}
            title="AI Assistant"
            onClose={() => setOpen(false)}
        >
            <div className="flex flex-col gap-4">
                <p>
                    Drafts control narratives from your attached evidence. The
                    model runs entirely on this device — your evidence and
                    notes are never uploaded anywhere.
                </p>

                <label className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                        Enable AI features
                    </span>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => {
                            setEnabled(event.target.checked);
                            setAiEnabled(event.target.checked);
                        }}
                    />
                </label>

                <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Engine</span>
                    {device === undefined ? (
                        <Badge variant="neutral">Detecting…</Badge>
                    ) : device === "webgpu" ? (
                        <Badge variant="success">WebGPU</Badge>
                    ) : (
                        <Badge variant="warning">
                            WASM — slow; lite model only
                        </Badge>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <Label htmlFor="ai-model">Model</Label>
                    <Select
                        id="ai-model"
                        value={modelId}
                        onChange={(event) => {
                            setModelId(event.target.value);
                            setSelectedModelId(event.target.value);
                        }}
                    >
                        {MODELS.map((candidate: LlmModel) => (
                            <option
                                key={candidate.id}
                                value={candidate.id}
                                disabled={
                                    !isPinned(candidate) ||
                                    (candidate.minDevice === "webgpu" &&
                                        device === "wasm")
                                }
                            >
                                {candidate.label}
                                {!isPinned(candidate)
                                    ? " (not available in this build)"
                                    : candidate.minDevice === "webgpu" &&
                                        device === "wasm"
                                      ? " (needs WebGPU)"
                                      : ""}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                    {weights === "checking" && <p>Checking model weights…</p>}
                    {weights === "bundled" && (
                        <p>
                            Model weights are bundled with this app — nothing
                            to download.
                        </p>
                    )}
                    {weights === "downloaded" && (
                        <div className="flex items-center justify-between gap-4">
                            <span>
                                {formatBytes(model.totalBytes)} stored locally.
                            </span>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onDelete}
                            >
                                Delete weights
                            </Button>
                        </div>
                    )}
                    {weights === "absent" && !downloading && (
                        <>
                            {isPinned(model) ? (
                                <>
                                    <p>
                                        One-time download of{" "}
                                        {formatBytes(model.totalBytes)} of
                                        public model weights from
                                        huggingface.co. Your evidence and notes
                                        are never uploaded — all AI runs on
                                        this device.
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={onDownload}
                                        disabled={!deviceOk || !isAiEnabled()}
                                    >
                                        Download model
                                    </Button>
                                </>
                            ) : (
                                <p>
                                    This model is not pinned in this build. Run{" "}
                                    <code>
                                        node scripts/update-model-manifest.mjs
                                    </code>{" "}
                                    to pin it.
                                </p>
                            )}
                        </>
                    )}
                    {downloading && (
                        <div className="flex flex-col gap-1">
                            <p>
                                Downloading…{" "}
                                {Math.round((status.progress ?? 0) * 100)}%
                            </p>
                            <div className="h-2 w-full overflow-hidden rounded bg-secondary">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                        width: `${Math.round((status.progress ?? 0) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="text-red-600">
                            {error}
                        </p>
                    )}
                </div>

                <p className="border-t border-border pt-3 text-xs">
                    {model.licenseNotice}.{" "}
                    <a
                        href={model.licenseUrl}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {model.license}
                    </a>
                    . AI output is a draft — review it before use.
                </p>
            </div>
        </InfoModal>
    );
};
