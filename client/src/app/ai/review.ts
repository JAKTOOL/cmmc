// Orchestration for the per-objective evidence review: gather the
// requirement's evidence, retrieve chunks per objective, stream the model,
// parse, and persist one row per objective as it completes — so a stopped
// run keeps its finished rows and TABLE_CHANGED_EVENT updates the panel row
// by row.

import { Revision } from "@/app/context/revision";
import { IDB, IDBObjectiveReview } from "@/app/db";
import { gatherEvidence } from "@/app/llm/prompt";
import { ensureEvidenceTextSynced } from "@/app/search/evidence_text_store";
import { EXTRACTOR_VERSION } from "@/app/search/extract_text";
import { sha256Hex } from "@/app/utils/hash";
import { CHUNKER_VERSION } from "./chunker";
import { getLocalModel } from "./model";
import { objectivesForRequirement } from "./objectives";
import {
    PROMPT_VERSION,
    buildReviewPrompt,
    parseReviewResponse,
} from "./prompt";
import { buildChunkIndex, retrieveForObjective } from "./retrieval";

/** What a stored verdict depends on: the reviewed evidence set and every
 *  version in the pipeline. A mismatch with the current state means the row
 *  is stale. */
export const reviewFingerprint = (
    evidenceIds: string[],
    modelId: string,
): Promise<string> =>
    sha256Hex(
        [
            ...[...evidenceIds].sort(),
            `extractor:${EXTRACTOR_VERSION}`,
            `chunker:${CHUNKER_VERSION}`,
            `prompt:${PROMPT_VERSION}`,
            `model:${modelId}`,
        ].join("\n"),
    );

export interface ExpectedReviewState {
    /** Fingerprint fresh reviews would carry now; undefined without a model. */
    fingerprint?: string;
    /** Linked artifacts with no extractable text (excluded from review). */
    unreadable: number;
}

/** The state the staleness check compares stored rows against. Reads the
 *  same evidence set a run would. */
export const expectedReviewState = async (
    requirementId: string,
): Promise<ExpectedReviewState> => {
    const model = getLocalModel();
    const { docs, unreadable } = await gatherEvidence(requirementId);
    return {
        fingerprint: model
            ? await reviewFingerprint(
                  docs.map((doc) => doc.evidenceId),
                  model.id,
              )
            : undefined,
        unreadable: unreadable.length,
    };
};

export interface ReviewProgress {
    done: number;
    total: number;
    unreadable: number;
}

export interface ReviewOptions {
    signal?: AbortSignal;
    onProgress?: (progress: ReviewProgress) => void;
}

// One run app-wide (the model is a single instance); a second call while one
// is running coalesces onto it, same idiom as evidence_text_store.ts.
let inFlight: Promise<void> | undefined;

/** Review every objective of a requirement against its linked evidence.
 *  Rows persist per objective; abort keeps the completed ones. */
export const reviewRequirement = (
    revision: Revision,
    requirementId: string,
    options: ReviewOptions = {},
): Promise<void> => {
    if (inFlight) {
        return inFlight;
    }
    inFlight = run(revision, requirementId, options).finally(() => {
        inFlight = undefined;
    });
    return inFlight;
};

const run = async (
    revision: Revision,
    requirementId: string,
    { signal, onProgress }: ReviewOptions,
): Promise<void> => {
    const model = getLocalModel();
    if (!model) {
        throw new Error("No local model is available.");
    }
    const objectives = objectivesForRequirement(revision, requirementId);
    if (!objectives.length) {
        return;
    }

    await ensureEvidenceTextSynced();
    const { docs, unreadable } = await gatherEvidence(requirementId);
    const progress: ReviewProgress = {
        done: 0,
        total: objectives.length,
        unreadable: unreadable.length,
    };
    onProgress?.({ ...progress });

    // Chunk and index once — all objectives of the requirement share it.
    const chunkIndex = buildChunkIndex(docs);
    const fingerprint = await reviewFingerprint(
        docs.map((doc) => doc.evidenceId),
        model.id,
    );

    // Sequential on purpose: one generation at a time is all the engine
    // allows, and each row lands as soon as its objective finishes.
    for (const objective of objectives) {
        if (signal?.aborted) {
            return;
        }
        const retrieved = retrieveForObjective(objective, chunkIndex);
        const { prompt, included } = buildReviewPrompt(
            objective,
            retrieved,
            model,
        );

        const row: IDBObjectiveReview = {
            objective_id: objective.id,
            requirement_id: requirementId,
            citation: objective.citation,
            verdict: "error",
            reason: "",
            raw: "",
            fingerprint,
            model: model.id,
            created: Date.now(),
        };
        try {
            let raw = "";
            // 320, not 256: the tagged format needs ~80 tokens, but when the
            // model drifts into prose despite the example, the extra room
            // lets the reason finish instead of cutting off mid-word.
            for await (const token of model.generate(prompt, {
                signal,
                maxNewTokens: 320,
            })) {
                raw += token;
            }
            // An abort makes generate() return early with partial text;
            // don't persist a half-formed verdict for this objective.
            if (signal?.aborted) {
                return;
            }
            const parsed = parseReviewResponse(raw, included);
            row.verdict = parsed.verdict;
            row.reason = parsed.reason;
            row.quote = parsed.quote;
            row.raw = raw;
        } catch (error) {
            if (signal?.aborted) {
                return;
            }
            // Keep the failure visible in the row and continue with the
            // remaining objectives.
            row.raw = error instanceof Error ? error.message : String(error);
            row.reason = `The review failed before reaching a verdict: ${row.raw}`;
        }
        await IDB.objectiveReviews.put(row);
        onProgress?.({ ...progress, done: ++progress.done });
        // A fatal engine failure (lost WebGPU device, failed OrtRun)
        // unregisters the model; without it every remaining objective would
        // fail identically. Surface the failure and stop instead.
        if (row.verdict === "error" && !getLocalModel()) {
            throw new Error(
                `Evidence review stopped — the model failed and was unloaded (${row.raw}). Run again to reload it.`,
            );
        }
    }
};
