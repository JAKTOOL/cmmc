"use client";
import { Status } from "@/app/components/status";
import { useManifestContext } from "@/app/context";
import { IDB, IDBSecurityRequirement } from "@/app/db";
import { useActionState } from "react";

export const POAM = () => {
    const manifest = useManifestContext();

    const onClick = async () => {
        const idbSecurityRequirements = await IDB.securityRequirements.getAll();
        const storedSecRequirements = idbSecurityRequirements.reduce(
            (acc, cur) => {
                acc[cur.id] = cur;
                return acc;
            },
            {} as Record<string, IDBSecurityRequirement>
        );

        const header = [
            "Weaknesses",
            "Description",
            "Responsible Office/Organization",
            "Resource Estimate",
            "Scheduled Completion Date",
            "Changes to Milestone",
            "How was the weakness identified?",
            "Status",
        ];

        const body = [];

        for (const secReq of manifest.securityRequirements.elements) {
            const element = storedSecRequirements[secReq.subSubRequirement];
            if (!element || element.status !== Status.NOT_IMPLEMENTED) {
                continue;
            }
            body.push([
                secReq.element_identifier,
                secReq.text.replaceAll(",", ""),
                "",
                "",
                "",
                "",
                "",
                "",
            ]);
        }

        const payload = [header.join(",")].concat(
            body.map((row) => row.join(","))
        );

        // Create a Blob object with the text data
        const blob = new Blob([payload.join("\n\n")], {
            type: "text/csv",
        });

        // Create a link element
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "nist-sp-800-171-rev-3-poam.csv";

        // Append the link to the body (required for Firefox)
        document.body.appendChild(link);

        // Programmatically click the link to trigger the download
        link.click();

        // Clean up and remove the link
        document.body.removeChild(link);
        return payload;
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
                Generate POAM
            </button>
        </form>
    );
};
