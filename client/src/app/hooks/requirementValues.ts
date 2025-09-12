"use client";
import {
    read,
    RequirementValuesSchema,
} from "@/api/entities/RequirementValues";
import { useEffect, useState } from "react";

export const useRequirementsValues = () => {
    const [requirementValuesSchema, setRequirementValuesSchema] = useState(
        undefined as RequirementValuesSchema | undefined
    );

    useEffect(() => {
        async function fetchInitialState() {
            const reqValueSchema = (await read()) as RequirementValuesSchema;
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
