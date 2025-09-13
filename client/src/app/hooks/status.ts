"use client";
import { useManifestContext } from "@/app/context";
import { IDB, IDBRequirement } from "@/app/db";
import { useEffect, useState } from "react";
import { Status, calcStatus } from "../components/status";
import { useRequirementsValues } from "./requirementValues";

class FamilyStatus {
    // securityRequirementValues: SecurityRequirementValue[];
    subSecurityRequirementStatuses: Record<string, Status>;

    constructor(
        // securityRequirementValues?: SecurityRequirementValue[],
        subSecurityRequirementStatuses?: Record<string, Status>
    ) {
        // this.securityRequirementValues = securityRequirementValues || [];
        this.subSecurityRequirementStatuses =
            subSecurityRequirementStatuses || {};
    }

    get status() {
        return calcStatus(Object.values(this.subSecurityRequirementStatuses));
    }

    requirementStatus(requirementId: string) {
        return calcStatus(
            Object.entries(this.subSecurityRequirementStatuses).reduce(
                (acc, [id, status]) => {
                    if (id.includes(requirementId)) {
                        acc.push(status);
                    }
                    return acc;
                },
                [] as Status[]
            )
        );
    }

    securityRequirementStatus(securityRequirement: string) {
        return calcStatus(
            Object.entries(this.subSecurityRequirementStatuses).reduce(
                (acc, [id, status]) => {
                    if (id.includes(securityRequirement)) {
                        acc.push(status);
                    }
                    return acc;
                },
                [] as Status[]
            )
        );
    }
}

type GlobalStatuses = Record<string, FamilyStatus>;

export const useGlobalStatus = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const [aggregateFamilyStatus, setAggregateFamilyStatus] = useState(
        undefined as GlobalStatuses | undefined
    );

    useEffect(() => {
        async function fetchInitialState() {
            if (!families?.length) {
                return;
            }
            const idbRequirements = await IDB.requirements.getAll();

            const familyStatus = families.reduce((acc, family) => {
                acc[family.element_identifier] = new FamilyStatus();
                // manifest.requirements.byFamily[
                //     family.element_identifier
                // ].map((req) =[req.element_identifier])
                return acc;
            }, {} as GlobalStatuses);

            const storedRequirements = idbRequirements?.reduce((acc, cur) => {
                acc[cur.id] = cur;
                return acc;
            }, {} as Record<string, IDBRequirement>);

            for (const [requirementId, securityRequirements] of Object.entries(
                manifest.securityRequirements.byRequirements
            )) {
                const family = securityRequirements[0].family;

                let subSecurityStatuses = securityRequirements.reduce(
                    (acc, securityRequirement) => {
                        acc[securityRequirement.subSubRequirement] =
                            Status.NOT_STARTED;
                        return acc;
                    },
                    {} as Record<string, Status>
                );

                if (storedRequirements[requirementId]) {
                    subSecurityStatuses = {
                        ...subSecurityStatuses,
                        ...storedRequirements[requirementId]
                            .bySecurityRequirementId,
                    };
                }
                familyStatus[family].subSecurityRequirementStatuses = {
                    ...familyStatus[family].subSecurityRequirementStatuses,
                    ...subSecurityStatuses,
                };
            }

            setAggregateFamilyStatus(familyStatus);
        }
        fetchInitialState();
    }, [families]);

    return aggregateFamilyStatus;
};

export const useFamilyStatus = (familyId: string) => {
    const globalStatus = useGlobalStatus();
    return globalStatus?.[familyId];
};
