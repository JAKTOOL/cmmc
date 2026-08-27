// Prompt assembly for "draft a narrative from evidence": pure functions from
// (control text, objectives, extracted evidence text) to chat messages that
// fit the model's context window. Chunk selection reuses the hand-rolled
// BM25 index; no new dependencies.

import { TextIndex } from "@/app/search/text_index";
import { IDB, IDBEvidenceText, IDBEvidenceV3 } from "@/app/db";
import { EVIDENCE_CHAR_BUDGET } from "./config";
import type { ChatMessage } from "./protocol";

/** One artifact's extracted text, joined with its filename for display. */
export interface EvidenceDoc {
    evidenceId: string;
    filename: string;
    text: string;
}

export interface GatheredEvidence {
    docs: EvidenceDoc[];
    /** Filenames attached to the requirement whose content could not be
     *  read (extraction skipped/unsupported/failed) — surfaced in the UI so
     *  the user knows the draft does not cover them. */
    unreadable: string[];
}

/** Load the extracted text of every artifact attached to a requirement. */
export const gatherEvidence = async (
    requirementId: string,
): Promise<GatheredEvidence> => {
    const links = await IDB.evidenceRequirements.getAll(
        IDBKeyRange.only(requirementId),
        "requirement_id",
    );
    const docs: EvidenceDoc[] = [];
    const unreadable: string[] = [];
    for (const link of links) {
        const [meta] = (await IDB.evidence.getAll(
            IDBKeyRange.only(link.evidence_id),
        )) as IDBEvidenceV3[];
        if (!meta) {
            continue;
        }
        const [text] = (await IDB.evidenceText.getAll(
            IDBKeyRange.only(link.evidence_id),
        )) as IDBEvidenceText[];
        if (text?.status === "ok" && text.text.trim()) {
            docs.push({
                evidenceId: meta.id,
                filename: meta.filename,
                text: text.text,
            });
        } else {
            unreadable.push(meta.filename);
        }
    }
    return { docs, unreadable };
};

const TARGET_CHUNK_CHARS = 1000;
const MAX_CHUNK_CHARS = 2000;
const MAX_CHUNKS_PER_DOC = 3;

export interface EvidenceChunk {
    /** "{evidenceId}#{seq}" — doubles as the index doc id. */
    id: string;
    evidenceId: string;
    filename: string;
    seq: number;
    text: string;
}

/** Paragraph-aware chunking: pack blank-line-separated paragraphs up to
 *  ~1,000 chars, hard-splitting any oversized paragraph. The extractors emit
 *  one line per paragraph/page/row, so newlines are the natural seams. */
export const chunkDoc = (doc: EvidenceDoc): EvidenceChunk[] => {
    const paragraphs = doc.text
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    const texts: string[] = [];
    let current = "";
    const push = () => {
        if (current) {
            texts.push(current);
            current = "";
        }
    };
    for (const paragraph of paragraphs) {
        if (paragraph.length > MAX_CHUNK_CHARS) {
            push();
            for (
                let offset = 0;
                offset < paragraph.length;
                offset += MAX_CHUNK_CHARS
            ) {
                texts.push(paragraph.slice(offset, offset + MAX_CHUNK_CHARS));
            }
            continue;
        }
        if (current.length + paragraph.length + 1 > TARGET_CHUNK_CHARS) {
            push();
        }
        current = current ? `${current}\n${paragraph}` : paragraph;
    }
    push();
    return texts.map((text, seq) => ({
        id: `${doc.evidenceId}#${seq}`,
        evidenceId: doc.evidenceId,
        filename: doc.filename,
        seq,
        text,
    }));
};

/** Pick the evidence excerpts for the prompt: the first chunk of every
 *  artifact (each attached document gets represented), then the best
 *  BM25 matches for the control text, round-robin across artifacts, until
 *  the character budget runs out. */
export const selectChunks = (
    docs: EvidenceDoc[],
    query: string,
    budget = EVIDENCE_CHAR_BUDGET,
): EvidenceChunk[] => {
    const chunks = docs.flatMap(chunkDoc);
    if (!chunks.length) {
        return [];
    }
    const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const index = new TextIndex(["text", "filename"], { filename: 2 });
    for (const chunk of chunks) {
        index.add(chunk.id, { text: chunk.text, filename: chunk.filename });
    }
    const ranked = index
        .searchAny(query, chunks.length)
        .map((hit) => byId.get(hit.id)!)
        .filter(Boolean);

    const selected: EvidenceChunk[] = [];
    const perDoc = new Map<string, number>();
    let used = 0;
    const take = (chunk: EvidenceChunk): boolean => {
        if (selected.includes(chunk)) {
            return true;
        }
        if (used + chunk.text.length > budget) {
            return false;
        }
        if ((perDoc.get(chunk.evidenceId) ?? 0) >= MAX_CHUNKS_PER_DOC) {
            return true;
        }
        selected.push(chunk);
        perDoc.set(chunk.evidenceId, (perDoc.get(chunk.evidenceId) ?? 0) + 1);
        used += chunk.text.length;
        return true;
    };

    // Every artifact's opening chunk first — even a low-scoring document
    // should be visible to the model (and to the user in the excerpt list).
    for (const doc of docs) {
        const first = byId.get(`${doc.evidenceId}#0`);
        if (first && !take(first)) {
            break;
        }
    }
    for (const chunk of ranked) {
        if (!take(chunk)) {
            break;
        }
    }
    // Stable presentation: group by document, in original document order.
    return selected.sort(
        (a, b) =>
            docs.findIndex((doc) => doc.evidenceId === a.evidenceId) -
                docs.findIndex((doc) => doc.evidenceId === b.evidenceId) ||
            a.seq - b.seq,
    );
};

export interface SummarizeInput {
    requirementId: string;
    title: string;
    /** The requirement statement (with any sub-statement text). */
    statement: string;
    /** Assessment objective prose, when the revision has it. */
    objectives: string[];
    chunks: EvidenceChunk[];
}

/** The retrieval query: control title + statement + objectives. */
export const summarizeQuery = (
    input: Pick<SummarizeInput, "title" | "statement" | "objectives">,
): string =>
    [input.title, input.statement, ...input.objectives].join(" ");

export const buildMessages = (input: SummarizeInput): ChatMessage[] => {
    const objectives = input.objectives.length
        ? `\nAssessment objectives:\n${input.objectives
              .map((objective) => `- ${objective}`)
              .join("\n")}\n`
        : "";
    const excerpts = input.chunks
        .map((chunk) => `--- [${chunk.filename}] (excerpt)\n${chunk.text}`)
        .join("\n");
    return [
        {
            role: "system",
            content:
                "You draft compliance narratives for NIST SP 800-171 / CMMC self-assessments. Write only what the provided evidence excerpts support. Cite evidence by [filename]. Do not invent tools, policies, or facts. Where the evidence does not address part of the requirement, say so plainly.",
        },
        {
            role: "user",
            content: `Requirement ${input.requirementId} — ${input.title}\n${input.statement}\n${objectives}\nEvidence excerpts:\n${excerpts}\n\nWrite a draft implementation narrative (150-250 words, markdown) describing how the organization meets this requirement, citing [filenames]. End with a "Gaps:" bullet list of aspects not covered by the evidence, or "Gaps: none evident."`,
        },
    ];
};
