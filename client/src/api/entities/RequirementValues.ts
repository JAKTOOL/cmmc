export type SecurityRequirementId = string;

export enum SecurityRequirementRevision {
    V2 = 2,
    V3 = 3,
}

export interface SecurityRequirementValue {
    id: SecurityRequirementId;
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

const valuesPromise = fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/data/sp_800_171_3_0_0/values.json?${process.env.NEXT_PUBLIC_FRAMEWORK_VERSION}`
).then((r) => r.json());

let cache: SecurityRequirementValuesSchema | undefined;

export const read = async () => {
    if (cache) {
        return cache;
    }
    cache = await valuesPromise;
    return cache;
};
