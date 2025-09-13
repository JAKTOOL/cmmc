"use client";
import {
    read,
    SecurityRequirementValuesSchema,
} from "@/api/entities/RequirementValues";
import { useEffect, useState } from "react";

export const useRequirementsValues = () => {
    const [requirementValuesSchema, setRequirementValuesSchema] = useState(
        undefined as SecurityRequirementValuesSchema | undefined
    );

    useEffect(() => {
        async function fetchInitialState() {
            const reqValueSchema =
                (await read()) as SecurityRequirementValuesSchema;
            setRequirementValuesSchema(reqValueSchema);
        }
        fetchInitialState();
    }, []);

    return requirementValuesSchema;
};

export const useRequirementValue = (id: string) => {
    const schema = useRequirementsValues();
    if (!schema || !schema[id]) {
        return null;
    }
    return schema[id];
};
