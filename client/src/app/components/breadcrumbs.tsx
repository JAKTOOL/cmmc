"use client";
import { useManifestContext } from "@/app/context";
import { useScore } from "@/app/hooks/score";
import { useGlobalStatus } from "@/app/hooks/status";
import Link from "next/link";

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
    const score = useScore();
    const groupStatus = useGlobalStatus();

    console.log("familyState", groupStatus);
    const links: BreadcrumbLink[] = [
        {
            href: "/r3",
            text: "Families",
        },
    ];

    if (familyId) {
        const family = manifest?.families?.byId[familyId];
        links.push({
            href: `/r3/family/${familyId}`,
            text: `${family.element_identifier}: ${family.title}`,
        });
    } else if (requirementId) {
        const requirement = manifest?.requirements?.byId[requirementId];
        const family = manifest?.families?.byId[requirement.family];
        links.push({
            href: `/r3/family/${requirement.family}`,
            text: `${family.element_identifier}: ${family.title}`,
        });
        links.push({
            href: `/r3/requirement/${requirementId}`,
            text: `${requirement.element_identifier}: ${requirement.title}`,
            disabled: true,
        });
    }

    return (
        <aside>
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
        </aside>
    );
};
