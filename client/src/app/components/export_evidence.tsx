"use client";
import { IDB, IDBEvidence } from "@/app/db";
import { useActionState } from "react";

const download = async (artifact: IDBEvidence) => {
    const file = new File([artifact.data], artifact.filename, {
        type: artifact.type,
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `${artifact.requirement_id}-${artifact.filename}`;
    document.body.appendChild(link);
    link.click();

    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
};

export const ExportEvidence = () => {
    const onClick = async () => {
        if (
            window.confirm(
                "This will download all uploaded evidence. Continue?"
            )
        ) {
            const evidence = await IDB.evidence.getAll();
            await Promise.all(
                evidence
                    .filter((artifact) => artifact.type !== "url")
                    .map(download)
            );
        }
    };

    const [_, formAction, isPending] = useActionState(onClick, null);
    return (
        <form action={formAction}>
            <button
                type="submit"
                className="block px-4 py-2 text-sm text-gray-700 w-full text-left"
                disabled={isPending}
                tabIndex={-1}
            >
                Download Evidence
            </button>
        </form>
    );
};
