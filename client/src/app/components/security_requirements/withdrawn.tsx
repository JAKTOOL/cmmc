"use client";
import Link from "next/link";
import { Breadcrumbs } from "../breadcrumbs";
import { DataTable } from "../datatable";
import { IconInfo } from "../icon_info";
import { Popover } from "../popover";
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

            <h3 className="text-3xl mt-6 block sm:flex items-center">
                Security Requirements for {requirement.requirement}
                <StatusState statuses={statuses} />
            </h3>

            <div
                id="alert-additional-content-5"
                className="p-4 border border-yellow-100 text-yellow-800  rounded-lg bg-yellow-50 "
                role="alert"
            >
                <div className="flex items-center">
                    <IconInfo />
                    <span className="sr-only">Info</span>
                    <h3 className="text-lg font-sm text-gray-800 ">
                        Withdrawn
                    </h3>
                </div>
                <div className="mt-2 mb-4 text-xs text-gray-800">
                    <p className="mb-2">
                        This security requirement has been withdrawn from
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
                            title: (
                                <>
                                    <button
                                        popoverTarget="deprecated-value-popover"
                                        className="uppercase flex items-center"
                                    >
                                        <span className="mr-2">
                                            Withdrawn Reason
                                        </span>{" "}
                                        <IconInfo />
                                    </button>
                                    <Popover id="deprecated-value-popover">
                                        <IconInfo />
                                        <span>
                                            Why this security control was
                                            withdrawn.
                                        </span>
                                    </Popover>
                                </>
                            ),
                            visible: true,
                            className: "hidden md:block",
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
