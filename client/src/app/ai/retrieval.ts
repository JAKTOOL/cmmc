// Ad-hoc BM25 retrieval over the chunks of one requirement's evidence. The
// index is built once per review run and shared by all of the requirement's
// objectives; searchAny (OR semantics) is required — the AND semantics of
// search() return zero chunks for a 30-word objective query.

import type { EvidenceDoc } from "@/app/llm/prompt";
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
}

/** Chunk all texts and index them; milliseconds for a requirement's worth of
 *  evidence, so nothing is persisted. */
export const buildChunkIndex = (docs: EvidenceDoc[]): ChunkIndex => {
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
    return { index, chunksById };
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
 *  builder can drop chunks that do not fit the token budget. */
export const retrieveForObjective = (
    objective: ReviewObjective,
    { index, chunksById }: ChunkIndex,
    limit = 8,
): RetrievedChunk[] => {
    const query = [
        objective.text,
        objective.requirementStatement,
        ...objective.methodTerms,
    ].join(" ");
    // Every hit id comes from the index, which was populated from
    // chunksById, so the lookup always succeeds.
    const hits = index
        .searchAny(query, limit * 2)
        .map((hit) => ({ ...chunksById.get(hit.id)!, score: hit.score }));
    return reranker ? reranker(objective, hits) : hits;
};
