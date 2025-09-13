"use client";
import { IDB, IDBRequirement } from "@/app/db";
import { useEffect, useState } from "react";

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
