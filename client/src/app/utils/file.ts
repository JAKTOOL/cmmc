"use client";
import { IDBEvidenceV2 } from "@/app/db";

export const toFSName = (artifact: IDBEvidenceV2) =>
    `${artifact.id}-${artifact.filename}`;

export enum HashType {
    SHA256 = "sha256",
    SHA1 = "sha1",
    UUID = "uuid",
}

export const hashType = (hash: string) => {
    if (hash.includes("-")) {
        return HashType.UUID; // Legacy
    }

    if (hash.length === 40) {
        return HashType.SHA1; // Legacy
    }

    return HashType.SHA256;
};

export const isImage = (type: string) => {
    switch (type) {
        case "image/png":
        case "image/gif":
        case "image/svg+xml":
        case "image/jpeg":
        case "image/webp":
            return true;
        default:
            return false;
    }
};

export const embeddable = (artifact: IDBEvidenceV2) => isImage(artifact.type);

const isText = (type: string) => {
    switch (type) {
        case "text/plain":
        case "text/javascript":
        case "application/json":
        case "text/css":
        case "text/html":
        case "text/xml":
            return true;
        default:
            return false;
    }
};

export const snippetable = (artifact: IDBEvidenceV2) => isText(artifact.type);
