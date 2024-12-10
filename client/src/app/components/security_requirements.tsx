"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import { useManifestContext } from "@/app/context";
import { IDB, IDBSecurityRequirement } from "@/app/db";
import { marked } from "marked";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { ContentNavigation } from "./content_navigation";
import { Status, StatusState } from "./status";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

// Set options
marked.use({
    async: true,
    pedantic: false,
    gfm: true,
    breaks: true,
});

interface SecurityRequirementProps {
    securityRequirement: ElementWrapper;
    initialState: Record<string, string>;
    isPending: boolean;
}

const Select = ({ id, defaultValue, isPending, idx }) => {
    const [hasChanged, setHasChanged] = useState(!!defaultValue);
    const inputRef = useRef<HTMLSelectElement>(null);
    const setToChanged = useMemo(
        () => () => !hasChanged && setHasChanged(true),
        [hasChanged]
    );
    const emitChange = useMemo(
        () => () => {
            if (inputRef?.current) {
                inputRef?.current?.dispatchEvent(
                    new Event("change", { bubbles: true })
                );
                setToChanged();
            }
        },
        [inputRef, setToChanged]
    );

    return (
        <div onBlur={emitChange} onClick={setToChanged} onKeyUp={setToChanged}>
            <select
                // HACK: To get around react resetting select element back to default value
                // as it doesn't re-render properly otherwise
                key={`${id}-${isPending}`}
                id={id}
                name={id}
                ref={inputRef}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                disabled={isPending}
                defaultValue={defaultValue}
                tabIndex={20}
            >
                <option value="not-implemented">Not Implemented</option>
                <option value="implemented">Implemented</option>
                <option value="not-applicable">Not Applicable</option>
                <option value="not-started">Not Started</option>
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
    idx,
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
                idx={idx}
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mdRef = useRef<HTMLDivElement>(null);
    const parentRef = useRef<HTMLDivElement>(null);
    const [showOutput, setShowOutput] = useState(true);
    const [currentState, setCurrentState] = useState(initialState[key]);

    const hideOutput = useMemo(
        () => () => {
            setShowOutput(false);
            textareaRef?.current?.focus();
        },
        []
    );
    const syncOutput = useMemo(
        () => async () => {
            if (mdRef?.current && textareaRef?.current) {
                setShowOutput(true);
                mdRef.current.innerHTML = await marked(
                    textareaRef?.current?.value
                );
            }
        },
        []
    );

    useEffect(() => {
        (async () => {
            if (showOutput && currentState !== initialState[key]) {
                setCurrentState(initialState[key]);
                await syncOutput();
            }
        })();
    }, [currentState, initialState]);

    useEffect(() => {
        if (textareaRef?.current) {
            textareaRef.current.addEventListener("focus", hideOutput);
            textareaRef.current.addEventListener("blur", syncOutput);
        }

        if (parentRef.current) {
            parentRef.current.addEventListener("click", hideOutput);
        }

        return () => {
            if (textareaRef?.current) {
                textareaRef.current.removeEventListener("focus", hideOutput);
                textareaRef.current.removeEventListener("blur", syncOutput);
            }

            if (parentRef.current) {
                parentRef.current.removeEventListener("click", hideOutput);
            }
        };
    }, [textareaRef, mdRef]);

    return (
        <div className="flex flex-col grow w-10/12" ref={parentRef}>
            <label
                htmlFor={key}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 my-2"
            >
                Description
            </label>
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    tabIndex={20}
                    name={key}
                    id={key}
                    className={`min-h-32 grow z-0 w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${
                        showOutput && textareaRef?.current?.value
                            ? "absolute opacity-0"
                            : ""
                    }`}
                    disabled={isPending}
                    defaultValue={initialState[key]}
                    style={{
                        height: mdRef?.current?.offsetHeight
                            ? `${mdRef?.current?.offsetHeight}px`
                            : "auto",
                    }}
                ></textarea>
                <div
                    ref={mdRef}
                    tabIndex={-1}
                    className={`min-h-32 relative z-10 md-output w-full rounded-md border border-input bg-white px-3 py-3 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${
                        showOutput && textareaRef?.current?.value
                            ? ""
                            : "scale-x-0"
                    }`}
                ></div>
            </div>
        </div>
    );
};

const SecurityRequirement = ({
    securityRequirement,
    initialState,
    isPending,
    idx,
}: SecurityRequirementProps) => {
    return (
        <li className="mb-6">
            <fieldset className="flex flex-col grow">
                <legend className="text-2xl flex flex-row items-center text-left">
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
                        idx={idx}
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
    const records: Record<string, Record<string, FormDataEntryValue>> = {};
    for (const [_key, value] of formData.entries()) {
        // Extract the id from the key to the last period
        const idx = _key.lastIndexOf(".");
        const id = _key.substring(0, idx);
        const key = _key.substring(idx + 1);
        records[id] = { ...(records?.[id] || {}), [key]: value };
    }
    for (const [id, record] of Object.entries(records)) {
        await IDB.securityRequirements?.put({
            id,
            ...record,
        } as IDBSecurityRequirement);
    }

    const statuses: Status[] = [];
    await IDB.requirements?.put({
        id: requirementId,
        bySecurityRequirementId: Object.entries(records).reduce(
            (acc, [id, record]) => {
                acc[id] = record.status;
                statuses.push(record.status as Status);
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
        const nextStatuses = await saveState(requirement.id, formData);
        setStatuses(nextStatuses);
        setInitialState(Object.fromEntries(formData.entries()));
        setLastSaved(new Date());
    }

    const debouncedSave = useMemo(
        () =>
            debounce(async (event) => {
                if (!event.target?.form) {
                    return;
                }
                const formData = new FormData(event.target.form);
                await action(null, formData);
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
                className="sticky top-36 left-full flex flex-row-reverse items-center shrink-0 w-1/4 pb-4 z-20"
                style={{ transform: "translateY(-100%)" }}
            >
                <button
                    type="submit"
                    className="shrink w-24 bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 border-b-4 border-green-700 hover:border-green-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                    disabled={isHydrating}
                    tabIndex={30}
                >
                    Save
                </button>
                {lastSaved && (
                    <span className="text-sm text-gray-500 mr-2 text-right">
                        Last saved: {lastSaved?.toLocaleTimeString()}
                    </span>
                )}
            </div>
            {Object.entries(groupings)?.map(([key, grouping], idx) => (
                <ol key={key}>
                    {grouping.map((securityRequirement) => (
                        <SecurityRequirement
                            key={securityRequirement.element_identifier}
                            securityRequirement={securityRequirement}
                            initialState={initialState}
                            isPending={isPending || isHydrating}
                            idx={idx}
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
    const [statuses, setStatuses] = useState<Status[]>([]);
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
    }, [requirement, requirementId, manifest]);

    useEffect(() => {
        async function fetchInitialState() {
            setHydrating(true);
            const ids = securityRequirements.map((s) => s.subSubRequirement);
            const idbSecurityRequirements =
                await IDB.securityRequirements.getAll(
                    IDBKeyRange.bound(ids[0], ids[ids.length - 1])
                );
            const nextStatuses: Status[] = [];
            const state = idbSecurityRequirements?.reduce(
                (acc, requirement) => {
                    acc[`${requirement.id}.status`] = requirement.status;
                    acc[`${requirement.id}.description`] =
                        requirement.description;
                    nextStatuses.push(requirement.status as Status);
                    return acc;
                },
                {}
            );
            setStatuses(nextStatuses);
            setInitialState(state);
            setHydrating(false);
        }
        fetchInitialState();
    }, [
        requirementId,
        setInitialState,
        securityRequirements,
        setStatuses,
        setHydrating,
    ]);

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

        const saveOnCtrlS = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === "s") {
                event.preventDefault();
                const form = document.forms?.[0];
                form?.requestSubmit();
            }
        };

        document.addEventListener("keydown", saveOnCtrlS);

        return () => {
            window.removeEventListener("hashchange", handleHashChange);
            document.removeEventListener("keydown", saveOnCtrlS);
        };
    }, []);

    if (!securityRequirements?.length) {
        return null;
    }

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
            <a
                href={`https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/SP_800_171_3_0_0/home?element=${requirement.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-600"
            >
                View CPRT {requirement.id}
            </a>
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
