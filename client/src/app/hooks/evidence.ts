"use client";
import { useManifestContext } from "@/app/context";
import { IDBEvidence } from "@/app/db";
import { useMemo } from "react";
import { useDBEvidence } from "./db";

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
    const idbEvidence = useDBEvidence();

    return useMemo(() => {
        if (!families?.length || !idbEvidence) {
            return;
        }

        const familiesEvidence = families.reduce((acc, family) => {
            acc[family.element_identifier] = new FamilyEvidence();
            return acc;
        }, {} as GlobalEvidence);

        const storedEvidence = idbEvidence?.reduce((acc, cur) => {
            acc[cur.requirement_id] = cur;
            return acc;
        }, {} as Record<string, IDBEvidence>);

        for (const [requirementId, requirement] of Object.entries(
            requirementsById
        )) {
            const family = requirement[0].family;
            const familyEvidence = familiesEvidence[family];
            familyEvidence.setRequirementEvidence(
                requirementId,
                !!storedEvidence?.[requirementId]
            );
        }
        return familiesEvidence;
    }, [families, requirementsById, idbEvidence]);
};

export const useFamilyEvidence = (familyId: string) => {
    const globalStatus = useGlobalEvidence();
    return globalStatus?.[familyId];
};
