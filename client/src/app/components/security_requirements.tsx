"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import { useManifestContext } from "@/app/context";
import { getDB } from "@/app/db";
import { Breadcrumbs } from "./breadcrumbs";
import { StatusState } from "./status";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

interface SecurityRequirement {
    element_identifier: string;
    subSubRequirement: string;
    text: string;
    subRequirement: string;
}

interface SecurityRequirementProps {
    securityRequirement: SecurityRequirement;
    initialState: Record<string, string>;
    isPending: boolean;
}

const Select = ({ id, defaultValue, isPending }) => {
    const inputRef = useRef(null);

    // HACK: To get around react resetting select element back to default value
    // as it doesn't re-render properly otherwise
    if (isPending) {
        return (
            <select
                key={`${id}-pending`}
                id={id}
                name={id}
                className="rounded-lg p-4 bg-black/5 border-2 border-solid border-black/10 font-mono font-medium text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                disabled={true}
                value={inputRef?.current?.value || defaultValue}
            >
                <option value="not-implemented">Not Implemented</option>
                <option value="implemented">Implemented</option>
                <option value="not-applicable">Not Applicable</option>
            </select>
        );
    }

    return (
        <select
            key={id}
            id={id}
            name={id}
            ref={inputRef}
            className="rounded-lg p-4 bg-black/5 border-2 border-solid border-black/10 font-mono font-medium text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
            disabled={isPending}
            defaultValue={defaultValue}
        >
            <option value="not-implemented">Not Implemented</option>
            <option value="implemented">Implemented</option>
            <option value="not-applicable">Not Applicable</option>
        </select>
    );
};

