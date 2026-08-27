"use client";
// The "Draft narrative from evidence" modal: loads the model if needed,
// gathers the requirement's readable evidence, streams the draft, and lets
// the user insert it into a chosen description field through the normal
// autosave path. The draft itself is ephemeral — nothing persists until the
// user inserts it.

import { ElementWrapper } from "@/api/entities/Framework";
import { getAssessmentGuidance } from "@/api/entities/AssessmentGuide";
import { getModel } from "@/app/llm/config";
import {
    GenerateHandle,
    ensureLoaded,
    generate,
    subscribeLlmStatus,
} from "@/app/llm/engine";
import {
    EvidenceChunk,
    buildMessages,
    gatherEvidence,
    selectChunks,
    summarizeQuery,
} from "@/app/llm/prompt";
import { getSelectedModelId } from "@/app/llm/settings";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";
import { Button, Label, Select } from "../ui";
import { dispatchDraftInsert } from "./draft_insert";

type Phase = "preparing" | "generating" | "done" | "error";

// Objectives can be long; cap what enters the prompt (~600 tokens shared
// with the statement, see llm/config.ts budget notes).
const MAX_OBJECTIVE_CHARS = 1600;
const MAX_STATEMENT_CHARS = 1200;

export interface DraftPanelProps {
    requirement: ElementWrapper;
    /** The requirement's sub-statements: insertion targets and prompt text. */
    subStatements: { id: string; text: string }[];
    onClose: () => void;
}

