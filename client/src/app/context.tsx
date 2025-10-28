"use client";
import * as Framework from "@/api/entities/Framework";
import React, { createContext, useContext } from "react";

export const ManifestContext = createContext<Framework.Manifest>(
    Framework.manifest
);
export function ManifestProvider({
    children,
    value,
}: {
    children: React.ReactNode;
    value: Framework.Manifest;
}) {
    return (
        <ManifestContext.Provider value={value}>
            {children}
        </ManifestContext.Provider>
    );
}

export function useManifestContext() {
    return useContext(ManifestContext);
}

export default function ManifestComponent({
    children,
}: {
    children: React.ReactNode;
}) {
    const manifest = Framework.manifest;
    return <ManifestProvider value={manifest}>{children}</ManifestProvider>;
}
