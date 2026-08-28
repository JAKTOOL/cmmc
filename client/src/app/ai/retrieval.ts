// Ad-hoc BM25 retrieval over the chunks of one requirement's evidence. The
// index is built once per review run and shared by all of the requirement's
// objectives; searchAny (OR semantics) is required — the AND semantics of
// search() return zero chunks for a 30-word objective query.

import { EvidenceDoc, chunkDoc } from "@/app/llm/prompt";
import type { DocSummary } from "@/app/llm/summarize";
import { TextIndex } from "@/app/search/text_index";
import { chunkText } from "./chunker";
import type { ReviewObjective } from "./objectives";

export interface RetrievedChunk {
    /** "{evidenceId}#{seq}" */
    id: string;
    evidenceId: string;
    seq: number;
    text: string;
    filename: string;
    score: number;
}

export interface ChunkIndex {
    index: TextIndex;
    chunksById: Map<string, Omit<RetrievedChunk, "score">>;
    /** Summary index doc id ("s:{evidenceId}#{seq}") -> the raw chunk id its
     *  score transfers to. Summary hits never enter the prompt themselves —
     *  only verbatim text is quotable. */
    summaryTargets: Map<string, string>;
}

const normalize = (text: string): string =>
    text.replace(/\s+/g, " ").trim().toLowerCase();

/** Chunk all texts and index them; milliseconds for a requirement's worth of
 *  evidence, so nothing is persisted. Stored chunk summaries (map step of
 *  llm/summarize.ts) are indexed as extra searchable docs: an objective can
 *  match a summary's vocabulary even when the raw text phrases it
 *  differently, and the hit boosts the raw chunk holding that content. */
export const buildChunkIndex = (
    docs: EvidenceDoc[],
    summaries: DocSummary[] = [],
): ChunkIndex => {
    const index = new TextIndex(["text", "filename"], { filename: 2 });
    const chunksById = new Map<string, Omit<RetrievedChunk, "score">>();
    for (const doc of docs) {
        for (const chunk of chunkText(doc.evidenceId, doc.text)) {
            chunksById.set(chunk.id, { ...chunk, filename: doc.filename });
            index.add(chunk.id, {
                text: chunk.text,
                filename: doc.filename,
            });
        }
    }

    // The summaries were produced over chunkDoc's chunking, which differs
    // from chunkText's. Bridge the two by locating each summarized chunk's
    // opening text inside this doc's raw chunks — both chunkings cover the
    // same extracted text, so the head appears in exactly one (or, with
    // overlap, two) of them.
    const summaryTargets = new Map<string, string>();
    for (const summary of summaries) {
        const doc = docs.find(
            (candidate) => candidate.evidenceId === summary.evidenceId,
        );
        if (!doc) {
            continue;
        }
        const rawChunks = [...chunksById.values()].filter(
            (chunk) => chunk.evidenceId === summary.evidenceId,
        );
        const sourceChunks = chunkDoc(doc);
        summary.chunkSummaries.forEach((chunkSummary, seq) => {
            const head = normalize(sourceChunks[seq]?.text ?? "").slice(
                0,
                120,
            );
            if (!head) {
                return;
            }
            const target = rawChunks.find((chunk) =>
                normalize(chunk.text).includes(head),
            );
            if (!target) {
                return;
            }
            const id = `s:${summary.evidenceId}#${seq}`;
            summaryTargets.set(id, target.id);
            index.add(id, { text: chunkSummary, filename: summary.filename });
        });
    }
    return { index, chunksById, summaryTargets };
};

/** Seam for a future embedding model to re-order BM25 candidates; identity
 *  until one is registered. */
export type Reranker = (
    objective: ReviewObjective,
    chunks: RetrievedChunk[],
) => RetrievedChunk[];

let reranker: Reranker | undefined;

export const setReranker = (next: Reranker | undefined): void => {
    reranker = next;
};

/** Best chunks for one objective, over-fetched to `limit * 2` so the prompt
 *  builder can drop chunks that do not fit the token budget. Summary hits
 *  fold their score into the raw chunk they summarize, so the returned
 *  chunks are always verbatim text. */
export const retrieveForObjective = (
    objective: ReviewObjective,
    { index, chunksById, summaryTargets }: ChunkIndex,
    limit = 8,
): RetrievedChunk[] => {
    const query = [
        objective.text,
        objective.requirementStatement,
        ...objective.methodTerms,
        ...objective.considerations,
    ].join(" ");
    // Over-fetch beyond the return cap: summary hits collapse onto raw
    // chunks, so distinct hits can merge.
    const scores = new Map<string, number>();
    for (const hit of index.searchAny(query, limit * 3)) {
        const id = summaryTargets.get(hit.id) ?? hit.id;
        scores.set(id, (scores.get(id) ?? 0) + hit.score);
    }
    const hits = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit * 2)
        .map(([id, score]) => ({ ...chunksById.get(id)!, score }));
    return reranker ? reranker(objective, hits) : hits;
};
