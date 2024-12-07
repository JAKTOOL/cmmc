"use client";
import { Status } from "@/app/components/status";
import { useManifestContext } from "@/app/context";
import { getDB } from "@/app/db";
import { useActionState } from "react";

const toStatus = (status?: Status) => {
    switch (status) {
        case Status.IMPLEMENTED:
            return "🟢 Implemented";
        case Status.NOT_IMPLEMENTED:
            return "🔴 Not Implemented";
        case Status.NOT_APPLICABLE:
            return "⚫ Not Applicable";
        default:
            return "⚪ Unknown";
    }
};

export const Markdown = () => {
    const manifest = useManifestContext();

    const onClick = async () => {
        const db = await getDB;
        const store = db
            .transaction("security_requirements", "readonly")
            .objectStore("security_requirements");

        const request = store.getAll();

        await new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const storedSecRequirements = request.result.reduce(
                    (acc, cur) => {
                        acc[cur.id] = cur;
                        return acc;
                    },
                    {}
                );

                const payload = ["# NIST SP 800-171 Rev 3 Report"];

                for (const family of manifest.families.elements) {
                    payload.push(
                        `## ${family.element_identifier}: ${family.title}`
                    );

                    for (const requirement of manifest.requirements.byFamily[
                        family.id
                    ]) {
                        payload.push(
                            `### ${requirement.element_identifier}: ${requirement.title}`
                        );

                        for (const secReq of manifest.securityRequirements
                            .byRequirements[requirement.id]) {
                            payload.push(`#### ${secReq.subSubRequirement}`);
                            payload.push(`> ${secReq.text}`);

                            const stored =
                                storedSecRequirements[secReq.subSubRequirement];
                            if (stored) {
                                payload.push(`**${toStatus(stored.status)}**`);
                                payload.push(`${stored.description}`);
                            } else {
                                payload.push(
                                    `**${toStatus()} [${
                                        secReq.subSubRequirement
                                    }](${
                                        window.location.origin
                                    }/r3/requirement/${secReq.requirement}#${
                                        secReq.subSubRequirement
                                    })**`
                                );
                            }
                        }
                    }
                }

                // Create a Blob object with the text data
                const blob = new Blob([payload.join("\n\n")], {
                    type: "text/plain",
                });

                // Create a link element
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = "nist-sp-800-171-rev-3-report.md";

                // Append the link to the body (required for Firefox)
                document.body.appendChild(link);

                // Programmatically click the link to trigger the download
                link.click();

                // Clean up and remove the link
                document.body.removeChild(link);
                resolve(payload);
            };
            request.onerror = () => {
                reject();
            };
        });
    };

    const [_, formAction, isPending] = useActionState(onClick, null);
    return (
        <form action={formAction}>
            <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none"
                disabled={isPending}
            >
                Generate Markdown
            </button>
        </form>
    );
};