const SecurityRequirementSelect = ({
    securityRequirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${securityRequirement.subSubRequirement}.status`;
    return (
        <div className="flex flex-col mr-4" key={key}>
            <label htmlFor={key} className="font-semibold text-lg">
                Status
            </label>
            <Select
                id={key}
                isPending={isPending}
                defaultValue={initialState[key]}
            />
        </div>
    );
};

const SecurityRequirementNote = ({
    securityRequirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${securityRequirement.subSubRequirement}.description`;
    return (
        <div className="flex flex-col grow">
            <label htmlFor={key} className="font-semibold text-lg">
                Description
            </label>
            <textarea
                name={key}
                id={key}
                rows="5"
                maxLength="256"
                required=""
                placeholder="[Max 256 chars]"
                className="grow rounded-lg p-4 bg-black/5 border-2 border-solid border-black/10 font-mono font-medium text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                disabled={isPending}
                defaultValue={initialState[key]}
            ></textarea>
        </div>
    );
};

const SecurityRequirement = ({
    securityRequirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    return (
        <li>
            <fieldset className="flex flex-col grow">
                <legend className="text-2xl flex flex-row items-center justify-center">
                    <StatusState
                        status={
                            initialState[
                                `${securityRequirement.subSubRequirement}.status`
                            ]
                        }
                    />
                    {securityRequirement.subSubRequirement}
                </legend>
                <p className="text-lg">{securityRequirement.text}</p>
                <div className="flex flex-row">
                    <SecurityRequirementSelect
                        securityRequirement={securityRequirement}
                        initialState={initialState}
                        isPending={isPending}
                    />
                    <SecurityRequirementNote
                        securityRequirement={securityRequirement}
                        initialState={initialState}
                        isPending={isPending}
                    />
                </div>
            </fieldset>
        </li>
    );
};

export const SecurityForm = ({
    requirement,
    initialState,
    setInitialState,
    groupings,
    isHydrating,
    setStatuses,
}) => {
    async function action(prevState, formData) {
        const db = await getDB;
        const store = db
            .transaction("security_requirements", "readwrite")
            .objectStore("security_requirements");

        const records: Record<string, Record<string, string>> = {};
        for (const entry of formData.entries()) {
            const [_key, value] = entry;
            // Extract the id from the key to the last period
            const idx = _key.lastIndexOf(".");
            const id = _key.substring(0, idx);
            const key = _key.substring(idx + 1);
            records[id] = { ...(records?.[id] || {}), [key]: value };
        }
        for (const [id, record] of Object.entries(records)) {
            store.put({ id, ...record });
        }

        const reqStore = db
            .transaction("requirements", "readwrite")
            .objectStore("requirements");

        const statuses = [];
        reqStore.put({
            id: requirement.element_identifier,
            bySecurityRequirementId: Object.entries(records).reduce(
                (acc, [id, record]) => {
                    acc[id] = record.status;
                    statuses.push(record.status);
                    return acc;
                },
                {}
            ),
        });
        setStatuses(statuses);
        setInitialState(Object.fromEntries(formData.entries()));
    }
    const [_, formAction, isPending] = useActionState(action, initialState);

    return (
        <>
            <form id={requirement.element_identifier} action={formAction}>
                <button
                    type="submit"
                    className="bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 border-b-4 border-green-700 hover:border-green-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none sticky top-24 left-full z-30"
                    disabled={isPending || isHydrating}
                >
                    Save
                </button>
                {Object.entries(groupings)?.map(([key, grouping]) => (
                    <ol key={key}>
                        {grouping.map((securityRequirement) => (
                            <SecurityRequirement
                                key={securityRequirement.element_identifier}
                                securityRequirement={securityRequirement}
                                initialState={initialState}
                                isPending={isPending || isHydrating}
                            />
                        ))}
                    </ol>
                ))}
            </form>
        </>
    );
};

export const SecurityRequirements = ({
    requirementId,
}: {
    requirementId: string;
}) => {
    const [initialState, setInitialState] = useState({});
    const [isHydrating, setHydrating] = useState(false);
    const [statuses, setStatuses] = useState([]);
    const manifest = useManifestContext();
    const securityRequirements = useMemo(() => {
        return (
            manifest?.securityRequirements.byRequirements[requirementId] || []
        );
    }, [manifest, requirementId]);
    const requirement = useMemo(() => {
        return manifest?.requirements.byId[requirementId] || null;
    }, [manifest, requirementId]);
    const groupings = useMemo(() => {
        const groupings: Record<string, ElementWrapper[]> = {};
        for (const securityRequirement of securityRequirements) {
            if (!securityRequirement.text) {
                continue;
            }
            if (!groupings[securityRequirement.subRequirement]) {
                groupings[securityRequirement.subRequirement] = [];
            }
            groupings[securityRequirement.subRequirement].push(
                securityRequirement
            );
        }
        return groupings;
    }, [securityRequirements]);

    useEffect(() => {
        async function fetchInitialState() {
            setHydrating(true);
            const db = await getDB;
            const store = db
                .transaction("security_requirements", "readonly")
                .objectStore("security_requirements");

            const ids = securityRequirements.map((s) => s.subSubRequirement);

            const request = store.getAll(
                IDBKeyRange.bound(ids[0], ids[ids.length - 1])
            );
            request.onsuccess = () => {
                const statuses = [];
                const state = request?.result?.reduce((acc, requirement) => {
                    acc[`${requirement.id}.status`] = requirement.status;
                    acc[`${requirement.id}.description`] =
                        requirement.description;
                    statuses.push(requirement.status);
                    return acc;
                }, {});
                setStatuses(statuses);
                setInitialState(state);
                setHydrating(false);
            };
            request.onerror = () => {
                setHydrating(false);
            };
        }
        fetchInitialState();
    }, [requirementId, setInitialState]);

    if (!securityRequirements?.length) {
        return null;
    }

    return (
        <>
            <Breadcrumbs requirementId={requirementId} />
            <br />
            <h3 className="text-3xl">
                Security Requirements for {requirement.requirement}{" "}
                {requirement.title}
                <StatusState statuses={statuses} />
            </h3>
            <p className="text-base">
                {manifest.discussions.byRequirements[requirementId]?.[0]?.text}
            </p>
            <section className="w-full">
                <SecurityForm
                    requirement={requirement}
                    groupings={groupings}
                    initialState={initialState}
                    setInitialState={setInitialState}
                    isHydrating={isHydrating}
                    setStatuses={setStatuses}
                />
            </section>
        </>
    );
};
