"use client";
// Entry point for the evidence summarizer on the requirement detail page.
// Renders nothing on the free web tier. When weights are missing it opens
// the AI settings modal (consent + download) instead of the draft panel.

import { ElementWrapper } from "@/api/entities/Framework";
import { IDB, TABLE_CHANGED_EVENT } from "@/app/db";
import { getModel, isPinned } from "@/app/llm/config";
import { getDeviceCapabilities } from "@/app/llm/capabilities";
import { weightsAvailable } from "@/app/llm/engine";
import { getSelectedModelId, isAiEnabled } from "@/app/llm/settings";
import { FREE_TIER } from "@/app/utils/tier";
import { useEffect, useState } from "react";
import { Button } from "../ui";
import { DraftPanel } from "./draft_panel";
import { openAiSettings } from "./model_settings";

export const SummarizeButton = ({
    requirement,
    subStatements,
    focusId,
    locked,
}: {
    requirement: ElementWrapper;
    subStatements: { id: string; text: string }[];
    /** Scope the draft to this one control (see DraftPanel). */
    focusId?: string;
    locked?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [hasEvidence, setHasEvidence] = useState(false);
    const [weightsReady, setWeightsReady] = useState(false);
    const [supported, setSupported] = useState(true);
    const requirementId = requirement.element_identifier;

    useEffect(() => {
        if (FREE_TIER) {
            return;
        }
        let cancelled = false;
        const refreshEvidence = async () => {
            const links = await IDB.evidenceRequirements.getAll(
                IDBKeyRange.only(requirementId),
                "requirement_id",
            );
            if (!cancelled) {
                setHasEvidence(links.length > 0);
            }
        };
        refreshEvidence();
        window.addEventListener(TABLE_CHANGED_EVENT, refreshEvidence);
        return () => {
            cancelled = true;
            window.removeEventListener(TABLE_CHANGED_EVENT, refreshEvidence);
        };
    }, [requirementId]);

    useEffect(() => {
        if (FREE_TIER) {
            return;
        }
        let cancelled = false;
        (async () => {
            const model = getModel(getSelectedModelId());
            if (!model || !isPinned(model)) {
                if (!cancelled) {
                    setSupported(false);
                    setWeightsReady(false);
                }
                return;
            }
            const { device } = await getDeviceCapabilities();
            const deviceOk = device === "webgpu" || model.minDevice === "wasm";
            // Weights are build-time assets; their presence cannot change
            // while the page is open, so one probe is enough.
            const ready = deviceOk && (await weightsAvailable(model));
            if (!cancelled) {
                setSupported(deviceOk);
                setWeightsReady(ready);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (FREE_TIER || locked || !isAiEnabled()) {
        return null;
    }

    const disabled = !hasEvidence || !supported;
    const title = !supported
        ? "No usable model on this device — open AI Assistant in the menu"
        : !hasEvidence
          ? "Attach evidence to this requirement first"
          : "Draft a narrative from the attached evidence";

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                title={title}
                onClick={() => (weightsReady ? setOpen(true) : openAiSettings())}
                data-tour="draft-evidence"
            >
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
                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                    />
                </svg>
                Draft from evidence
            </Button>
            {open && (
                <DraftPanel
                    requirement={requirement}
                    subStatements={subStatements}
                    focusId={focusId}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
};
