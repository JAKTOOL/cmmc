// Paragraph-aware chunking for the review retrieval index. Chunks are built
// on the fly at review time — the scope is one requirement's evidence, so
// there is no chunk store and no migration; CHUNKER_VERSION only feeds the
// review staleness fingerprint.

/** Bump when chunking changes shape; part of the review fingerprint. */
export const CHUNKER_VERSION = 1;

export interface EvidenceChunk {
    /** "{evidenceId}#{seq}" — index doc id and citation ref. */
    id: string;
    evidenceId: string;
    seq: number;
    text: string;
}

// ~350 tokens per chunk, packed greedily; nothing ever exceeds the hard cap.
const TARGET_CHARS = 1400;
const HARD_CAP_CHARS = 2000;
// The previous chunk's tail carried into the next chunk, so sentences that
// straddle a boundary stay retrievable.
const OVERLAP_CHARS = 300;

/** Split an oversized paragraph at sentence boundaries into pieces under the
 *  target, hard-splitting any single sentence that is still too long. */
const splitOversized = (paragraph: string): string[] => {
    const sentences = paragraph.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [
        paragraph,
    ];
    const parts: string[] = [];
    let current = "";
    const push = () => {
        if (current.trim()) {
            parts.push(current.trim());
        }
        current = "";
    };
    for (const sentence of sentences) {
        if (sentence.length > TARGET_CHARS) {
            push();
            for (
                let offset = 0;
                offset < sentence.length;
                offset += TARGET_CHARS
            ) {
                parts.push(sentence.slice(offset, offset + TARGET_CHARS).trim());
            }
            continue;
        }
        if (current.length + sentence.length > TARGET_CHARS) {
            push();
        }
        current += sentence;
    }
    push();
    return parts.filter(Boolean);
};

/** Chunk one artifact's extracted text. The extractors emit one line per
 *  paragraph, page, or row, so newlines are the natural seams. */
export const chunkText = (
    evidenceId: string,
    text: string,
): EvidenceChunk[] => {
    const paragraphs = text
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .flatMap((paragraph) =>
            paragraph.length > TARGET_CHARS
                ? splitOversized(paragraph)
                : [paragraph],
        );

    const texts: string[] = [];
    let parts: string[] = [];
    let length = 0;
    // True while `parts` holds only the overlap carried from the previous
    // chunk — such a remainder is not emitted on its own.
    let carriedOnly = false;
    const emit = () => {
        if (!parts.length || carriedOnly) {
            return;
        }
        texts.push(parts.join("\n"));
        const carry = parts[parts.length - 1].slice(-OVERLAP_CHARS);
        parts = [carry];
        length = carry.length;
        carriedOnly = true;
    };

    for (const paragraph of paragraphs) {
        if (length && length + paragraph.length + 1 > TARGET_CHARS) {
            emit();
            // Drop the carry rather than exceed the hard cap.
            if (length + paragraph.length + 1 > HARD_CAP_CHARS) {
                parts = [];
                length = 0;
            }
        }
        parts.push(paragraph);
        length += paragraph.length + 1;
        carriedOnly = false;
    }
    emit();

    return texts.map((chunk, seq) => ({
        id: `${evidenceId}#${seq}`,
        evidenceId,
        seq,
        text: chunk,
    }));
};

// Dev-only self-checks (pattern: utils/tier.ts).
if (process.env.NODE_ENV !== "production") {
    const paragraphs = [
        "Access control policy, version 3.",
        "All user accounts are approved by the IT manager before creation. "
            .repeat(20)
            .trim(),
        "Accounts are reviewed quarterly.",
    ];
    const chunks = chunkText("dev-check", paragraphs.join("\n"));
    if (chunks.some((chunk) => chunk.text.length > HARD_CAP_CHARS)) {
        console.warn("chunker.ts: chunk exceeds hard cap", chunks);
    }
    const joined = chunks.map((chunk) => chunk.text).join("\n");
    if (
        !joined.includes(paragraphs[0]) ||
        !joined.includes(paragraphs[2]) ||
        !joined.includes("approved by the IT manager")
    ) {
        console.warn("chunker.ts: content lost during chunking", chunks);
    }
    if (chunks.some((chunk, seq) => chunk.id !== `dev-check#${seq}`)) {
        console.warn("chunker.ts: chunk ids out of sequence", chunks);
    }
}
