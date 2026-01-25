"use client";
import { useManifestContext } from "@/app/context/manifest";
import { toNum, toPath, useRevisionContext } from "@/app/context/revision";
import Link from "next/link";
import { useGlobalEvidence } from "../hooks/evidence";
import { useGlobalStatus } from "../hooks/status";
import { Breadcrumbs } from "./breadcrumbs";
import { EvidenceState } from "./evidence";
import { IconInfo } from "./icon_info";
import { Popover } from "./popover";
import { StatusState } from "./status";

export const Families = () => {
    const revision = useRevisionContext();
    const path = toPath(revision);
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
                SP NIST 800-171 Families {revision}
                <button className="ml-2" popoverTarget="families-popover">
                    <IconInfo inline={false} />
                </button>
            </h2>
            <Popover id="families-popover">
                <IconInfo />
                <span>
                    Families from NIST 800-171 {revision} include controls from
                    revision {toNum(revision)}. Revision 2 is the current valid
                    CMMC revision.
                </span>
            </Popover>
            <ul>
                {families.map((family) => (
                    <li className="flex mb-2" key={family.element_identifier}>
                        <Link
                            className="flex flex-col"
                            href={`${path}/family/${family.element_identifier}`}
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
