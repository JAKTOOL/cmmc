"use client";
import { useManifestContext } from "@/app/context";
import Link from "next/link";
export const Families = () => {
    const manifest = useManifestContext();
    const families = manifest?.families?.elements;
    if (!families?.length) {
        return null;
    }

    return (
        <>
            <h2 className="text-4xl">Families</h2>
            <ul>
                {families.map((family) => (
                    <li className="flex mb-2" key={family.element_identifier}>
                        <Link
                            className="flex flex-col"
                            href={`/r3/family/${family.element_identifier}`}
                        >
                            <h3 className="text-2xl flex flex-row">
                                <span className="flex flex-col mr-2">
                                    {family.element_identifier}:
                                </span>
                                <span className="flex flex-col">
                                    {family.title}
                                </span>
                            </h3>
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
};
