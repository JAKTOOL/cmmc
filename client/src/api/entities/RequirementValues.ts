import data from "../../../public/data/sp_800_171_3_0_0/values.json";

export type SecurityRequirementId = string;

export enum SecurityRequirementRevision {
    V2 = 2,
    V3 = 3,
}

export interface SecurityRequirementValue {
    value: number;
    partial_value: number;
    revision: SecurityRequirementRevision[];
    withdrawn_from?: SecurityRequirementId[];
    withdrawn_into?: SecurityRequirementId[];
    aggregate_value_withdrawn_from?: number;
    aggregate_partial_value_withdrawn_from?: number;
}

// Represents the whole dataset keyed by control id
export type SecurityRequirementValuesSchema = {
    [securityRequirementId: SecurityRequirementId]: SecurityRequirementValue;
};

export const values: SecurityRequirementValuesSchema = Object.freeze(data);
