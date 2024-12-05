"use client";
import { useManifestContext } from "@/app/context";
import { getDB } from "@/app/db";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { StatusState } from "./status";

export const Requirements = ({ familyId }: { familyId: string }) => {
    const manifest = useManifestContext();
    const requirements = manifest.requirements.byFamily[familyId];
    const family = manifest.families.byId[familyId];
    const [status, setStatus] = useState({});
    if (!requirements?.length) {
        return null;
    }

    useEffect(() => {
        async function fetchInitialState() {
            const db = await getDB;
            const store = db
                .transaction("requirements", "readonly")
                .objectStore("requirements");

            const ids = requirements.map((r) => r.element_identifier);

            const request = store.getAll(
                IDBKeyRange.bound(ids[0], ids[ids.length - 1])
            );
            request.onsuccess = () => {
                let unfinishedWork =
                    request.result.length &&
                    ids.length !== request.result.length;
                const status = request?.result?.reduce((acc, cur) => {
                    const securityRequirements =
                        manifest.securityRequirements.byRequirements[cur.id];
                    const values = Object.values(cur.bySecurityRequirementId);
                    if (
                        securityRequirements.length !== values.length &&
                        !unfinishedWork
                    ) {
                        unfinishedWork = true;
                    }
                    acc[cur.id] = values;
                    return acc;
                }, {});

                if (unfinishedWork) {
                    status["all"] = ["needs-work"];
                } else {
                    status["all"] = Object.values(status).flat();
                }

                setStatus(status);
            };
            request.onerror = () => {};
        }
        fetchInitialState();
    }, [familyId]);

    return (
        <>
            <Breadcrumbs familyId={familyId} />
            <h2 className="text-4xl flex flex-row items-center">
                Requirements for {family.element_identifier}: {family.title}{" "}
                <StatusState statuses={status["all"]} />
            </h2>
            <ol>
                {requirements?.map((requirement) => (
                    <li
                        className="flex items-center mb-2"
                        key={requirement.element_identifier}
                    >
                        <Link
                            className="flex"
                            href={`/r3/requirement/${requirement.element_identifier}`}
                        >
                            <StatusState
                                statuses={
                                    status[requirement.element_identifier]
                                }
                            />
                            <h3 className="text-2xl">
                                {requirement.element_identifier}:{" "}
                                {requirement.title}
                            </h3>
                        </Link>
                    </li>
                ))}
                <br />
            </ol>
            <br />
        </>
    );
};
