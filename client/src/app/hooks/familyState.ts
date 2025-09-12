"use client";
import { RequirementValue } from "@/api/entities/RequirementValues";
import { useManifestContext } from "@/app/context";
import { IDB, IDBRequirement } from "@/app/db";
import { useEffect, useState } from "react";
import { Status } from "../components/status";
import { useRequirementsValues } from "./requirementValues";

class FamilyState {
    requirement_statuses: Status[];
    requirement_values: RequirementValue[];

    constructor(
        requirement_values?: RequirementValue[],
        requirement_statuses?: Status[]
    ) {
        this.requirement_values = requirement_values || [];
        this.requirement_statuses = requirement_statuses || [];
    }
}

type FamilyStates = Record<string, FamilyState>;

export const useFamilyState = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const [aggregateFamilyState, setAggregateFamilyState] = useState(
        {} as FamilyStates
    );
    const reqValueSchema = useRequirementsValues();

    useEffect(() => {
        async function fetchInitialState() {
            if (!families?.length || !reqValueSchema) {
                return;
            }
            const idbRequirements = await IDB.requirements.getAll();

            const familyStates = families.reduce((acc, cur) => {
                acc[cur.element_identifier] = new FamilyState(
                    manifest.requirements.byFamily[cur.element_identifier].map(
                        (req) => reqValueSchema[req.element_identifier]
                    )
                );
                return acc;
            }, {} as FamilyStates);

            for (const family of families) {
                const familyId = family.element_identifier;
                const familyRequirements =
                    manifest.requirements.byFamily[familyId];
                const storedRequirements = idbRequirements?.reduce(
                    (acc, cur) => {
                        acc[cur.id] = cur;
                        return acc;
                    },
                    {} as Record<string, IDBRequirement>
                );

                const storedIds = new Set(Object.keys(storedRequirements));
                const hasFamilyBeenWorkedUpon = familyRequirements.some((r) =>
                    storedIds.has(r.id)
                );

                for (const requirement of familyRequirements) {
                    const securityRequirements =
                        manifest.securityRequirements.byRequirements[
                            requirement.id
                        ];

                    const stored = storedRequirements[requirement.id];

                    if (!stored) {
                        familyStates[familyId].requirement_statuses.push(
                            hasFamilyBeenWorkedUpon
                                ? Status.NEEDS_WORK
                                : Status.NOT_STARTED
                        );
                        continue;
                    }
                    const statuses = Object.values(
                        stored.bySecurityRequirementId
                    );

                    if (securityRequirements.length !== statuses.length) {
                        familyStates[familyId].requirement_statuses.push(
                            Status.NOT_STARTED
                        );
                        continue;
                    }
                    familyStates[familyId].requirement_statuses = [
                        ...familyStates[familyId].requirement_statuses,
                        ...statuses,
                    ];
                }
            }
            setAggregateFamilyState(familyStates);
        }
        fetchInitialState();
    }, [families, reqValueSchema]);

    return aggregateFamilyState;
};
