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

/** One stored objective-review verdict, reshaped for the draft prompt.
 *  The caller (draft_panel.tsx) filters out error/unparsed/stale rows. */
export interface ReviewFinding {
    /** CMMC citation, e.g. "AC.L2-3.1.1[a]". */
    citation: string;
    verdict: string;
    reason: string;
    quote?: { text: string; filename: string; verified: boolean };
}

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

const normalizeForMatch = (text: string): string =>
    text.replace(/\s+/g, " ").trim().toLowerCase();

/** Pick the evidence excerpts for the prompt, in priority order: chunks that
 *  contain a pinned quote (sentences the objective review verified against
 *  this evidence — proven relevant, so they beat any BM25 guess), then the
 *  first chunk of every artifact (each attached document gets represented),
 *  then the best BM25 matches for the control text, until the character
 *  budget runs out. */
export const selectChunks = (
    docs: EvidenceDoc[],
    query: string,
    { budget = EVIDENCE_CHAR_BUDGET, pinnedQuotes = [] as string[] } = {},
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

    // Quote-bearing chunks first: the review already tied these passages to
    // the objective, so they must survive the budget cut.
    const quotes = pinnedQuotes.map(normalizeForMatch).filter(Boolean);
    if (quotes.length) {
        for (const chunk of chunks) {
            const haystack = normalizeForMatch(chunk.text);
            if (quotes.some((quote) => haystack.includes(quote))) {
                if (!take(chunk)) {
                    break;
                }
            }
        }
    }
    // Then the BM25 matches. Opening chunks come last: they are mostly
    // purpose/title boilerplate, and under a tight budget the
    // every-artifact-visible guarantee was crowding out the chunks with
    // actual implementation detail.
    for (const chunk of ranked) {
        if (!take(chunk)) {
            break;
        }
    }
    for (const doc of docs) {
        const first = byId.get(`${doc.evidenceId}#0`);
        if (first && !take(first)) {
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
    /** Stored objective-review verdicts to ground the draft in. */
    findings?: ReviewFinding[];
    /** Sub-statement id when the draft targets one control (e.g.
     *  "03.01.01.a") instead of the whole requirement. */
    focusId?: string;
}

/** The retrieval query: control title + statement + objectives. */
export const summarizeQuery = (
    input: Pick<SummarizeInput, "title" | "statement" | "objectives">,
): string =>
    [input.title, input.statement, ...input.objectives].join(" ");

export const buildMessages = (input: SummarizeInput): ChatMessage[] => {
    const objectives = input.objectives.length
        ? `\n${input.objectives
              .map((objective) => `- ${objective}`)
              .join("\n")}\n`
        : "";
    // Review findings are secondary grounding: verdicts and reasons steer
    // what the narrative claims (and what lands under "Gaps:"), and each
    // verified quote points at the excerpt that proves it.
    const findings = input.findings?.length
        ? `\nPrior evidence-review findings (one per objective, from the same excerpts):\n${input.findings
              .map(
                  (finding) =>
                      `- ${finding.citation}: ${finding.verdict}` +
                      (finding.reason ? ` — ${finding.reason}` : "") +
                      (finding.quote?.verified
                          ? `\n  Supporting quote: "${finding.quote.text}" [${finding.quote.filename}]`
                          : ""),
              )
              .join("\n")}\n`
        : "";
    const excerpts = input.chunks
        .map((chunk) => `--- [${chunk.filename}] (excerpt)\n${chunk.text}`)
        .join("\n");
    // Prompt shape tuned for small local models: the objectives are labeled
    // as a checklist and explicitly fenced off from the output, because their
    // ready-made compliance phrasing is exactly what a small model will
    // otherwise paraphrase instead of reading the excerpts. The grounding
    // instruction demands concrete nouns from the excerpts, which generic
    // boilerplate cannot satisfy. The output rules are blunt and repeated
    // ("only the narrative", "no headings", "start with the first sentence")
    // because the observed failure is the model echoing the context sections
    // back — headings, statement, excerpt list — and running out of output
    // tokens before the narrative finishes.
    return [
        {
            role: "system",
            content:
                "You draft implementation narratives for NIST SP 800-171 / CMMC self-assessments. Your entire response is the narrative and a closing gaps list — nothing else. Every sentence must be grounded in the evidence excerpts: use the specific system names, tool names, policy titles, settings, and frequencies they contain, and cite the source as [filename] after each claim. Only cite a file whose excerpt actually contains that detail. Never restate the requirement or the assessment objectives in generic terms. If the excerpts do not address something, say so instead of inventing it.",
        },
        {
            role: "user",
            content: `Context — reference material only; do not repeat any of it in your response.

Requirement ${input.requirementId} — ${input.title}
${input.statement}
${objectives ? `\nAssessment objectives (a coverage checklist — do NOT copy their wording):${objectives}` : ""}${findings}
Evidence excerpts:
${excerpts}

Task: write the draft implementation narrative (${input.focusId ? "100-200" : "150-250"} words) describing how the organization meets ${input.focusId ? `statement ${input.focusId} of this requirement` : "this requirement"}.

Output rules:
- Output ONLY the narrative paragraphs and then the gaps list. No title, no headings, no introduction, no repetition of the statement, objectives, or excerpts.
- Every paragraph quotes or closely paraphrases concrete details from the excerpts, each cited as [filename] — and only the file whose excerpt contains that detail.
- [filename] copied exactly from an excerpt header is the ONLY citation form. Never write page numbers, section numbers, or links — the excerpts have none, so any you write are invented.${input.findings?.some((finding) => finding.quote?.verified) ? "\n- Build the narrative around the supporting quotes in the review findings." : ""}
- A sentence that could apply to any organization is a wasted sentence — be specific to this evidence.
- End with "Gaps:" followed by plain-text bullets — no citations, no objective ids beyond those given above — each naming something ${input.focusId ? "this statement's objective requires" : "the objectives require"} that the excerpts do not demonstrate${input.findings?.length ? " (the not-met and no-evidence findings belong here)" : ""}. If nothing is missing, end with "Gaps: none evident."

Start your response with a specific fact from the excerpts.`,
        },
    ];
};
