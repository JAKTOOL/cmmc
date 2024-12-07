"use client";
import { useManifestContext } from "@/app/context";
import { IDB } from "@/app/db";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { Status, StatusState } from "./status";

export const Families = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const [status, setStatus] = useState({});
    if (!families?.length) {
        return null;
    }

    useEffect(() => {
        async function fetchInitialState() {
            const idbRequirements = await IDB.requirements.getAll();

            const status = families.reduce((acc, cur) => {
                acc[cur.element_identifier] = [];
                return acc;
            }, {});
            for (const family of families) {
                const familyId = family.element_identifier;
                const familyRequirements =
                    manifest.requirements.byFamily[familyId];
                const storedRequirements = idbRequirements?.reduce(
                    (acc, cur) => {
                        acc[cur.id] = cur;
                        return acc;
                    },
                    {}
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
                        status[familyId].push(
                            hasFamilyBeenWorkedUpon
                                ? Status.NEEDS_WORK
                                : Status.NOT_STARTED
                        );
                        continue;
                    }
                    const values = Object.values(
                        stored.bySecurityRequirementId
                    );
                    if (securityRequirements.length !== values.length) {
                        status[familyId].push(Status.NOT_STARTED);
                        continue;
                    }
                    status[familyId] = [...status[familyId], ...values];
                }

                setStatus(status);
            }
        }
        fetchInitialState();
    }, [families]);

    return (
        <>
            <Breadcrumbs />
            <h2 className="text-4xl">800-171 Rev 3 Families</h2>
            <ul>
                {families.map((family) => (
                    <li className="flex mb-2" key={family.element_identifier}>
                        <Link
                            className="flex flex-col"
                            href={`/r3/family/${family.element_identifier}`}
                        >
                            <h3 className="text-2xl flex flex-row">
                                <StatusState
                                    statuses={
                                        status?.[family.element_identifier]
                                    }
                                />
                                <span className="flex flex-col mr-2">
                                    {family.element_identifier}:
                                </span>
                                <span className="flex flex-col">
                                    {family.title}
                                </span>
                            </h3>
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
};
