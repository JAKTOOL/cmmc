"use client";
import { Status } from "@/app/components/status";
import { IDB, IDBRequirement, IDBSecurityRequirement } from "@/app/db";
import { useActionState, useRef } from "react";

interface ImportExportPayload {
    securityRequirements: IDBSecurityRequirement[];
    version: number;
}

export const Export = () => {
    const action = async () => {
        const idbSecurityRequirements = await IDB.securityRequirements.getAll();

        const validSecurityRequirements = idbSecurityRequirements.filter(
            (secReq) => !!(secReq.status || secReq.description)
        );

        const payload: ImportExportPayload = {
            securityRequirements: validSecurityRequirements,
            version: IDB.version,
        };

        // Create a Blob object with the text data
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });

        // Create a link element
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "nist-sp-800-171-rev-3-export.json";

        // Append the link to the body (required for Firefox)
        document.body.appendChild(link);

        // Programmatically click the link to trigger the download
        link.click();

        // Clean up and remove the link
        document.body.removeChild(link);
        return payload;
    };

    const [_, formAction, isPending] = useActionState(action, null);
    return (
        <form action={formAction}>
            <button
                type="submit"
                className="block px-4 py-2 text-sm text-gray-700 w-full text-left"
                disabled={isPending}
                tabIndex={-1}
            >
                Export Database
            </button>
        </form>
    );
};

export const Import = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const action = async (prevState, formData: FormData) => {
        try {
            return await new Promise(async (resolve, reject) => {
                const file = formData.get("file") as File;

                if (file) {
                    const reader = new FileReader();

                    reader.onload = async (event) => {
                        const payload = JSON.parse(
                            event?.target?.result as string
                        ) as ImportExportPayload;

                        if (payload.version !== IDB.version) {
                            throw new Error("Database version mismatch");
                        }

                        const confirm = window.confirm(
                            "Importing will overwrite the current database. Continue?"
                        );
                        if (!confirm) {
                            return;
                        }

                        await IDB.securityRequirements.clear();
                        await IDB.requirements.clear();

                        const requirements: Record<string, IDBRequirement> = {};

                        for (const secReq of payload.securityRequirements) {
                            const reqId = secReq.id.slice(0, 8);
                            await IDB.securityRequirements.put(secReq);
                            if (!requirements[reqId]) {
                                requirements[reqId] = {
                                    id: reqId,
                                    bySecurityRequirementId: {},
                                };
                            }
                            requirements[reqId].bySecurityRequirementId[
                                secReq.id
                            ] = secReq.status as Status;
                        }

                        for (const req of Object.values(requirements)) {
                            await IDB.requirements.put(req);
                        }

                        resolve(payload);
                    };

                    reader.readAsText(file);
                }
            });
        } finally {
            window.location.reload();
        }
    };

    const onClick = () => {
        inputRef.current?.click();
    };

    const [_, formAction, isPending] = useActionState(action, null);
    return (
        <form action={formAction}>
            <input
                id="file"
                name="file"
                type="file"
                accept="application/json"
                ref={inputRef}
                className="hidden"
                onChange={(event) => {
                    if (event?.target?.files?.length) {
                        event?.target?.form?.requestSubmit();
                    }
                }}
            />
            <button
                type={"button"}
                className="block px-4 py-2 text-sm text-gray-700 w-full text-left"
                disabled={isPending}
                tabIndex={-1}
                onClick={onClick}
            >
                Import Database
            </button>
        </form>
    );
};
