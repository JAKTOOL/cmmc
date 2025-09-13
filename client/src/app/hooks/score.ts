"use client";
import type { SecurityRequirementValue } from "@/api/entities/RequirementValues";
import { useMemo } from "react";
import { useRequirementsValues } from "./requirementValues";

class FamilyScore {
    securityRequirementValues: SecurityRequirementValue[];

    constructor(securityRequirementValues?: SecurityRequirementValue[]) {
        this.securityRequirementValues = securityRequirementValues || [];
    }
}

type GlobalScores = Record<string, FamilyScore>;

export const useGlobalScore = () => {
    const schema = useRequirementsValues();
    const score = useMemo(() => {
        console.log(schema);
        return 0;
    }, [schema]);

    return score;
};
export const useScore = () => {
    const schema = useRequirementsValues();
    const score = useMemo(() => {
        console.log(schema);
        return 0;
    }, [schema]);

    return score;
};
