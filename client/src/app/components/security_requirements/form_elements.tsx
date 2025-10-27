"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { Status, StatusState } from "../status";

export interface SecurityRequirementProps {
    securityRequirement: ElementWrapper;
    initialState: Record<string, string>;
    isPending: boolean;
    idx?: number;
}

export const SelectStatus = ({
    id,
    defaultValue,
    isPending,
}: {
    id: string;
    defaultValue: string;
    isPending: boolean;
}) => {
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

export const SecurityRequirementSelect = ({
    securityRequirement,
    initialState,
    isPending,
}: SecurityRequirementProps) => {
    const key = `${securityRequirement.subSubRequirement}.status`;
    return (
        <div className="flex flex-col md:mr-2 lg:mr-4" key={key}>
            <label
                htmlFor={key}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 my-2"
            >
                Status
            </label>
            <SelectStatus
                id={key}
                isPending={isPending}
                defaultValue={initialState[key]}
            />
        </div>
    );
};

export const SecurityRequirementNote = ({
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
        <div className="flex flex-col grow w-full lg:w-10/12" ref={parentRef}>
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
                            : "hidden"
                    }`}
                ></div>
            </div>
        </div>
    );
};

export const SecurityRequirement = ({
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
                            ] as Status
                        }
                    />
                    <h4 id={securityRequirement.subSubRequirement}>
                        {securityRequirement.subSubRequirement}
                    </h4>
                </legend>
                <p className="text-lg my-2">{securityRequirement.text}</p>
                <div className="flex flex-col md:flex-row">
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
