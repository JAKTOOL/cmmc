"use client";
import { useManifestContext } from "@/app/context/manifest";
import { toPath, useRevisionContext } from "@/app/context/revision";
import Link from "next/link";
import { TotalScore } from "./score";

interface BreadcrumbLink {
    href: string;
    text: string;
    disabled?: boolean;
}

interface BreadcrumbsProps {
    familyId?: string;
    requirementId?: string;
}

export const Breadcrumbs = ({ familyId, requirementId }: BreadcrumbsProps) => {
    const manifest = useManifestContext();
    const revision = useRevisionContext();
    const path = toPath(revision);

    console.log(revision, path);

    const links: BreadcrumbLink[] = [
        {
            href: path,
            text: "Families",
        },
    ];

    if (familyId) {
        const family = manifest?.families?.byId[familyId];
        links.push({
            href: `${path}/family/${familyId}`,
            text: `${family.element_identifier}: ${family.title}`,
        });
    } else if (requirementId) {
        const requirement = manifest?.requirements?.byId[requirementId];
        const family = manifest?.families?.byId[requirement.family];
        links.push({
            href: `${path}/family/${requirement.family}`,
            text: `${family.element_identifier}: ${family.title}`,
        });
        links.push({
            href: `${path}/requirement/${requirementId}`,
            text: `${requirement.element_identifier}: ${requirement.title}`,
            disabled: true,
        });
    }

    return (
        <aside className="flex flex-wrap justify-between items-center w-full mx-auto">
            <div>
                {links.map((link, index) => (
                    <span key={index}>
                        <Link
                            className="text-sm text-gray-600"
                            href={link.href}
                            aria-disabled={link.disabled}
                            tabIndex={60}
                        >
                            {link.text}
                        </Link>
                        {index < links.length - 1 && (
                            <span className="text-sm mx-2"> &gt; </span>
                        )}
                    </span>
                ))}
            </div>
            <TotalScore />
        </aside>
    );
};
