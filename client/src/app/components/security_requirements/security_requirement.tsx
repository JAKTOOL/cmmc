"use client";
import { renderNumber } from "@/app/utils/number";
import Link from "next/link";
import { Breadcrumbs } from "../breadcrumbs";
import { DataTable } from "../datatable";
import { IconInfo } from "../icon_info";
import { Popover } from "../popover";
import { StatusState } from "../status";
import { SecurityForm } from "./security_form";

export const SecurityRequirement = ({
    groupings,
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
}) => {
    return (
        <>
            <Breadcrumbs requirementId={requirementId} />
            <h3 className="text-3xl mt-6">
                Security Requirements for {requirement.requirement}{" "}
                {requirement.title}
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
                            title: (
                                <>
                                    <button
                                        popoverTarget="deprecated-popover"
                                        className="uppercase flex items-center"
                                    >
                                        <span className="mr-2">Deprecates</span>{" "}
                                        <IconInfo />
                                    </button>
                                    <Popover id="deprecated-popover">
                                        <IconInfo />
                                        <span>
                                            This security requirement
                                            incorporates the following controls
                                            from revision 2.
                                        </span>
                                    </Popover>
                                </>
                            ),
                            visible: !!value?.withdrawn_from?.length,
                            className: "hidden md:inline",
                            value: value?.withdrawn_from?.map((id) => (
                                <Link
                                    key={id}
                                    href={`/r3/requirement/${id}`}
                                    className="text-xs mr-2"
                                >
                                    {id}
                                </Link>
                            )),
                        },
                        {
                            title: (
                                <>
                                    <button
                                        popoverTarget="deprecated-value-popover"
                                        className="uppercase flex items-center"
                                    >
                                        <span className="mr-2">
                                            Deprecated Value
                                        </span>{" "}
                                        <IconInfo />
                                    </button>
                                    <Popover id="deprecated-value-popover">
                                        <IconInfo />
                                        <span>
                                            This is the aggregate value of all
                                            controls this security requirement
                                            has incorporated.
                                        </span>
                                    </Popover>
                                </>
                            ),
                            visible: !!value?.withdrawn_from?.length,
                            value: renderNumber(
                                value?.aggregate_value_withdrawn_from
                            ),
                        },
                    ]}
                />
            </aside>
            <section className="w-full flex flex-col">
                <SecurityForm
                    requirement={requirement}
                    groupings={groupings}
                    initialState={initialState}
                    setInitialState={setInitialState}
                    isHydrating={isHydrating}
                    setStatuses={setStatuses}
                    prev={prev}
                    next={next}
                />
            </section>
        </>
    );
};
