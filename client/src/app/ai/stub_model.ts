// Deterministic stand-in for the embedded model, served by getLocalModel()
// when NEXT_PUBLIC_AI_STUB=1 (`npm run dev:ai`). It parses its own prompt for
// the [SOURCE: ...] excerpt markers and streams a well-formed tagged verdict
// whose QUOTE is a real substring of the first excerpt, so the whole
// parse -> persist -> render path — including quote verification — runs
// without weights.

import type { GenerateOptions, LocalModel } from "./model";

// "[SOURCE: filename#n]" followed by the first line of the excerpt.
const FIRST_EXCERPT = /^\[SOURCE: (.+)\]\n(.+)$/m;
const OBJECTIVE = /^Objective (\S+):/m;

const composeResponse = (prompt: string): string => {
    const citation = OBJECTIVE.exec(prompt)?.[1] ?? "?";
    const excerpt = FIRST_EXCERPT.exec(prompt);
    if (!excerpt) {
        return [
            "VERDICT: no-evidence",
            `CITATION: ${citation}`,
            "REASON: No evidence excerpts were provided for this objective.",
        ].join("\n");
    }
    const [, source, firstLine] = excerpt;
    // A leading slice of the excerpt's first line: verbatim by construction.
    const quote = firstLine.slice(0, 160).trim();
    return [
        "VERDICT: met",
        `CITATION: ${citation}`,
        `REASON: Stub verdict — the excerpt from ${source.split("#")[0]} was retrieved for this objective.`,
        `QUOTE: ${quote} (SOURCE: ${source})`,
    ].join("\n");
};

export const stubModel: LocalModel = {
    id: "stub-1",
    contextTokens: 4096,
    async *generate(prompt: string, opts?: GenerateOptions) {
        const response = composeResponse(prompt);
        // Word-by-word with a small delay, so streaming/abort behavior is
        // exercised the same way the real engine exercises it.
        for (const word of response.split(/(?<=\s)/)) {
            if (opts?.signal?.aborted) {
                return;
            }
            yield word;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    },
};
