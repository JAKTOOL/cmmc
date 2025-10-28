"use client";
import { values } from "@/api/entities/RequirementValues";

export const useRequirementsValues = () => {
    return values;
};

export const useRequirementValue = (id: string) => {
    const schema = useRequirementsValues();
    if (!schema || !schema[id]) {
        return null;
    }
    return schema[id];
};
