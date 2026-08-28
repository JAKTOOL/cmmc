"use client";
// The "Draft narrative from evidence" modal: loads the model if needed,
// gathers the requirement's readable evidence, streams the draft, and lets
// the user insert it into a chosen description field through the normal
// autosave path. The draft itself is ephemeral — nothing persists until the
// user inserts it.

import { ElementWrapper } from "@/api/entities/Framework";
import {
    considerationsForObjective,
    getAssessmentGuidance,
} from "@/api/entities/AssessmentGuide";
import { expectedReviewState } from "@/app/ai/review";
import { IDB } from "@/app/db";
import {
    DRAFT_MAX_NEW_TOKENS,
    EVIDENCE_CHAR_BUDGET,
    getModel,
} from "@/app/llm/config";
import {
    GenerateHandle,
    ensureLoaded,
    generate,
    subscribeLlmStatus,
} from "@/app/llm/engine";
import {
    EvidenceChunk,
    ReviewFinding,
    buildMessages,
    gatherEvidence,
    selectChunks,
    summarizeQuery,
} from "@/app/llm/prompt";
import { ensureDocSummary } from "@/app/llm/summarize";
import { getSelectedModelId } from "@/app/llm/settings";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";
import { Button, Label, Select } from "../ui";
import { dispatchDraftInsert } from "./draft_insert";

type Phase = "preparing" | "generating" | "done" | "error";

/** The deterministic tail of a draft: a gaps list derived from the stored
 *  review verdicts and the list of files the excerpts came from. Kept out of
 *  the model's hands — it dropped, truncated, or embellished both whenever
 *  it was asked to write them. */
const draftAppendix = (
    findings: ReviewFinding[],
    chunks: EvidenceChunk[],
): string => {
    const gaps = findings.filter((finding) => finding.verdict !== "met");
    const parts: string[] = [];
    if (findings.length) {
        parts.push(
            gaps.length
                ? `Gaps (from the evidence review):\n${gaps
                      .map(
                          (finding) =>
                              `- ${finding.citation} — ${finding.verdict}${finding.reason ? `: ${finding.reason}` : ""}`,
                      )
                      .join("\n")}`
                : "Gaps: none evident (per the evidence review).",
        );
    }
    if (chunks.length) {
        const files = [...new Set(chunks.map((chunk) => chunk.filename))];
        parts.push(`Sources: ${files.join(", ")}`);
    }
    return parts.join("\n\n");
};

// Objectives can be long; cap what enters the prompt (~600 tokens shared
// with the statement, see llm/config.ts budget notes).
const MAX_OBJECTIVE_CHARS = 1600;
const MAX_STATEMENT_CHARS = 1200;

export interface DraftPanelProps {
    requirement: ElementWrapper;
    /** The requirement's sub-statements: insertion targets and prompt text. */
    subStatements: { id: string; text: string }[];
    /** When set, the draft targets this one control: the prompt scopes to
     *  its statement and objective, and its stored objective review grounds
     *  the narrative. */
    focusId?: string;
    onClose: () => void;
}

