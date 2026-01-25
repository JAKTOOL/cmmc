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

export const toPath = (revision: Revision): string => {
    switch (revision) {
        case Revision.V2:
            return "/r2";
        default:
            return "/r3";
    }
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

export function RevisionV2Component({
    children,
}: {
    children: React.ReactNode;
}) {
    return <RevisionProvider value={Revision.V2}>{children}</RevisionProvider>;
}

export function RevisionV3Component({
    children,
}: {
    children: React.ReactNode;
}) {
    return <RevisionProvider value={Revision.V3}>{children}</RevisionProvider>;
}
