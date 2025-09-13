"use client";
import { useManifestContext } from "@/app/context";
import Link from "next/link";
import { useFamilyStatus } from "../hooks/status";
import { Breadcrumbs } from "./breadcrumbs";
import { StatusState } from "./status";

export const Requirements = ({ familyId }: { familyId: string }) => {
    const manifest = useManifestContext();
    const requirements = manifest.requirements.byFamily[familyId];
    const family = manifest.families.byId[familyId];
    const familyStatus = useFamilyStatus(familyId);

    return (
        <>
            <Breadcrumbs familyId={familyId} />
            <h2 className="text-4xl flex flex-row items-center">
                Requirements for {family.element_identifier}: {family.title}{" "}
                <StatusState status={familyStatus?.status} />
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
                                status={familyStatus?.requirementStatus(
                                    requirement.element_identifier
                                )}
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
