"use client";
import type { SecurityRequirementValue } from "@/api/entities/RequirementValues";
import { useManifestContext } from "@/app/context";
import { useMemo } from "react";
import { Status } from "../components/status";
import { useRequirementsValues } from "./requirementValues";
import { useGlobalStatus } from "./status";

class Score {
    status: Status;
    securityRequirementValue: SecurityRequirementValue;

    constructor(
        status: Status,
        securityRequirementValue: SecurityRequirementValue
    ) {
        this.status = status;
        this.securityRequirementValue = securityRequirementValue;
    }

    get penalty() {
        const value =
            (this.securityRequirementValue?.value ?? 0) +
            (this.securityRequirementValue?.aggregate_value_withdrawn_from ??
                0);

        const partial =
            (this.securityRequirementValue?.partial_value ?? 0) +
            (this.securityRequirementValue
                ?.aggregate_partial_value_withdrawn_from ?? 0);

        switch (this.status) {
            case Status.NOT_IMPLEMENTED:
                return value;

            case Status.PARTIALLY_IMPLEMENTED:
                return partial || value;

            default:
                return 0;
        }
    }
}

type ScoresRecord = Record<string, Score>;

export class GlobalScore {
    static maxScore = 110;
    records: ScoresRecord;

    constructor(records?: ScoresRecord) {
        this.records = records || {};
    }

    get score() {
        return Object.values(this.records).reduce((acc, score) => {
            return acc - score.penalty;
        }, GlobalScore.maxScore);
    }
}

export const useGlobalScore = () => {
    const manifest = useManifestContext();
    const requirements = manifest?.requirements?.elements;
    const reqValueSchema = useRequirementsValues();
    const globalStatus = useGlobalStatus();

    return useMemo(() => {
        if (!requirements?.length || !reqValueSchema || !globalStatus) {
            return;
        }

        const records = requirements.reduce((acc, requirement) => {
            acc[requirement.element_identifier] = new Score(
                globalStatus[requirement.family].requirementStatus(
                    requirement.element_identifier
                ),
                reqValueSchema[requirement.element_identifier]
            );
            return acc;
        }, {} as ScoresRecord);

        return new GlobalScore(records);
    }, [requirements, reqValueSchema, globalStatus]);
};
