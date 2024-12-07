"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import { useManifestContext } from "@/app/context";
import { getDB } from "@/app/db";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { ContentNavigation } from "./content_navigation";
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
    const [hasChanged, setHasChanged] = useState(!!defaultValue);
    const inputRef = useRef(null);
    const setToChanged = useMemo(() => () => setHasChanged(true), []);

    return (
        <div
            onBlur={setToChanged}
            onClick={setToChanged}
            onKeyUp={setToChanged}
            onChange={setToChanged}
        >
            <select
                // HACK: To get around react resetting select element back to default value
                // as it doesn't re-render properly otherwise
                key={`${id}-${isPending}`}
                id={id}
                name={id}
                // ref={inputRef}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                disabled={isPending}
                defaultValue={inputRef?.current?.value || defaultValue}
            >
                <option value="not-implemented">Not Implemented</option>
                <option value="implemented">Implemented</option>
                <option value="not-applicable">Not Applicable</option>
            </select>
            {/* 
                NOTE: Don't allow status to be stored until an actual change has occurred (first committed to as user by clicking on the select parent element)

                In cases where the status is not changed, we don't render the hidden input element to allow the status to be stored correctly
            */}
            {!hasChanged && (
                <input type="hidden" name={id} value={defaultValue} />
            )}
        </div>
    );
};

// rounded-lg p-4 bg-black/5 border-2 border-solid border-black/10 font-mono font-medium text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none

const SecurityRequirementSelect = ({
    securityRequirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${securityRequirement.subSubRequirement}.status`;
    return (
        <div className="flex flex-col mr-4" key={key}>
            <label
                htmlFor={key}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 my-2"
            >
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
            <label
                htmlFor={key}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 my-2"
            >
                Description
            </label>
            <textarea
                name={key}
                id={key}
                rows={5}
                className="grow w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
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
        <li className="mb-4">
            <fieldset className="flex flex-col grow">
                <legend className="text-2xl flex flex-row items-center justify-center">
                    <StatusState
                        status={
                            initialState[
                                `${securityRequirement.subSubRequirement}.status`
                            ]
                        }
                    />
                    <h4 id={securityRequirement.subSubRequirement}>
                        {securityRequirement.subSubRequirement}
                    </h4>
                </legend>
                <p className="text-lg my-2">{securityRequirement.text}</p>
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

const saveState = async (requirementId: string, formData: FormData) => {
    const db = await getDB;
    const store = db
        ?.transaction("security_requirements", "readwrite")
        .objectStore("security_requirements");

    const records: Record<string, Record<string, FormDataEntryValue>> = {};
    for (const [_key, value] of formData.entries()) {
        // Extract the id from the key to the last period
        const idx = _key.lastIndexOf(".");
        const id = _key.substring(0, idx);
        const key = _key.substring(idx + 1);
        records[id] = { ...(records?.[id] || {}), [key]: value };
    }
    for (const [id, record] of Object.entries(records)) {
        store?.put({ id, ...record });
    }

    const reqStore = db
        ?.transaction("requirements", "readwrite")
        .objectStore("requirements");

    const statuses: string[] = [];
    reqStore?.put({
        id: requirementId,
        bySecurityRequirementId: Object.entries(records).reduce(
            (acc, [id, record]) => {
                acc[id] = record.status;
                statuses.push(record.status as string);
                return acc;
            },
            {}
        ),
    });

    return statuses;
};

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export const SecurityForm = ({
    requirement,
    initialState,
    setInitialState,
    groupings,
    isHydrating,
    setStatuses,
    prev,
    next,
}) => {
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    async function action(prevState, formData) {
        const statuses = await saveState(requirement.id, formData);
        setStatuses(statuses);
        setInitialState(Object.fromEntries(formData.entries()));
        setLastSaved(new Date());
    }

    const debouncedSave = useMemo(
        () =>
            debounce((event) => {
                const formData = new FormData(event.target.form);
                const statuses = saveState(requirement.id, formData);
                setStatuses(statuses);
                setInitialState(Object.fromEntries(formData.entries()));
                setLastSaved(new Date());
            }, 250),
        [requirement.id, setStatuses, setInitialState]
    );

    const [_, formAction, isPending] = useActionState(action, initialState);

    return (
        <form
            id={requirement.element_identifier}
            action={formAction}
            onChange={debouncedSave}
            className="basis-full"
        >
            <ContentNavigation previous={prev} next={next} />
            <div
                className="sticky top-32 left-full z-30 flex flex-row-reverse items-center shrink-0 w-1/4"
                style={{ transform: "translateY(-100%)" }}
            >
                <button
                    type="submit"
                    className="shrink w-24 bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 border-b-4 border-green-700 hover:border-green-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                    disabled={isHydrating}
                >
                    Save
                </button>
                {lastSaved && (
                    <span className="text-sm text-gray-500 mr-4">
                        Last saved: {lastSaved?.toLocaleTimeString()}
                    </span>
                )}
            </div>
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
    const router = useRouter();
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

    const [prev, next] = useMemo(() => {
        const requirements =
            manifest?.requirements.byFamily[requirement?.family] || [];
        const requirementIdx = requirements.findIndex(
            (r) => r.id === requirementId
        );

        let prev = requirements[requirementIdx - 1];
        let next = requirements[requirementIdx + 1];

        if (!prev || !next) {
            const families = manifest.families.elements;
            const familyIdx = families.findIndex(
                (f) => f.id === requirement.family
            );
            if (!prev) {
                const prevFamilyId = families?.[familyIdx - 1]?.id;
                const prevRequirements =
                    manifest.requirements.byFamily[prevFamilyId];
                prev = prevRequirements?.[prevRequirements?.length - 1];
            }
            if (!next) {
                const nextFamilyId = families?.[familyIdx + 1]?.id;
                next = manifest.requirements.byFamily[nextFamilyId]?.[0];
            }
        }
        return [prev, next];
    }, [requirement, requirementId]);

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
    }, [requirementId, setInitialState, securityRequirements]);

    useEffect(() => {
        const handleHashChange = (event) => {
            const url = new URL(
                `${window.location.origin}/${event.newURL.split("#")[1]}`
            );
            if (url.searchParams.get("element")) {
                // HACK: Allows for the back button to work properly
                history.replaceState(
                    null,
                    "",
                    window.location.pathname + window.location.search
                );
                router.push(
                    `/r3/requirement/${url.searchParams.get("element")}`
                );
            }
        };

        window.addEventListener("hashchange", handleHashChange);

        return () => {
            window.removeEventListener("hashchange", handleHashChange);
        };
    }, []);

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
            <p
                className="text-base discussion"
                dangerouslySetInnerHTML={{
                    __html:
                        manifest.discussions.byRequirements[requirementId]?.[0]
                            ?.text || "",
                }}
            ></p>
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
