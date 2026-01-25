"use client";
import React, { createContext, useContext } from "react";

export enum Revision {
    V2 = "V2",
    V3 = "V3",
}

export enum DocRevision {
    V2 = "SP_800_171_2_0_0",
    V3 = "SP_800_171_3_0_0",
}

export const useRevision = (): Revision => {
    return Revision.V3;
};

export const RevisionContext = createContext<Revision>(Revision.V3);
export function RevisionProvider({
    children,
    value,
}: {
    children: React.ReactNode;
    value: Revision;
}) {
    return (
        <RevisionContext.Provider value={value}>
            {children}
        </RevisionContext.Provider>
    );
}

export function useRevisionContext() {
    return useContext(RevisionContext);
}

export default function RevisionComponent({
    children,
    value = Revision.V3,
}: {
    children: React.ReactNode;
    value: Revision;
}) {
    return <RevisionProvider value={value}>{children}</RevisionProvider>;
}
