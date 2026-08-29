"use client";
// The "Draft narrative from evidence" modal — a pure view over the
// draft_job store. The pipeline lives in draft_job.ts so navigation cannot
// kill it; this component only renders state and dispatches store actions.
// A backdrop click minimizes to the bottom chip; ✕ and Close abort the run
// and discard the draft.

import { marked } from "marked";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Label, Select } from "../ui";
import { dispatchDraftInsert } from "./draft_insert";
import {
    closeDraftJob,
    getDraftJob,
    minimizeDraftJob,
    rerunDraftJob,
    stopDraftJob,
    subscribeDraftJob,
} from "./draft_job";

const getServerDraftJob = () => null;

export const DraftPanel = () => {
    const job = useSyncExternalStore(
        subscribeDraftJob,
        getDraftJob,
        getServerDraftJob,
    );
    const [targetId, setTargetId] = useState(
        job?.focusId ?? job?.subStatements[0]?.id ?? "",
    );
    const [mode, setMode] = useState<"append" | "replace">("append");
    const [showSources, setShowSources] = useState(false);
    const [copied, setCopied] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    const phase = job?.phase;
    const draft = job?.draft ?? "";

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

    if (!job) {
        return null;
    }
    const {
        focusId,
        subStatements,
        chunks,
        usedOverviews,
        unreadable,
        findings,
        staleFindings,
        statusNote,
        prompt,
        error,
        returnPath,
    } = job;

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
        closeDraftJob();
    };

    const fileCount = new Set(chunks.map((chunk) => chunk.evidenceId)).size;
    const finished = phase === "done";
    // The insert event is only consumed by the listener on that
    // requirement's page (form_elements.tsx); elsewhere the dispatch would
    // be a silent no-op, so offer the link back instead.
    const onReturnPage = pathname === returnPath;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
            onClick={minimizeDraftJob}
        >
            <div
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                        AI draft{focusId ? ` for ${focusId}` : ""} — review
                        before use
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                            Beta
                        </span>
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={minimizeDraftJob}
                            aria-label="Minimize"
                            title="Minimize — the draft keeps running"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            —
                        </button>
                        <button
                            onClick={closeDraftJob}
                            aria-label="Close"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto px-6 py-4 text-sm">
                    {(chunks.length > 0 || usedOverviews.length > 0) && (
                        <div className="text-muted-foreground">
                            <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => setShowSources(!showSources)}
                            >
                                Using {chunks.length} excerpt
                                {chunks.length === 1 ? "" : "s"} from{" "}
                                {fileCount} file{fileCount === 1 ? "" : "s"}
                                {usedOverviews.length
                                    ? ` and ${usedOverviews.length} document summar${usedOverviews.length === 1 ? "y" : "ies"}`
                                    : ""}
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
                                    {usedOverviews.map((overview) => (
                                        <li
                                            key={`summary-${overview.filename}`}
                                            title={overview.summary}
                                        >
                                            {overview.filename} — document
                                            summary
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

                    {(findings.length > 0 || staleFindings > 0) && (
                        <p className="text-muted-foreground">
                            {findings.length > 0
                                ? `Grounded in ${findings.length} evidence-review finding${findings.length === 1 ? "" : "s"}`
                                : "No current evidence-review findings"}
                            {staleFindings > 0
                                ? ` (${staleFindings} stale finding${staleFindings === 1 ? "" : "s"} ignored — re-run the evidence review)`
                                : ""}
                            .
                        </p>
                    )}
                    {phase === "preparing" && (
                        <p aria-live="polite">{statusNote}</p>
                    )}
                    {prompt && (
                        <details className="text-muted-foreground">
                            <summary className="cursor-pointer">
                                Show prompt sent to the model
                            </summary>
                            <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-surface px-3 py-2 font-mono text-xs">
                                {prompt}
                            </pre>
                        </details>
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

                    {finished &&
                        subStatements.length > 0 &&
                        (onReturnPage ? (
                            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                                {subStatements.length > 1 ? (
                                    <div className="flex flex-col">
                                        <Label
                                            htmlFor="draft-target"
                                            className="my-1"
                                        >
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
                                                <option
                                                    key={sub.id}
                                                    value={sub.id}
                                                >
                                                    {sub.id}
                                                </option>
                                            ))}
                                        </Select>
                                    </div>
                                ) : (
                                    <span className="mb-2 text-muted-foreground">
                                        Insert into {targetId}
                                    </span>
                                )}
                                <div className="flex flex-col">
                                    <Label
                                        htmlFor="draft-mode"
                                        className="my-1"
                                    >
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
                                        <option value="replace">
                                            Replace
                                        </option>
                                    </Select>
                                </div>
                                <Button size="sm" onClick={insert}>
                                    Insert
                                </Button>
                            </div>
                        ) : (
                            <p className="border-t border-border pt-3 text-muted-foreground">
                                This draft targets {focusId ?? targetId} —{" "}
                                <Link
                                    href={returnPath}
                                    className="text-primary underline-offset-2 hover:underline"
                                >
                                    open its page
                                </Link>{" "}
                                to insert. Copy stays available here.
                            </p>
                        ))}
                </div>

                <div className="flex justify-between gap-2 border-t border-border px-6 py-4">
                    <div className="flex gap-2">
                        {phase === "generating" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={stopDraftJob}
                            >
                                Stop
                            </Button>
                        )}
                        {(finished || phase === "error") && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={rerunDraftJob}
                            >
                                Regenerate
                            </Button>
                        )}
                        {finished && draft && (
                            <Button variant="outline" size="sm" onClick={copy}>
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        )}
                    </div>
                    <Button variant="outline" size="sm" onClick={closeDraftJob}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};
