// Revision-generic enumeration of the assessment objectives an AI review
// examines. Phase 1 covers Rev 2 (the published assessment guide); the Rev 3
// branch (determination statements + ODP substitution) lands later with the
// same output shape, so nothing downstream changes.

import {
    considerationsForObjective,
    getAssessmentGuidance,
} from "@/api/entities/AssessmentGuide";
import { Revision } from "@/app/context/revision";

export interface ReviewObjective {
    /** Storage key, e.g. "03.01.01.a". */
    id: string;
    requirementId: string;
    /** CMMC citation, e.g. "AC.L2-3.1.1[a]" (Rev 2). */
    citation: string;
    /** In-page anchor: the form renders id="03.01.01.a" per sub-statement
     *  (same contract as linkifyObjectives in assessment_guidance.tsx). */
    anchorId: string;
    /** Objective prose (ODPs resolved for Rev 3). */
    text: string;
    requirementStatement: string;
    /** Examine-method vocabulary — document names that match evidence
     *  filenames and headings, folded into the retrieval query. */
    methodTerms: string[];
    /** "Potential Assessment Considerations" questions bound to this
     *  objective's letter — concrete noun phrases that match evidence
     *  language better than the objective's abstract wording. Retrieval
     *  query only; never shown to the model. */
    considerations: string[];
}

/** Empty for requirements without objectives (withdrawn controls, and all of
 *  Rev 3 until phase 2) — the review panel then renders nothing. */
export const objectivesForRequirement = (
    revision: Revision,
    requirementId: string,
): ReviewObjective[] => {
    if (revision !== Revision.V2) {
        return [];
    }
    const guidance = getAssessmentGuidance(requirementId);
    if (!guidance) {
        return [];
    }
    const { requirement } = guidance;
    return Object.entries(requirement.assessment_objectives).map(
        ([letter, text]) => ({
            id: `${requirementId}.${letter}`,
            requirementId,
            citation: `${requirement.id}[${letter}]`,
            anchorId: `${requirementId}.${letter}`,
            text,
            requirementStatement: requirement.statement,
            methodTerms: requirement.assessment_methods.examine,
            considerations: considerationsForObjective(requirementId, letter),
        }),
    );
};
