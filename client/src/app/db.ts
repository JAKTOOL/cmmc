"use client";
import { Status } from "@/app/components/status";

let loader: Promise<IDBDatabase> | undefined;
if (typeof window !== "undefined") {
    const request = window?.indexedDB?.open("800_171_r3", 1);

    loader = new Promise((resolve, reject) => {
        request.onerror = (event) => {
            console.error("Can't use IndexDB");
            reject(event);
        };
        request.onsuccess = (event) => {
            const db = event.target?.result as IDBDatabase;

            resolve(db);
        };

        request.onupgradeneeded = function (event) {
            const db = event.target?.result as IDBDatabase;

            const securityRequirementsStore = db.createObjectStore(
                "security_requirements",
                {
                    keyPath: "id",
                }
            );

            securityRequirementsStore.createIndex("status", "status", {
                unique: false,
            });
            securityRequirementsStore.createIndex(
                "description",
                "description",
                {
                    unique: false,
                }
            );

            const requirementsStore = db.createObjectStore("requirements", {
                keyPath: "id",
            });

            requirementsStore.createIndex(
                "security_requirements",
                "security_requirements",
                {
                    unique: false,
                }
            );
        };
    });
}

export const getDB = function () {
    return loader || Promise.reject("Can't use IndexDB");
};

interface IDBSecurityRequirement {
    id: string;
    status: string;
    description: string;
}

interface IDBRequirement {
    id: string;
    bySecurityRequirementId: Record<string, Status>;
}

enum Permission {
    READONLY = "readonly",
    READWRITE = "readwrite",
}

export const getStore = async (table: string, permission: Permission) => {
    const db = await getDB();
    return db.transaction(table, permission).objectStore(table);
};

export const getAll =
    <T>(table: string) =>
    async (
        query: IDBKeyRange | IDBValidKey | null = null,
        count?: number
    ): Promise<T[]> => {
        const store = await getStore(table, Permission.READONLY);

        const request = store.getAll(query, count);

        return new Promise<T[]>((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result as T[]);
            };
            request.onerror = () => {
                reject();
            };
        });
    };

export class IDB {
    static getSecurityRequirements = getAll<IDBSecurityRequirement>(
        "security_requirements"
    );
    static getRequirements = getAll<IDBRequirement>("requirements");

    static getWriteableSecurityRequirementsStore = async () =>
        getStore("security_requirements", Permission.READWRITE);
    static getWriteableRequirementsStore = async () =>
        getStore("requirements", Permission.READWRITE);
}
