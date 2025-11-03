"use client";
import { useManifestContext } from "@/app/context";
import Link from "next/link";
import { useMemo } from "react";
import { useFamilyEvidence } from "../hooks/evidence";
import { useFamilyStatus } from "../hooks/status";
import { Breadcrumbs } from "./breadcrumbs";
import { ContentNavigation } from "./content_navigation";
import { EvidenceState } from "./evidence";
import { IconInfo } from "./icon_info";
import { Popover } from "./popover";
import { StatusState } from "./status";

export const Requirements = ({ familyId }: { familyId: string }) => {
    const manifest = useManifestContext();
    const requirements = manifest.requirements.byFamily[familyId];
    const family = manifest.families.byId[familyId];
    const familyStatus = useFamilyStatus(familyId);
    const familyEvidence = useFamilyEvidence(familyId);

    const [prev, next] = useMemo(() => {
        const families = manifest?.families?.elements;
        const familyIdx = families?.findIndex((r) => r.id === familyId);
        const prev = families[familyIdx - 1];
        const next = families[familyIdx + 1];
        return [prev, next];
    }, [familyId, manifest]);

    return (
        <>
            <Breadcrumbs familyId={familyId} />
            <h2 className="text-4xl block sm:flex flex-row items-center">
                Requirements for {family.element_identifier}: {family.title}{" "}
                <button className="ml-2" popoverTarget="requirements-popover">
                    <IconInfo inline={false} />
                </button>
                <StatusState status={familyStatus?.status} />
                <EvidenceState evidence={familyEvidence?.hasEvidence} />
            </h2>
            <Popover id="requirements-popover">
                <IconInfo />
                <span>
                    Requirements from NIST 800-171 include controls from both
                    revision 2 and 3. Withdrawn controls from revision 2 will
                    show with a strikethrough, and otherwise display a warning
                    when viewing the requirement.
                </span>
            </Popover>
            <ContentNavigation
                elementIdentity={(element) => element?.family}
                previous={prev}
                next={next}
                elementType="family"
            />
            <ol>
                {requirements?.map((requirement) => {
                    const withdrawn =
                        manifest.withdrawReason.byRequirements[requirement.id];
                    const className = withdrawn ? "line-through" : "";
                    return (
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
                                <h3 className={`text-2xl ${className}`}>
                                    {requirement.element_identifier}:{" "}
                                    {withdrawn
                                        ? "Withdrawn"
                                        : requirement.title}
                                </h3>
                                <EvidenceState
                                    evidence={familyEvidence?.requirementEvidence(
                                        requirement.element_identifier
                                    )}
                                />
                            </Link>
                        </li>
                    );
                })}
                <br />
            </ol>
            <br />
        </>
    );
};
