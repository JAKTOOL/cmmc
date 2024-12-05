"use client";
import { useManifestContext } from "@/app/context";
import { getDB } from "@/app/db";
import { useActionState } from "react";

export const Markdown = () => {
    const manifest = useManifestContext();

    const onClick = async () => {
        const db = await getDB;
        const store = db
            .transaction("requirements", "readonly")
            .objectStore("requirements");

        const request = store.getAll();
        request.onsuccess = () => {};
        request.onerror = () => {};
    };

    const [_, __, isPending] = useActionState(onClick, null);
    return (
        <form>
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
