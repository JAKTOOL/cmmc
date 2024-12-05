"use client";
import { useManifestContext } from "@/app/context";

export const Discussions = ({ requirementId }) => {
    const manifest = useManifestContext();
    const discussion = manifest?.discussions?.byRequirements[requirementId];
    if (!discussion?.length) {
        return null;
    }

    return (
        <>
            {discussion.map((discussion) => (
                <p
                    className="text-base flex flex-col flex-1"
                    key={discussion.element_identifier}
                >
                    {discussion.text}
                </p>
            ))}
        </>
    );
};
