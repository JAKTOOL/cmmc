"use client";
import { toDataURL } from "@/app/components/security_requirements/utils";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { IDB, IDBEvidenceV2 } from "../db";

interface Requirements {
    requirements: string[];
}

interface EvidenceWithRequirements extends IDBEvidenceV2, Requirements {}

interface EvidenceRowProps {
    evidence: EvidenceWithRequirements;
}

export const FileBadge = ({
    artifact,
}: {
    artifact: EvidenceWithRequirements;
}) => {
    const viewFile = async () => {
        const file = new File([artifact.data], artifact.filename, {
            type: artifact.type,
        });
        const url = await toDataURL(file);

        Object.assign(document.createElement("a"), {
            target: "_blank",
            rel: "noopener noreferrer",
            href: url,
        }).click();
    };

    return (
        <button
            className="border-r border-blue-200 pr-2 flex"
            title={`${artifact.data.byteLength} bytes | ${artifact.type}`}
            onClick={viewFile}
        >
            <span>{artifact.filename}</span>
        </button>
    );
};

const EvidenceRow: React.FC<EvidenceRowProps> = ({ evidence }) => {
    return (
        <tr>
            <td className="px-4 py-3">
                <FileBadge artifact={evidence} />
            </td>
            <td className="px-4 py-3">{evidence.type}</td>
            <td className="px-4 py-3">
                {evidence.requirements.map((requirement) => (
                    <Link
                        key={`${evidence.id}-${requirement}`}
                        href={`/r2/requirement/${requirement}`}
                    >
                        {requirement}
                    </Link>
                ))}
            </td>
            <td className="px-4 py-3">{evidence.id}</td>
        </tr>
    );
};

async function fetchEvidence(): Promise<EvidenceWithRequirements[]> {
    const evidenceRequirementRecords = await IDB.evidenceRequirements.getAll();
    const requirementsByEvidenceId = evidenceRequirementRecords.reduce(
        (acc, record) => {
            if (!acc[record.evidence_id]) {
                acc[record.evidence_id] = [];
            }
            acc?.[record.evidence_id]?.push(record.requirement_id);
            return acc;
        },
        {} as { [key: string]: string[] },
    );

    const evidence = await IDB.evidence.getAll();

    debugger;

    return evidence.map(
        (artifact) =>
            ({
                ...artifact,
                requirements: requirementsByEvidenceId[artifact.id] || [],
            }) as EvidenceWithRequirements,
    );
}

export const EvidenceTable = () => {
    const [evidenceWithRequirements, setEvidenceWithRequirements] = useState<
        EvidenceWithRequirements[]
    >([]);

    useEffect(() => {
        (async function () {
            setEvidenceWithRequirements(await fetchEvidence());
        })();
    }, []);

    return (
        <div className="overflow-x-auto relative sm:rounded-lg border shadow-md">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                        <th scope="col" className="px-4 py-3">
                            Filename
                        </th>
                        <th scope="col" className="px-4 py-3">
                            Type
                        </th>
                        <th scope="col" className="px-4 py-3">
                            Requirements
                        </th>
                        <th scope="col" className="px-4 py-3">
                            Hash
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {evidenceWithRequirements.map((evidence) => (
                        <EvidenceRow key={evidence.id} evidence={evidence} />
                    ))}
                </tbody>
            </table>
        </div>
    );
};