export const DraftPanel = ({
    requirement,
    subStatements,
    focusId,
    onClose,
}: DraftPanelProps) => {
    const requirementId = requirement.element_identifier;
    const [phase, setPhase] = useState<Phase>("preparing");
    const [statusNote, setStatusNote] = useState("Preparing…");
    const [draft, setDraft] = useState("");
    const [chunks, setChunks] = useState<EvidenceChunk[]>([]);
    const [unreadable, setUnreadable] = useState<string[]>([]);
    const [findings, setFindings] = useState<ReviewFinding[]>([]);
    const [staleFindings, setStaleFindings] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [targetId, setTargetId] = useState(
        focusId ?? subStatements[0]?.id ?? "",
    );
    const [mode, setMode] = useState<"append" | "replace">("append");
    const [showSources, setShowSources] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [copied, setCopied] = useState(false);
    const handleRef = useRef<GenerateHandle | null>(null);
    const abortRef = useRef<AbortController | null>(null);
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
        abortRef.current?.abort();
        const aborter = new AbortController();
        abortRef.current = aborter;
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

            // Map-reduce document summaries: cached after the first run, so
            // this is slow exactly once per file/model/pipeline version.
            const overviews: { filename: string; summary: string }[] = [];
            for (const doc of docs) {
                setStatusNote(`Summarizing ${doc.filename}…`);
                const row = await ensureDocSummary(doc, model.id, {
                    signal: aborter.signal,
                    onProgress: ({ filename, done, total }) =>
                        setStatusNote(
                            `Summarizing ${filename} (${done + 1}/${total})…`,
                        ),
                });
                if (runId !== runIdRef.current) {
                    return;
                }
                overviews.push({
                    filename: doc.filename,
                    summary: row.summary,
                });
            }

            // Stored objective-review verdicts for this requirement (or just
            // the focused control): extra grounding beyond the raw excerpts.
            // Skip failed rows, and rows whose fingerprint says the evidence
            // or pipeline changed since the review ran.
            const reviewRows = (
                await IDB.objectiveReviews.getAll(
                    IDBKeyRange.only(requirementId),
                    "requirement_id",
                )
            )
                .filter(
                    (row) =>
                        row.verdict !== "error" && row.verdict !== "unparsed",
                )
                .filter((row) => !focusId || row.objective_id === focusId)
                .sort((a, b) =>
                    a.objective_id.localeCompare(b.objective_id),
                );
            const { fingerprint } = await expectedReviewState(requirementId);
            const freshRows = fingerprint
                ? reviewRows.filter((row) => row.fingerprint === fingerprint)
                : reviewRows;
            setStaleFindings(reviewRows.length - freshRows.length);
            const reviewFindings: ReviewFinding[] = freshRows.map((row) => ({
                citation: row.citation,
                verdict: row.verdict,
                reason: row.reason,
                quote: row.quote
                    ? {
                          text: row.quote.text,
                          filename: row.quote.filename,
                          verified: row.quote.verified,
                      }
                    : undefined,
            }));
            setFindings(reviewFindings);

            // The letter after the requirement id ("03.01.01.a" → "a") keys
            // the assessment objectives; a focused draft only gets its own.
            const focusLetter = focusId?.startsWith(`${requirementId}.`)
                ? focusId.slice(requirementId.length + 1)
                : undefined;
            const objectives = Object.entries(
                getAssessmentGuidance(requirementId)?.requirement
                    .assessment_objectives ?? {},
            )
                .filter(([letter]) => !focusLetter || letter === focusLetter)
                .map(([, objective]) => objective.trim())
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

            // Verified quotes are known-relevant passages: their chunks are
            // pinned into the prompt, and their wording sharpens the BM25
            // query so retrieval stops surfacing filler excerpts. The
            // "Potential Assessment Considerations" questions bound to this
            // control's letter join the query for the same reason — their
            // concrete noun phrases match evidence language better than the
            // abstract objective wording. Query only; the model never sees
            // them.
            const verifiedQuotes = reviewFindings
                .filter((finding) => finding.quote?.verified)
                .map((finding) => finding.quote!.text);
            const considerations = focusLetter
                ? considerationsForObjective(requirementId, focusLetter)
                : (getAssessmentGuidance(requirementId)?.furtherDiscussion
                      .considerations ?? []);
            // The overviews spend from the same input window as the
            // excerpts. Shrink the excerpt budget by what they use — an
            // overshoot makes the worker trim the tail of the message, which
            // is the task and example, not the excerpts.
            const overviewChars = overviews.reduce(
                (total, overview) =>
                    total +
                    Math.min(overview.summary.length, 400) +
                    overview.filename.length +
                    4,
                0,
            );
            const selected = selectChunks(
                docs,
                [
                    summarizeQuery({ title, statement, objectives }),
                    ...considerations,
                    ...verifiedQuotes,
                ].join(" "),
                {
                    budget: Math.max(
                        1200,
                        EVIDENCE_CHAR_BUDGET - overviewChars,
                    ),
                    pinnedQuotes: verifiedQuotes,
                },
            );
            setChunks(selected);

            if (runId !== runIdRef.current) {
                return;
            }
            const messages = buildMessages({
                requirementId,
                title,
                statement,
                objectives,
                chunks: selected,
                overviews,
                findings: reviewFindings,
                focusId,
            });
            // Expose exactly what the model receives ("Show prompt" below),
            // so grounding problems are inspectable instead of guessed at.
            setPrompt(
                messages
                    .map((message) => `[${message.role}]\n${message.content}`)
                    .join("\n\n"),
            );
            setPhase("generating");
            const handle = generate(
                messages,
                (token) => setDraft((current) => current + token),
                { maxNewTokens: DRAFT_MAX_NEW_TOKENS },
            );
            handleRef.current = handle;
            await handle.result;
            if (runId === runIdRef.current) {
                // The model only writes the narrative prose. Gaps and sources
                // are appended here, in code: the gaps come straight from the
                // review verdicts and the source list from the excerpts that
                // were actually in the prompt, so neither can be invented or
                // truncated away by the model.
                const appendix = draftAppendix(reviewFindings, selected);
                if (appendix) {
                    setDraft(
                        (current) => `${current.trimEnd()}\n\n${appendix}`,
                    );
                }
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
            abortRef.current?.abort();
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
                        AI draft{focusId ? ` for ${focusId}` : ""} — review
                        before use
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

                    {finished && subStatements.length > 0 && (
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
