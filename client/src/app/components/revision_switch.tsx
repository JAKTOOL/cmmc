"use client";
import {
    SecurityRequirementValue,
    SecurityRequirementValuesSchema,
} from "@/api/entities/RequirementValues";
import {
    Revision,
    toNum,
    toPath,
    useRevisionContext,
} from "@/app/context/revision";
import { useRequirementsValues } from "@/app/hooks/requirementValues";
import Link from "next/link";
import { useParams } from "next/navigation";

function getNextPath({
    nextRevision,
    family_id,
    requirement_id,
    values,
}: {
    nextRevision: Revision;
    family_id?: string;
    requirement_id?: string;
    values: SecurityRequirementValuesSchema;
}) {
    const value: SecurityRequirementValue | undefined =
        values?.[requirement_id || ""];
    const hasRequirement = !!(requirement_id && value);
    const nextFamily: SecurityRequirementValue | undefined =
        values?.[`${family_id}.01`] ||
        values?.[`${requirement_id?.slice(0, 5)}.01`];

    let nextPath = toPath(nextRevision);
    if (hasRequirement) {
        if (value.revision.includes(toNum(nextRevision))) {
            nextPath = `${nextPath}/requirement/${requirement_id}`;
        } else if (
            nextFamily &&
            nextFamily?.revision?.includes(toNum(nextRevision))
        ) {
            nextPath = `${nextPath}/family/${requirement_id.slice(0, 5)}`;
        }
    } else if (
        nextFamily &&
        nextFamily?.revision?.includes(toNum(nextRevision))
    ) {
        nextPath = `${nextPath}/family/${family_id}`;
    }

    return nextPath;
}

export const RevisionSwitch = () => {
    const revision = useRevisionContext();
    const { family_id, requirement_id } = useParams<{
        family_id?: string;
        requirement_id?: string;
    }>();
    const values = useRequirementsValues();

    const nextRevision = revision === Revision.V2 ? Revision.V3 : Revision.V2;

    const nextPath = getNextPath({
        nextRevision,
        family_id,
        requirement_id,
        values,
    });
    return (
        <div className="relative inline-block text-left">
            <Link
                href={nextPath}
                title={`Toggle 800-171 revision to ${
                    nextRevision
                }. CMMC currently only uses R2.`}
                className={`px-3 me-2 text-sm font-medium focus:z-20 focus:ring-4 focus:ring-gray-100 focus:ring-gray-700 text-gray-500 border-gray-600 border-r flex items-center ${
                    revision === Revision.V2
                        ? "bg-green-300 border border-green-500 text-green-600 hover:text-green-800"
                        : "bg-yellow-300 border border-yellow-500 text-yellow-600 hover:text-yellow-800"
                }`}
            >
                {revision}
            </Link>
        </div>
    );
};
