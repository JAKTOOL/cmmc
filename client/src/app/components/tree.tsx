"use client";
import type { ElementWrapper, Manifest } from "@/api/entities/Framework";
import { useManifestContext } from "@/app/context";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { FamilyStatus, useFamilyStatus } from "../hooks/status";
import { StatusState } from "./status";

export const Dropdown = ({ isOpen }: { isOpen: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}
    >
        <path
            fill="#fff"
            fillRule="evenodd"
            d="M12.707 14.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 1.414-1.414L12 12.586l4.293-4.293a1 1 0 1 1 1.414 1.414z"
            clipRule="evenodd"
        />
    </svg>
);

export const FamilyBranch = ({
    family,
    manifest,
}: {
    family: ElementWrapper;
    manifest: Manifest;
}) => {
    const familyStatus = useFamilyStatus(family.element_identifier);
    const [isOpen, setOpen] = useState(false);
    return (
        <li className="mb-1" key={family.element_identifier}>
            <div className="flex items-center">
                <StatusState status={familyStatus?.status} size="sm" />
                <Link
                    className="grow"
                    href={`/r3/family/${family.element_identifier}`}
                >
                    {family.element_identifier}: {family.title}
                </Link>
                <button
                    className="ml-2 w-[24px] h-[24px]"
                    onClick={() => setOpen(!isOpen)}
                >
                    <Dropdown isOpen={isOpen} />
                </button>
            </div>
            {isOpen && (
                <RequirementsLeaf
                    family={family}
                    manifest={manifest}
                    familyStatus={familyStatus}
                />
            )}
        </li>
    );
};

export const RequirementsLeaf = ({
    family,
    manifest,
    familyStatus,
}: {
    family: ElementWrapper;
    manifest: Manifest;
    familyStatus?: FamilyStatus;
}) => {
    const requirements =
        manifest.requirements.byFamily[family.element_identifier];
    return (
        <ol className="ml-4 mt-2 mb-4 flex flex-col">
            {requirements.map((requirement) => (
                <RequirementLeaf
                    key={requirement.element_identifier}
                    requirement={requirement}
                    familyStatus={familyStatus}
                />
            ))}
        </ol>
    );
};
export const RequirementLeaf = ({
    requirement,
    familyStatus,
}: {
    requirement: ElementWrapper;
    familyStatus?: FamilyStatus;
}) => {
    const status = familyStatus?.requirementStatus(
        requirement.element_identifier
    );
    const className = !requirement.title ? "line-through" : "";
    return (
        <li
            className={`mb-1 text-wrap ${className}`}
            key={requirement.element_identifier}
        >
            <StatusState status={status} size="xs" />
            <Link href={`/r3/requirement/${requirement.element_identifier}`}>
                {requirement.element_identifier}:{" "}
                {requirement.title || "Withdrawn"}
            </Link>
        </li>
    );
};

export const Tree = ({
    isOpen,
    setOpen,
}: {
    isOpen: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
    const manifest = useManifestContext();
    const families = manifest.families.elements;

    return (
        <div
            id="drawer-contact"
            className={`fixed top-0 right-0 z-40 h-screen p-4 overflow-y-auto transition-transform md:border-l border-gray-600 ${
                !isOpen ? "translate-x-full" : ""
            } w-full md:max-w-sm bg-gray-900 text-gray-100`}
            tabIndex={-1}
            aria-labelledby="drawer-contact-label"
        >
            <h5
                id="drawer-left-label"
                className="inline-flex items-center mb-4 text-base font-semibold text-gray-500 dark:text-gray-400"
            >
                Overview
            </h5>
            <button
                type="button"
                data-drawer-hide="drawer-left-example"
                aria-controls="drawer-left-example"
                className="text-gray-400 bg-transparent rounded-lg text-sm w-8 h-8 absolute top-2.5 end-2.5 inline-flex items-center justify-center hover:bg-gray-600 hover:text-white"
                onClick={() => setOpen(false)}
            >
                <svg
                    className="w-3 h-3"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                >
                    <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                </svg>
                <span className="sr-only">Close menu</span>
            </button>
            <ol className="flex flex-col">
                {families.map((family) => (
                    <FamilyBranch
                        key={family.element_identifier}
                        family={family}
                        manifest={manifest}
                    />
                ))}
            </ol>
        </div>
    );
};
