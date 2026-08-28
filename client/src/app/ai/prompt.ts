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
export const PROMPT_VERSION = 11;

/** Tokens held back for the model's tagged response. */
const OUTPUT_RESERVE_TOKENS = 256;

/** Ceiling on the review prompt, regardless of the model's window. GPU
 *  memory during a run scales with prompt length (prefill logits are
 *  sequence x vocab, the KV cache is sequence x layers), and a review fires
 *  many generations back to back — full-window prompts drove the WebGPU
 *  device out of memory mid-run. A verdict on one objective does not need
 *  the whole window; ~4 chunks still fit under this cap. */
const REVIEW_PROMPT_TOKENS = 2048;
/** Floor for a lone truncated chunk, so some evidence is always shown. */
const MIN_CHUNK_CHARS = 400;

const sourceRef = (chunk: { filename: string; seq: number }): string =>
    `${chunk.filename}#${chunk.seq}`;

// Layout: role, format spec, calibration, THEN the excerpts, with a
// one-line closing task. There is deliberately NO worked example: v5-v8
// tried one (verbatim, off-domain, moved before the excerpts) and the 1B
// model leaked it every time — copied its reason as a plausible finding,
// cited its fake file as "the provided excerpt", anchored whole runs to its
// verdict, and finally reasoned about its scenario in paraphrase, which no
// scrub can catch. Format drift without an example is the lesser failure:
// the parser salvages prose and every field degrades independently.
const promptHead = (objective: ReviewObjective, contextBlock: string): string =>
    `You are a CMMC assessor reviewing evidence for one assessment objective.

Requirement ${objective.requirementId}: ${objective.requirementStatement}
Objective ${objective.citation}: ${objective.text}

Respond with exactly these lines and nothing else:
VERDICT: met | partially-met | not-met | no-evidence
CITATION: ${objective.citation}
REASON: <one or two sentences naming what is present or missing>
QUOTE: <verbatim sentence copied from one excerpt> (SOURCE: <filename#n>)

Judge substance, not wording: choose met when the excerpts describe
practices that satisfy the objective, even when they never use the
requirement's exact words. Reserve partially-met for a real omission the
REASON names. Never refuse, defer, or describe your approach — when the
excerpts leave you unsure, the verdict is no-evidence and the REASON says
what is missing. If no excerpt is relevant, use VERDICT: no-evidence and
omit QUOTE.

${contextBlock}Evidence excerpts (the only material you may rely on):
`;

// REASON before QUOTE on purpose: small models degrade toward the end of a
// format and stop early, and the reason must survive that — a cut-off quote
// only loses the citation, a cut-off reason loses the verdict's grounds.
// The worked example is not decoration: without one, the 1B model drifts
// into untagged essay prose on every objective (verbose meta-reasons, no
// quote), and the parser is left salvaging. Same lesson as the draft
// prompt — a small model imitates an example far more reliably than it
// obeys format rules.

const promptTail = (objective: ReviewObjective): string =>
    `
Now respond for Objective ${objective.citation} with the four lines, using
only the excerpts above.`;

export interface BuiltPrompt {
    prompt: string;
    /** The chunks whose text made it into the prompt (original, untruncated
     *  objects) — the material quotes are verified against. */
    included: RetrievedChunk[];
}

/** Per-document summary lines in the review prompt: whole-document context
 *  a lone excerpt cannot carry (a single quoted paragraph was repeatedly
 *  judged "insufficient" when the rest of its document covered the
 *  objective). Bounded so the excerpts stay the bulk of the budget. */
const MAX_CONTEXT_DOCS = 4;
const MAX_CONTEXT_CHARS = 300;

