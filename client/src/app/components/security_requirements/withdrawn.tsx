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

            <div
                id="alert-additional-content-5"
                className="p-4 border border-yellow-100 text-yellow-800  rounded-lg bg-yellow-50 "
                role="alert"
            >
                <div className="flex items-center">
                    <svg
                        className="shrink-0 w-4 h-4 me-2"
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
                    </svg>
                    <span className="sr-only">Info</span>
                    <h3 className="text-lg font-sm text-gray-800 ">
                        Withdrawn
                    </h3>
                </div>
                <div className="mt-2 mb-4 text-xs text-gray-800">
                    <p className="mb-2">
                        This security requirement has been withdrawn as of
                        NIST-SP 800-171 revision 3, but is retained as CMMC is
                        using revision 2.
                    </p>
                </div>
            </div>

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
