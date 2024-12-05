"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import { useManifestContext } from "@/app/context";
import { db } from "@/app/db";
import Link from "next/link";

import { useActionState, useMemo, useRef, useState } from "react";

interface Requirement {
    element_identifier: string;
    subSubRequirement: string;
    text: string;
    subRequirement: string;
}

interface SecurityRequirementProps {
    requirement: Requirement;
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
    requirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${requirement.element_identifier}.status`;
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
    requirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${requirement.element_identifier}.description`;
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
    requirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    return (
        <li>
            <fieldset className="flex flex-col grow">
                <legend className="text-2xl">
                    {requirement.subSubRequirement}
                </legend>
                <p className="text-lg">{requirement.text}</p>
                <div className="flex flex-row">
                    <SecurityRequirementSelect
                        requirement={requirement}
                        initialState={initialState}
                        isPending={isPending}
                    />
                    <SecurityRequirementNote
                        requirement={requirement}
                        initialState={initialState}
                        isPending={isPending}
                    />
                </div>
            </fieldset>
        </li>
    );
};

export const SecurityForm = ({
    requirements,
    initialState,
    setInitialState,
    groupings,
}) => {
    async function action(prevState, formData) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        setInitialState(Object.fromEntries(formData.entries()));
    }
    const [_, formAction, isPending] = useActionState(action, initialState);

    return (
        <>
            <form id={requirements[0].requirement} action={formAction}>
                <div className="flex flex-row justify-end">
                    <button
                        type="submit"
                        className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                        disabled={isPending}
                    >
                        Save
                    </button>
                </div>
                {Object.entries(groupings)?.map(([key, grouping]) => (
                    <ol key={key}>
                        {grouping.map((requirement) => (
                            <SecurityRequirement
                                key={requirement.element_identifier}
                                requirement={requirement}
                                initialState={initialState}
                                isPending={isPending}
                            />
                        ))}
                    </ol>
                ))}
            </form>
        </>
    );
};

export const SecurityRequirements = ({ requirementId }) => {
    const [initialState, setInitialState] = useState({});
    const manifest = useManifestContext();
    const requirements = useMemo(() => {
        return (
            manifest?.securityRequirements.byRequirements[requirementId] || []
        );
    }, [manifest, requirementId]);
    const groupings = useMemo(() => {
        const groupings: Record<string, ElementWrapper[]> = {};
        for (const requirement of requirements) {
            if (!requirement.text) {
                continue;
            }
            if (!groupings[requirement.subRequirement]) {
                groupings[requirement.subRequirement] = [];
            }
            groupings[requirement.subRequirement].push(requirement);
        }
        return groupings;
    }, [requirements]);

    if (!requirements?.length) {
        return null;
    }

    db.then((db) => {
        console.log(db);
    });

    return (
        <>
            <Link
                className="text-base italic"
                href={`/r3/family/${requirements[0].family}`}
            >
                Back to {requirements[0].family}
            </Link>
            <br />
            <h3 className="text-3xl">
                Security Requirements for {requirements[0].requirement}
            </h3>
            <p className="text-base">
                {manifest.discussions.byRequirements[requirementId]?.[0]?.text}
            </p>
            <section className="w-full">
                <SecurityForm
                    requirements={requirements}
                    groupings={groupings}
                    initialState={initialState}
                    setInitialState={setInitialState}
                />
            </section>
        </>
    );
};
