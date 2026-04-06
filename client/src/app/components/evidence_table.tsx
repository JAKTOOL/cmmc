"use client";
import { FileBadge, LinkBadge } from "@/app/components/evidence";
import {
    defaultFilter,
    defaultSort,
    Order,
    Table,
} from "@/app/components/table";
import { toPath, useRevisionContext } from "@/app/context/revision";
import { IDB, IDBEvidenceV2 } from "@/app/db";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface Requirements {
    requirements: string[];
}

interface EvidenceWithRequirements extends IDBEvidenceV2, Requirements {}

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

    return evidence.map(
        (artifact) =>
            ({
                ...artifact,
                requirements: (
                    requirementsByEvidenceId[artifact.id] || []
                ).sort(),
            }) as EvidenceWithRequirements,
    );
}

const nestedSort = (a?: string[], b?: string[]) => defaultSort(a?.[0], b?.[0]);
const sorters = [defaultSort, defaultSort, nestedSort, defaultSort];
const filters = [defaultFilter, defaultFilter, null, null];

export const EvidenceTable = () => {
    const [evidenceWithRequirements, setEvidenceWithRequirements] = useState<
        EvidenceWithRequirements[]
    >([]);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        (async function () {
            setEvidenceWithRequirements(await fetchEvidence());
        })();
    }, []);

    const revision = useRevisionContext();
    const path = toPath(revision);

    const tableHeaders = useMemo(
        () => [
            {
                text: "Filename",
                filterable: true,
            },
            {
                text: "Type",
                filterable: true,
                className: "text-center",
            },
            {
                text: "Requirements",
                filterable: false,
                className: "max-md:hidden",
            },
            {
                text: "File Hash",
                filterable: false,
                className: "max-md:hidden",
            },
        ],
        [],
    );

    const tableBody = useMemo(
        () =>
            evidenceWithRequirements?.map((artifact) => ({
                values: [
                    artifact.filename,
                    artifact.type,
                    artifact.requirements,
                    artifact.id,
                ],
                columns: [
                    artifact.type === "url" ? (
                        <LinkBadge artifact={artifact} hideIcon />
                    ) : (
                        <FileBadge artifact={artifact} hideIcon />
                    ),
                    artifact.type,
                    artifact.requirements.map((requirement) => (
                        <Link
                            key={`${artifact.id}-${requirement}`}
                            href={`${path}/requirement/${requirement}`}
                            className="mr-2 text-blue-400"
                        >
                            {requirement}
                        </Link>
                    )),
                    artifact.id,
                ],
                classNames: [null, null, "max-md:hidden", "max-md:hidden"],
            })) ?? [],
        [evidenceWithRequirements, path],
    );

    return (
        <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
            <section className="w-full flex flex-col">
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <Table
                        sorters={sorters}
                        filters={filters}
                        tableHeaders={tableHeaders}
                        tableBody={tableBody}
                        initialOrders={[
                            Order.NONE,
                            Order.NONE,
                            Order.NONE,
                            Order.NONE,
                        ]}
                        formRef={formRef}
                    />
                </div>
            </section>
        </form>
    );
};
