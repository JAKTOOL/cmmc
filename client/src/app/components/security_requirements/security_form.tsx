"use client";
import { useActionState, useMemo, useState } from "react";
import { Form, debounce, saveState } from "./form";
import { SecurityRequirement } from "./form_elements";

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
        <Form
            debouncedSave={debouncedSave}
            formAction={formAction}
            isHydrating={isHydrating}
            lastSaved={lastSaved}
            next={next}
            prev={prev}
            requirement={requirement}
        >
            <>
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
            </>
        </Form>
    );
};
