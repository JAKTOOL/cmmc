"use client";
import Link from "next/link";
import { Breadcrumbs } from "../breadcrumbs";
import { DataTable } from "../datatable";
import { StatusState } from "../status";
import { SecurityForm } from "./security_form";

const secReqReg = /\d{2}.\d{2}.\d{2},?/gm;

const WithdrawnInto = ({ text }: { text: string }) => {
    if (secReqReg.test(text)) {
        const base = text
            .replaceAll(secReqReg, "")
            .replace("and", "")
            .replace(".", "");

        const links = text.match(secReqReg)?.map((id) => {
            const _id = id.replace(",", "");
            return (
                <Link
                    key={_id}
                    href={`/r3/requirement/${_id}`}
                    className="text-xs mr-1"
                >
                    {id}
                </Link>
            );
        }) as JSX.Element[];

        return [base, ...links];
    }

    return text;
};

export const WithdrawnSecurityRequirement = ({
    initialState,
    isHydrating,
    manifest,
    next,
    prev,
    requirement,
    requirementId,
    setInitialState,
    setStatuses,
    statuses,
    value,
    withdrawn,
    groupings,
}) => {
    return (
        <>
            <Breadcrumbs requirementId={requirementId} />
            <h3 className="text-3xl mt-6">
                Security Requirements for {requirement.requirement}
                <StatusState statuses={statuses} />
            </h3>
            <p
                className="text-base discussion"
                dangerouslySetInnerHTML={{
                    __html:
                        manifest.discussions.byRequirements[requirementId]?.[0]
                            ?.text || "",
                }}
            ></p>
            <aside className="flex flex-wrap justify-between items-center w-full mx-auto">
                <div className="flex mb-4 sm:mb-1">
                    <a
                        href={`https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/SP_800_171_3_0_0/home?element=${requirement.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-gray-600"
                    >
                        View CPRT {requirement.id}
                    </a>
                </div>
                <DataTable
                    rows={[
                        {
                            title: "Revision",
                            visible: true,
                            value: value?.revision,
                        },
                        { title: "Value", visible: true, value: value?.value },
                        {
                            title: "Partial Value",
                            visible: (value?.partial_value ?? 0) > 0,
                            value: value?.partial_value,
                        },
                        {
                            title: "Withdrawn Reason",
                            visible: true,
                            value: (
                                <WithdrawnInto
                                    text={withdrawn?.[0]?.element?.text}
                                />
                            ),
                        },
                    ]}
                />
            </aside>
            <section className="w-full flex flex-col">
                <SecurityForm
                    requirement={requirement}
                    initialState={initialState}
                    setInitialState={setInitialState}
                    isHydrating={isHydrating}
                    setStatuses={setStatuses}
                    prev={prev}
                    next={next}
                    groupings={groupings}
                />
            </section>
        </>
    );
};
