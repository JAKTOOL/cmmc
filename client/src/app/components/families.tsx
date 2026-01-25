"use client";
import { useManifestContext } from "@/app/context/manifest";
import Link from "next/link";
import { useGlobalEvidence } from "../hooks/evidence";
import { useGlobalStatus } from "../hooks/status";
import { Breadcrumbs } from "./breadcrumbs";
import { EvidenceState } from "./evidence";
import { IconInfo } from "./icon_info";
import { Popover } from "./popover";
import { StatusState } from "./status";

export const Families = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    const globalStatus = useGlobalStatus();
    const globalEvidence = useGlobalEvidence();
    if (!families?.length) {
        return null;
    }

    return (
        <>
            <Breadcrumbs />
            <h2 className="text-4xl block sm:flex items-center">
                SP NIST 800-171 Families
                <button className="ml-2" popoverTarget="families-popover">
                    <IconInfo inline={false} />
                </button>
            </h2>
            <Popover id="families-popover">
                <IconInfo />
                <span>
                    Families from NIST 800-171 include controls from both
                    revision 2 and 3. Withdrawn controls from revision 2 will
                    show with a strikethrough, and otherwise display a warning
                    when viewing the requirements.
                </span>
            </Popover>
            <ul>
                {families.map((family) => (
                    <li className="flex mb-2" key={family.element_identifier}>
                        <Link
                            className="flex flex-col"
                            href={`/r3/family/${family.element_identifier}`}
                        >
                            <h3 className="text-2xl flex flex-row">
                                <StatusState
                                    status={
                                        globalStatus?.[
                                            family.element_identifier
                                        ]?.status
                                    }
                                />
                                <span className="flex flex-col mr-2">
                                    {family.element_identifier}:
                                </span>
                                <span className="flex flex-col">
                                    {family.title}
                                </span>
                                <EvidenceState
                                    evidence={
                                        globalEvidence?.[
                                            family.element_identifier
                                        ]?.hasEvidence
                                    }
                                />
                            </h3>
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
};