const contextBlockFor = (
    overviews: { filename: string; summary: string }[],
): string =>
    overviews.length
        ? `Document context (summaries of the attached evidence — for orientation only; quote from the excerpts below):\n${overviews
              .slice(0, MAX_CONTEXT_DOCS)
              .map(
                  (overview) =>
                      `- ${overview.filename}: ${overview.summary.slice(0, MAX_CONTEXT_CHARS)}`,
              )
              .join("\n")}\n\n`
        : "";

/** Assemble the prompt: fixed head/tail, then chunks in score order while
 *  they fit the token budget. When evidence exists, at least one chunk is
 *  always included, truncated to fit. */
export const buildReviewPrompt = (
    objective: ReviewObjective,
    chunks: RetrievedChunk[],
    model: { contextTokens: number; countTokens?(text: string): number },
    overviews: { filename: string; summary: string }[] = [],
): BuiltPrompt => {
    const count = model.countTokens?.bind(model) ?? estimateTokens;
    const head = promptHead(objective, contextBlockFor(overviews));
    const tail = promptTail(objective);
    let budget =
        Math.min(model.contextTokens, REVIEW_PROMPT_TOKENS) -
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

const ANY_TAGGED_LINE =
    /^\s*(?:VERDICT|CITATION|QUOTE|REASON(?:ING)?|RATIONALE|EXPLANATION)\s*:.*$/gim;

const MAX_REASON_CHARS = 300;

/** A reason when the REASON tag is missing: the model's untagged prose if
 *  it wrote any, else a per-verdict default. A row with an empty reason
 *  reads as a silent judgment — every stored review must say why. */
const fallbackReason = (raw: string, verdict: ReviewVerdict): string => {
    const prose = raw.replace(ANY_TAGGED_LINE, "").replace(/\s+/g, " ").trim();
    if (prose) {
        if (prose.length <= MAX_REASON_CHARS) {
            return prose;
        }
        // Trim at the last complete sentence that fits — a mid-word chop
        // reads like data loss. Word boundary for run-on text; the full
        // output stays in `raw`.
        const head = prose.slice(0, MAX_REASON_CHARS);
        const sentenceEnd = Math.max(
            head.lastIndexOf(". "),
            head.lastIndexOf("? "),
            head.lastIndexOf("! "),
        );
        return sentenceEnd > MAX_REASON_CHARS / 3
            ? head.slice(0, sentenceEnd + 1)
            : `${head.slice(0, head.lastIndexOf(" "))}…`;
    }
    return verdict === "no-evidence"
        ? "The model found no relevant excerpt for this objective."
        : "The model gave no reason for this verdict — verify it against the evidence before relying on it.";
};

/** Tolerant, line-anchored parse of the model's tagged response. Unknown
 *  verdicts degrade to "unparsed" with the raw text preserved for display.
 *  The reason is never empty: tagged line, else untagged prose, else a
 *  per-verdict default. */
export const parseReviewResponse = (
    raw: string,
    included: RetrievedChunk[],
): ParsedReview => {
    const verdictLine = taggedLine("VERDICT", raw);
    const verdict =
        (verdictLine ? normalizeVerdict(verdictLine) : undefined) ??
        "unparsed";
    // Accept the tag drift small models produce for this field.
    const reason =
        taggedLine("(?:REASON(?:ING)?|RATIONALE|EXPLANATION)", raw) ||
        fallbackReason(raw, verdict);
    const quoteLine = taggedLine("QUOTE", raw);
    const quote = quoteLine ? resolveQuote(quoteLine, included) : undefined;
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
    // The reason is never empty: untagged prose is salvaged, and a bare
    // verdict gets the per-verdict default.
    const salvaged = parseReviewResponse(
        "VERDICT: met\nApproval is documented in the policy.",
        [chunk],
    );
    if (salvaged.reason !== "Approval is documented in the policy.") {
        console.warn("prompt.ts: reason salvage failed", salvaged);
    }
    const bare = parseReviewResponse("VERDICT: met", [chunk]);
    if (!bare.reason) {
        console.warn("prompt.ts: reason default failed", bare);
    }
}