export const DraftPanel = ({
    requirement,
    subStatements,
    onClose,
}: DraftPanelProps) => {
    const requirementId = requirement.element_identifier;
    const [phase, setPhase] = useState<Phase>("preparing");
    const [statusNote, setStatusNote] = useState("Preparing…");
    const [draft, setDraft] = useState("");
    const [chunks, setChunks] = useState<EvidenceChunk[]>([]);
    const [unreadable, setUnreadable] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [targetId, setTargetId] = useState(subStatements[0]?.id ?? "");
    const [mode, setMode] = useState<"append" | "replace">("append");
    const [showSources, setShowSources] = useState(false);
    const [copied, setCopied] = useState(false);
    const handleRef = useRef<GenerateHandle | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const runIdRef = useRef(0);

    useEffect(
        () =>
            subscribeLlmStatus((status) => {
                if (status.phase === "loading") {
                    setStatusNote(
                        `Loading model… ${Math.round((status.progress ?? 0) * 100)}%`,
                    );
                }
            }),
        [],
    );

    const run = async () => {
        const runId = ++runIdRef.current;
        setPhase("preparing");
        setDraft("");
        setError(null);
        try {
            const model = getModel(getSelectedModelId());
            if (!model) {
                throw new Error("No model selected");
            }
            setStatusNote("Loading model…");
            await ensureLoaded(model);
            if (runId !== runIdRef.current) {
                return;
            }

            setStatusNote("Reading evidence…");
            const { docs, unreadable: skipped } =
                await gatherEvidence(requirementId);
            setUnreadable(skipped);
            if (!docs.length) {
                throw new Error(
                    "None of the attached evidence has readable text. Attach documents with text content, or wait for text extraction to finish.",
                );
            }

            const objectives = Object.values(
                getAssessmentGuidance(requirementId)?.requirement
                    .assessment_objectives ?? {},
            )
                .map((objective) => objective.trim())
                .filter(Boolean);
            while (
                objectives.join(" ").length > MAX_OBJECTIVE_CHARS &&
                objectives.length > 1
            ) {
                objectives.pop();
            }
            const statement = [
                requirement.text,
                ...subStatements.map((sub) => `${sub.id}: ${sub.text}`),
            ]
                .filter(Boolean)
                .join("\n")
                .slice(0, MAX_STATEMENT_CHARS);
            const title = requirement.title ?? "";

            const selected = selectChunks(
                docs,
                summarizeQuery({ title, statement, objectives }),
            );
            setChunks(selected);

            if (runId !== runIdRef.current) {
                return;
            }
            setPhase("generating");
            const handle = generate(
                buildMessages({
                    requirementId,
                    title,
                    statement,
                    objectives,
                    chunks: selected,
                }),
                (token) => setDraft((current) => current + token),
            );
            handleRef.current = handle;
            await handle.result;
            if (runId === runIdRef.current) {
                setPhase("done");
            }
        } catch (runError) {
            if (runId === runIdRef.current) {
                setError(
                    runError instanceof Error
                        ? runError.message
                        : String(runError),
                );
                setPhase("error");
            }
        } finally {
            handleRef.current = null;
        }
    };

    useEffect(() => {
        run();
        return () => {
            runIdRef.current++;
            handleRef.current?.abort();
        };
        // Re-running is explicit (Regenerate button); the requirement cannot
        // change while the panel is open.
    }, []);

    // Render the finished draft as markdown, matching how the description
    // fields display; while streaming, plain text avoids re-parsing per token.
    useEffect(() => {
        if (phase === "done" && outputRef.current) {
            (async () => {
                if (outputRef.current) {
                    outputRef.current.innerHTML = await marked(draft);
                }
            })();
        }
    }, [phase, draft]);

    // Aborting makes the worker finish early, so the normal "done" path runs
    // with the partial draft.
    const stop = () => handleRef.current?.abort();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(draft);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable; the text stays selectable in the panel.
        }
    };

    const insert = () => {
        dispatchDraftInsert({
            key: `${targetId}.description`,
            text: draft,
            mode,
        });
        onClose();
    };

    const fileCount = new Set(chunks.map((chunk) => chunk.evidenceId)).size;
    const finished = phase === "done";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h2 className="text-lg font-semibold tracking-tight">
                        AI draft — review before use
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto px-6 py-4 text-sm">
                    {chunks.length > 0 && (
                        <div className="text-muted-foreground">
                            <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => setShowSources(!showSources)}
                            >
                                Using {chunks.length} excerpt
                                {chunks.length === 1 ? "" : "s"} from{" "}
                                {fileCount} file{fileCount === 1 ? "" : "s"}
                                {unreadable.length
                                    ? ` (${unreadable.length} not readable)`
                                    : ""}
                            </button>
                            {showSources && (
                                <ul className="mt-1 list-inside list-disc">
                                    {chunks.map((chunk) => (
                                        <li key={chunk.id}>
                                            {chunk.filename} — excerpt{" "}
                                            {chunk.seq + 1}
                                        </li>
                                    ))}
                                    {unreadable.map((filename) => (
                                        <li
                                            key={filename}
                                            className="opacity-60"
                                        >
                                            {filename} — no readable text
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {phase === "preparing" && (
                        <p aria-live="polite">{statusNote}</p>
                    )}
                    {phase === "error" && (
                        <p role="alert" className="text-red-600">
                            {error}
                        </p>
                    )}

                    {phase === "generating" && (
                        <pre className="whitespace-pre-wrap break-words rounded-md border border-input bg-surface px-3 py-2 font-sans text-sm">
                            {draft || "…"}
                        </pre>
                    )}
                    {finished && (
                        <div
                            ref={outputRef}
                            className="md-output rounded-md border border-input bg-surface px-3 py-2 text-sm"
                        />
                    )}

                    {finished && subStatements.length > 0 && (
                        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                            <div className="flex flex-col">
                                <Label htmlFor="draft-target" className="my-1">
                                    Insert into
                                </Label>
                                <Select
                                    id="draft-target"
                                    value={targetId}
                                    onChange={(event) =>
                                        setTargetId(event.target.value)
                                    }
                                >
                                    {subStatements.map((sub) => (
                                        <option key={sub.id} value={sub.id}>
                                            {sub.id}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div className="flex flex-col">
                                <Label htmlFor="draft-mode" className="my-1">
                                    Mode
                                </Label>
                                <Select
                                    id="draft-mode"
                                    value={mode}
                                    onChange={(event) =>
                                        setMode(
                                            event.target.value as
                                                | "append"
                                                | "replace",
                                        )
                                    }
                                >
                                    <option value="append">Append</option>
                                    <option value="replace">Replace</option>
                                </Select>
                            </div>
                            <Button size="sm" onClick={insert}>
                                Insert
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-between gap-2 border-t border-border px-6 py-4">
                    <div className="flex gap-2">
                        {phase === "generating" && (
                            <Button variant="outline" size="sm" onClick={stop}>
                                Stop
                            </Button>
                        )}
                        {(finished || phase === "error") && (
                            <Button variant="outline" size="sm" onClick={run}>
                                Regenerate
                            </Button>
                        )}
                        {finished && draft && (
                            <Button variant="outline" size="sm" onClick={copy}>
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        )}
                    </div>
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};
