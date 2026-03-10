"use client";
import { IDBEvidenceV2 } from "@/app/db";

export const toFSName = (artifact: IDBEvidenceV2) =>
    `${artifact.id}-${artifact.filename}`;
