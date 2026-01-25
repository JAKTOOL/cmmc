"use client";
import { useManifestContext } from "@/app/context/manifest";
import { IDBRequirement } from "@/app/db";
import { useMemo } from "react";
import { Status, calcStatus } from "../components/status";
import { useDBRequirements } from "./db";

export class FamilyStatus {
    subSecurityRequirementStatuses: Record<string, Status>;

    constructor(subSecurityRequirementStatuses?: Record<string, Status>) {
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
                [] as Status[],
            ),
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
                [] as Status[],
            ),
        );
    }
}

type GlobalStatuses = Record<string, FamilyStatus>;

export const useGlobalStatus = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const securityRequirementsByRequirements =
        manifest.securityRequirements.byRequirements;
    const idbRequirements = useDBRequirements();

    return useMemo(() => {
        if (!families?.length || !idbRequirements) {
            return;
        }

        const familyStatus = families.reduce((acc, family) => {
            acc[family.element_identifier] = new FamilyStatus();
            return acc;
        }, {} as GlobalStatuses);

        const storedRequirements = idbRequirements?.reduce(
            (acc, cur) => {
                acc[cur.id] = cur;
                return acc;
            },
            {} as Record<string, IDBRequirement>,
        );

        for (const [requirementId, securityRequirements] of Object.entries(
            securityRequirementsByRequirements,
        )) {
            const family = securityRequirements[0].family;

            let subSecurityStatuses = securityRequirements.reduce(
                (acc, securityRequirement) => {
                    acc[securityRequirement.subSubRequirement] =
                        Status.NOT_STARTED;
                    return acc;
                },
                {} as Record<string, Status>,
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
        return familyStatus;
    }, [families, securityRequirementsByRequirements, idbRequirements]);
};

export const useFamilyStatus = (familyId: string) => {
    const globalStatus = useGlobalStatus();
    return globalStatus?.[familyId];
};
