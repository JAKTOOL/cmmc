"use client";
import * as Framework from "@/api/entities/Framework";
import React, { createContext, use, useContext } from "react";

export const ManifestContext =
    createContext<Promise<Framework.Manifest> | null>(null);
export function ManifestProvider({
    children,
    value,
}: {
    children: React.ReactNode;
    value: Promise<Framework.Manifest> | null;
}) {
    return (
        <ManifestContext.Provider value={value}>
            {children}
        </ManifestContext.Provider>
    );
}

export function useManifestContextPromise() {
    const context = useContext(ManifestContext);
    if (!context) {
        throw new Error(
            "useManifestContext must be used within a ManifestProvider"
        );
    }
    return context;
}

export function useManifestContext() {
    return use(useManifestContextPromise());
}

export default function ManifestComponent({
    children,
}: {
    children: React.ReactNode;
}) {
    const manifest = Framework.Manifest.init();
    return <ManifestProvider value={manifest}>{children}</ManifestProvider>;
}
