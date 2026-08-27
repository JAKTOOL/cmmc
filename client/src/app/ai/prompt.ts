// Review prompt builder and tagged-output parser. The output format is
// tagged lines, not JSON: 1-3B local models emit broken JSON often, and the
// prompt asks the model to quote text that itself contains quotes. Each
// tagged field parses independently, so a malformed field degrades that
// field, not the run.

import { estimateTokens } from "./model";
import type { ReviewObjective } from "./objectives";
import type { RetrievedChunk } from "./retrieval";

/** Bump when the prompt or parser changes shape; part of the review
 *  fingerprint. */
export const PROMPT_VERSION = 1;

/** Tokens held back for the model's tagged response. */
const OUTPUT_RESERVE_TOKENS = 256;
/** Floor for a lone truncated chunk, so some evidence is always shown. */
const MIN_CHUNK_CHARS = 400;

const sourceRef = (chunk: { filename: string; seq: number }): string =>
    `${chunk.filename}#${chunk.seq}`;

const promptHead = (objective: ReviewObjective): string =>
    `You are a CMMC assessor reviewing evidence for one assessment objective.

Requirement ${objective.requirementId}: ${objective.requirementStatement}
Objective ${objective.citation}: ${objective.text}

Evidence excerpts (the only material you may rely on):
`;

const promptTail = (objective: ReviewObjective): string =>
    `
Decide whether the evidence demonstrates this objective. Respond with exactly
these lines and nothing else:
VERDICT: met | partially-met | not-met | no-evidence
CITATION: ${objective.citation}
QUOTE: <verbatim sentence copied from one excerpt> (SOURCE: <filename#n>)
REASON: <one or two sentences naming what is present or missing>
If no excerpt is relevant, use VERDICT: no-evidence and omit QUOTE.`;

export interface BuiltPrompt {
    prompt: string;
    /** The chunks whose text made it into the prompt (original, untruncated
     *  objects) — the material quotes are verified against. */
    included: RetrievedChunk[];
}

/** Assemble the prompt: fixed head/tail, then chunks in score order while
 *  they fit the token budget. When evidence exists, at least one chunk is
 *  always included, truncated to fit. */
export const buildReviewPrompt = (
    objective: ReviewObjective,
    chunks: RetrievedChunk[],
    model: { contextTokens: number; countTokens?(text: string): number },
): BuiltPrompt => {
    const count = model.countTokens?.bind(model) ?? estimateTokens;
    const head = promptHead(objective);
    const tail = promptTail(objective);
    let budget =
        model.contextTokens -
        count(head) -
        count(tail) -
        OUTPUT_RESERVE_TOKENS;

    const blocks: string[] = [];
    const included: RetrievedChunk[] = [];
    for (const chunk of chunks) {
        const block = `[SOURCE: ${sourceRef(chunk)}]\n${chunk.text}\n`;
        const tokens = count(block);
        if (tokens > budget) {
            if (included.length) {
                continue;
            }
            // Nothing fits whole: truncate the best chunk. Estimate is fine
            // here — the reserve absorbs the slack.
            const chars = Math.max(MIN_CHUNK_CHARS, budget * 4);
            blocks.push(
                `[SOURCE: ${sourceRef(chunk)}]\n${chunk.text.slice(0, chars)}\n`,
            );
            included.push(chunk);
            break;
        }
        blocks.push(block);
        included.push(chunk);
        budget -= tokens;
    }

    return {
        prompt: head + blocks.join("\n") + tail,
        included,
    };
};

export type ReviewVerdict =
    | "met"
    | "partially-met"
    | "not-met"
    | "no-evidence"
    | "unparsed";

export interface ReviewQuote {
    text: string;
    evidence_id: string;
    chunk: number;
    filename: string;
    verified: boolean;
}

export interface ParsedReview {
    verdict: ReviewVerdict;
    reason: string;
    quote?: ReviewQuote;
    raw: string;
}

const taggedLine = (tag: string, raw: string): string | undefined =>
    new RegExp(`^\\s*${tag}\\s*:\\s*(.*)\\s*$`, "im").exec(raw)?.[1]?.trim();

/** Map free-form verdict text onto the closed set; order matters ("not met"
 *  and "partially met" both contain "met"). */
