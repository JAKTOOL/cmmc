"use client";
import { IDB, IDBSecurityRequirement } from "@/app/db";
import { ContentNavigation } from "../content_navigation";
import { Status } from "../status";

export const saveState = async (requirementId: string, formData: FormData) => {
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

export function debounce(func, delay) {
    let timeoutId: NodeJS.Timeout | undefined;
    return function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export const Form = ({
    children,
    debouncedSave,
    formAction,
    isHydrating,
    lastSaved,
    next,
    prev,
    requirement,
}) => {
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
            {children}
        </form>
    );
};
