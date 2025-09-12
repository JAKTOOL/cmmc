"use client";
import { useManifestContext } from "@/app/context";
import Link from "next/link";
import { useFamilyState } from "../hooks/familyState";
import { Breadcrumbs } from "./breadcrumbs";
import { StatusState } from "./status";

export const Families = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const familyState = useFamilyState();
    if (!families?.length) {
        return null;
    }

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
                                        familyState?.[family.element_identifier]
                                            ?.requirement_statuses
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
