"use client";
import { IDB } from "@/app/db";
import { useActionState } from "react";

export const ClearDB = () => {
    const action = async (prevState, formData: FormData) => {
        return new Promise(async (resolve) => {
            const confirm = window.confirm(
                "Clear the current database. Continue?"
            );
            if (!confirm) {
                return;
            }

            await IDB.securityRequirements.clear();
            await IDB.requirements.clear();

            resolve(null);
            window.location.reload();
        });
    };

    const [_, formAction, isPending] = useActionState(action, null);
    return (
        <form action={formAction}>
            <button
                type={"submit"}
                className="block px-4 py-2 text-sm text-gray-700 w-full text-left"
                disabled={isPending}
                tabIndex={-1}
            >
                Reset Database
            </button>
        </form>
    );
};
