"use client";
// Map-reduce summarization of evidence documents: summarize each chunk of a
// document (map), then summarize the summaries (reduce), and persist the
// result keyed by the artifact's content hash. Summaries are prompt CONTEXT
// only — verbatim excerpts remain the quotable grounding, because a 1B
// model's summaries blur specifics and nothing can be quote-verified
// against them. Expensive on first run (one generation per chunk), then
// cached until the file, extractor, model, or this pipeline changes.

import { IDB, IDBEvidenceSummary } from "@/app/db";
import { EXTRACTOR_VERSION } from "@/app/search/extract_text";
import { sha256Hex } from "@/app/utils/hash";
import { generate } from "./engine";
import { EvidenceDoc, chunkDoc } from "./prompt";
import type { ChatMessage } from "./protocol";

/** Bump when the summarize prompts or chunking use changes shape. */
export const SUMMARY_VERSION = 1;

/** Output budgets: chunk summaries are 2-3 sentences, the document summary
 *  3-5. Small on purpose — summaries are context, not the deliverable. */
const CHUNK_SUMMARY_TOKENS = 120;
const DOC_SUMMARY_TOKENS = 200;

/** How many chunk summaries one reduce call may consume. Beyond this the
 *  reduce recurses in batches (a summary tree), keeping every prompt within
 *  the model's input cap. */
const REDUCE_BATCH = 12;

const SYSTEM = `You summarize excerpts of compliance evidence documents. Keep every concrete detail: system names, tool names, policy titles, settings, frequencies, and role names. Write plain present-tense prose with no preamble and no commentary.`;

const run = async (
    messages: ChatMessage[],
    maxNewTokens: number,
    signal?: AbortSignal,
): Promise<string> => {
    const handle = generate(messages, () => {}, { maxNewTokens });
    signal?.addEventListener("abort", () => handle.abort(), { once: true });
    const { text } = await handle.result;
    // An abort resolves with partial text; never treat that as a summary.
    if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
    }
    return text.trim();
};

const summarizeChunk = (
    filename: string,
    text: string,
    signal?: AbortSignal,
): Promise<string> =>
    run(
        [
            { role: "system", content: SYSTEM },
            {
                role: "user",
                content: `Excerpt from "${filename}":\n${text}\n\nSummarize this excerpt in two or three sentences.`,
            },
        ],
        CHUNK_SUMMARY_TOKENS,
        signal,
    );

const reduceSummaries = async (
    filename: string,
    summaries: string[],
    signal?: AbortSignal,
): Promise<string> => {
    if (summaries.length === 1) {
        return summaries[0];
    }
    if (summaries.length > REDUCE_BATCH) {
        const batches: string[] = [];
        for (let i = 0; i < summaries.length; i += REDUCE_BATCH) {
            batches.push(
                await reduceSummaries(
                    filename,
                    summaries.slice(i, i + REDUCE_BATCH),
                    signal,
                ),
            );
        }
        return reduceSummaries(filename, batches, signal);
    }
    return run(
        [
            { role: "system", content: SYSTEM },
            {
                role: "user",
                content: `Section summaries of "${filename}", in order:\n${summaries
                    .map((summary) => `- ${summary}`)
                    .join(
                        "\n",
                    )}\n\nCombine them into a single summary of three to five sentences describing what this document establishes.`,
            },
        ],
        DOC_SUMMARY_TOKENS,
        signal,
    );
};

const summaryFingerprint = (evidenceId: string, modelId: string) =>
    sha256Hex(
        [
            evidenceId,
            `extractor:${EXTRACTOR_VERSION}`,
            `summary:${SUMMARY_VERSION}`,
            `model:${modelId}`,
        ].join("\n"),
    );

export interface SummarizeProgress {
    filename: string;
    /** Chunks summarized so far in the current document. */
    done: number;
    total: number;
}

/** The cached summary for a document, or a fresh map-reduce run when the
 *  cache is missing or stale. The model must already be loaded. */
export const ensureDocSummary = async (
    doc: EvidenceDoc,
    modelId: string,
    {
        signal,
        onProgress,
    }: {
        signal?: AbortSignal;
        onProgress?: (progress: SummarizeProgress) => void;
    } = {},
): Promise<IDBEvidenceSummary> => {
    const fingerprint = await summaryFingerprint(doc.evidenceId, modelId);
    const [cached] = await IDB.evidenceSummaries.getAll(
        IDBKeyRange.only(doc.evidenceId),
    );
    if (cached && cached.fingerprint === fingerprint) {
        return cached;
    }

    const chunks = chunkDoc(doc);
    const chunkSummaries: string[] = [];
    for (const chunk of chunks) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        onProgress?.({
            filename: doc.filename,
            done: chunkSummaries.length,
            total: chunks.length,
        });
        chunkSummaries.push(
            await summarizeChunk(doc.filename, chunk.text, signal),
        );
    }
    const summary = await reduceSummaries(
        doc.filename,
        chunkSummaries,
        signal,
    );

    const row: IDBEvidenceSummary = {
        evidence_id: doc.evidenceId,
        chunk_summaries: chunkSummaries,
        summary,
        fingerprint,
        model: modelId,
        created: Date.now(),
    };
    await IDB.evidenceSummaries.put(row);
    return row;
};
