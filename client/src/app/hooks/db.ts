"use client";
import { IDB, IDBRequirement, IDBSecurityRequirement } from "@/app/db";
import { useEffect, useReducer, useState } from "react";

export const useDBRequirements = () => {
    const [dbRequirements, setDBRequirements] = useState(
        undefined as IDBRequirement[] | undefined
    );

    useEffect(() => {
        async function fetchInitialState() {
            const reqs = await IDB.requirements.getAll();
            setDBRequirements(reqs);
        }
        fetchInitialState();
    }, []);

    return dbRequirements;
};
export const useDBSecurityRequirements = () => {
    const [dbRequirements, setDBRequirements] = useState(
        undefined as IDBSecurityRequirement[] | undefined
    );

    useEffect(() => {
        async function fetchInitialState() {
            const reqs = await IDB.securityRequirements.getAll();
            setDBRequirements(reqs);
        }
        fetchInitialState();
    }, []);

    return dbRequirements;
};

const initialState = { id: crypto.randomUUID() };
export function transactionReducer(state, action) {
    switch (action.type) {
        default:
            return { id: crypto.randomUUID() };
    }
}

export const useTransaction = () => {
    return useReducer(transactionReducer, initialState);
};
