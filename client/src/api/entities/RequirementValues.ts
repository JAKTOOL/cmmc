export type RequirementId = string;

export enum RequirementRevision {
    V2 = 2,
    V3 = 3,
}

export interface RequirementValue {
    id: RequirementId;
    value: number;
    partial_value: number;
    revision: RequirementRevision;
    withdrawn_from?: RequirementId[];
    withdrawn_into?: RequirementId[];
    aggregate_value_withdrawn_from?: number;
    aggregate_partial_value_withdrawn_from?: number;
}

// Represents the whole dataset keyed by control id
export type RequirementValuesSchema = {
    [requirementId: RequirementId]: RequirementValue;
};

const valuesPromise = fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/data/sp_800_171_3_0_0/values.json?${process.env.NEXT_PUBLIC_FRAMEWORK_VERSION}`
).then((r) => r.json());

let cache: RequirementValuesSchema | undefined;

export const read = async () => {
    if (cache) {
        return cache;
    }
    cache = await valuesPromise;
    return cache;
};
