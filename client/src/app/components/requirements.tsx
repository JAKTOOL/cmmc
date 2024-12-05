"use client";
import { useManifestContext } from "@/app/context";
import Link from "next/link";

export const Requirements = ({ familyId }) => {
    const manifest = useManifestContext();
    const requirements = manifest.requirements.byFamily[familyId];
    if (!requirements?.length) {
        return null;
    }

    return (
        <>
            <Link href={`/r3`}>Back to Families</Link>
            <h2 className="text-4xl">
                Requirements for {requirements[0].family}{" "}
            </h2>
            <ol>
                {requirements?.map((requirement) => (
                    <li
                        className="flex items-center mb-2"
                        key={requirement.element_identifier}
                    >
                        <Link
                            className="flex"
                            href={`/r3/requirement/${requirement.element_identifier}`}
                        >
                            <h3 className="text-2xl">
                                {requirement.element_identifier}:{" "}
                                {requirement.title}
                            </h3>
                        </Link>
                    </li>
                ))}
                <br />
            </ol>
            <br />
        </>
    );
};