const normalizeVerdict = (value: string): ReviewVerdict | undefined => {
    const verdict = value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (!verdict) {
        return undefined;
    }
    if (verdict.includes("partial")) {
        return "partially-met";
    }
    if (verdict.includes("not met") || verdict.includes("unmet")) {
        return "not-met";
    }
    if (verdict.includes("no evidence") || verdict === "none") {
        return "no-evidence";
    }
    if (verdict.includes("met") || verdict.includes("satisf")) {
        return "met";
    }
    return undefined;
};

const normalizeWhitespace = (text: string): string =>
    text.replace(/\s+/g, " ").trim().toLowerCase();

const TRAILING_SOURCE = /\s*\(SOURCE:\s*([^)]+)\)\s*$/i;

/** Verify a quote against the included chunks (whitespace-normalized
 *  substring). Verified quotes resolve to their chunk; unverified quotes are
 *  kept but flagged, so the UI labels them instead of presenting a possible
 *  hallucination as evidence. */
const resolveQuote = (
    line: string,
    included: RetrievedChunk[],
): ReviewQuote | undefined => {
    const ref = TRAILING_SOURCE.exec(line)?.[1]?.trim();
    const text = line.replace(TRAILING_SOURCE, "").replace(/^["']|["']$/g, "");
    if (!text) {
        return undefined;
    }
    const needle = normalizeWhitespace(text);
    // Prefer the chunk the model cited, then scan the rest.
    const cited = included.find((chunk) => sourceRef(chunk) === ref);
    const ordered = cited
        ? [cited, ...included.filter((chunk) => chunk !== cited)]
        : included;
    const match = needle
        ? ordered.find((chunk) =>
              normalizeWhitespace(chunk.text).includes(needle),
          )
        : undefined;
    const source = match ?? cited;
    return {
        text,
        evidence_id: source?.evidenceId ?? "",
        chunk: source?.seq ?? -1,
        filename: source?.filename ?? ref?.split("#")[0] ?? "",
        verified: match !== undefined,
    };
};

/** Tolerant, line-anchored parse of the model's tagged response. Unknown
 *  verdicts degrade to "unparsed" with the raw text preserved for display. */
export const parseReviewResponse = (
    raw: string,
    included: RetrievedChunk[],
): ParsedReview => {
    const verdictLine = taggedLine("VERDICT", raw);
    const verdict = verdictLine ? normalizeVerdict(verdictLine) : undefined;
    const reason = taggedLine("REASON", raw) ?? "";
    const quoteLine = taggedLine("QUOTE", raw);
    const quote = quoteLine ? resolveQuote(quoteLine, included) : undefined;
    if (!verdict) {
        return { verdict: "unparsed", reason, quote, raw };
    }
    return { verdict, reason, quote, raw };
};

// Dev-only parser goldens (pattern: utils/tier.ts).
if (process.env.NODE_ENV !== "production") {
    const chunk: RetrievedChunk = {
        id: "abc#0",
        evidenceId: "abc",
        seq: 0,
        text: "All accounts are approved by the IT manager.\nReviews run quarterly.",
        filename: "access-policy.docx",
        score: 1,
    };
    const good = parseReviewResponse(
        "VERDICT: Met\nCITATION: AC.L2-3.1.1[a]\nQUOTE: accounts are approved by the   IT manager (SOURCE: access-policy.docx#0)\nREASON: Approval is documented.",
        [chunk],
    );
    if (
        good.verdict !== "met" ||
        !good.quote?.verified ||
        good.quote.evidence_id !== "abc"
    ) {
        console.warn("prompt.ts: golden parse failed", good);
    }
    const mangled = parseReviewResponse(
        "verdict : partially met\nQUOTE: something the evidence never said\nREASON: partial",
        [chunk],
    );
    if (mangled.verdict !== "partially-met" || mangled.quote?.verified) {
        console.warn("prompt.ts: mangled parse failed", mangled);
    }
    const junk = parseReviewResponse("The evidence is fine.", [chunk]);
    if (junk.verdict !== "unparsed" || junk.raw !== "The evidence is fine.") {
        console.warn("prompt.ts: junk parse failed", junk);
    }
}
