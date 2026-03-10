"use client";
import { useManifestContext } from "@/app/context/manifest";
import { useMemo } from "react";
import { useDBEvidenceRequirements } from "./db";

export class FamilyEvidence {
    requirementsEvidence: Record<string, boolean>;

    constructor(requirementsEvidence?: Record<string, boolean>) {
        this.requirementsEvidence = requirementsEvidence || {};
    }

    get hasEvidence() {
        return Object.values(this.requirementsEvidence).every((b) => b);
    }

    setRequirementEvidence(requirementId: string, valid: boolean) {
        this.requirementsEvidence[requirementId] = valid;
    }

    requirementEvidence(requirementId: string) {
        return this.requirementsEvidence[requirementId] || false;
    }
}

type GlobalEvidence = Record<string, FamilyEvidence>;

export const useGlobalEvidence = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const requirementsById = manifest.requirements.byRequirements;
    const idbEvidenceRequirements = useDBEvidenceRequirements();

    return useMemo(() => {
        if (!families?.length || !idbEvidenceRequirements) {
            return;
        }

        const familiesEvidence = families.reduce((acc, family) => {
            acc[family.element_identifier] = new FamilyEvidence();
            return acc;
        }, {} as GlobalEvidence);

        const evidenceByRequirementId = idbEvidenceRequirements?.reduce(
            (acc, cur) => {
                acc[cur.requirement_id] = true;
                return acc;
            },
            {} as Record<string, boolean>,
        );

        for (const [requirementId, requirement] of Object.entries(
            requirementsById,
        )) {
            const family = requirement[0].family;
            const familyEvidence = familiesEvidence[family];
            familyEvidence.setRequirementEvidence(
                requirementId,
                !!evidenceByRequirementId?.[requirementId],
            );
        }
        return familiesEvidence;
    }, [families, requirementsById, idbEvidenceRequirements]);
};

export const useFamilyEvidence = (familyId: string) => {
    const globalStatus = useGlobalEvidence();
    return globalStatus?.[familyId];
};
