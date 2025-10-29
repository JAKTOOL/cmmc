"use client";
import { ContentNavigation } from "../content_navigation";
import { Evidence } from "./evidence";

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
        <>
            <ContentNavigation previous={prev} next={next} />
            <div className="sticky top-36 left-full flex flex-row-reverse items-center shrink-0 w-1/4 pb-4 z-20 -translate-y-full">
                <button
                    type="submit"
                    className="shrink w-24 bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 border-b-4 border-green-700 hover:border-green-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                    disabled={isHydrating}
                    tabIndex={30}
                    form={requirement.element_identifier}
                >
                    Save
                </button>
                {lastSaved && (
                    <span className="text-sm text-gray-500 mr-2 text-right hidden md:block">
                        Last saved: {lastSaved?.toLocaleTimeString()}
                    </span>
                )}
            </div>
            <form
                id={requirement.element_identifier}
                action={formAction}
                onChange={debouncedSave}
                className="basis-full"
            >
                <Evidence requirementId={requirement.element_identifier} />
                {children}
            </form>
        </>
    );
};
