"use client";
import * as Framework from "@/api/entities/Framework";
import React, { createContext, useContext } from "react";

export const ManifestContext = createContext<Framework.Manifest>(
    Framework.manifestV3,
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

export function ManifestV3Component({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ManifestProvider value={Framework.manifestV3}>
            {children}
        </ManifestProvider>
    );
}
export function ManifestV2Component({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ManifestProvider value={Framework.manifestV2}>
            {children}
        </ManifestProvider>
    );
}
