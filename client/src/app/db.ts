"use client";
import { Status } from "@/app/components/status";
export const version = 2;
let loader: Promise<IDBDatabase> | undefined;

enum Table {
    SECURITY_REQUIREMENTS = "security_requirements",
    REQUIREMENTS = "requirements",
    EVIDENCE = "evidence",
}

const migrations = {
    "1": (db: IDBDatabase) => {
        if (!db.objectStoreNames.contains(Table.SECURITY_REQUIREMENTS)) {
            const securityRequirementsStore = db.createObjectStore(
                Table.SECURITY_REQUIREMENTS,
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
        }

        if (!db.objectStoreNames.contains(Table.REQUIREMENTS)) {
            const requirementsStore = db.createObjectStore(Table.REQUIREMENTS, {
                keyPath: "id",
            });

            requirementsStore.createIndex(
                "security_requirements",
                "security_requirements",
                {
                    unique: false,
                }
            );
        }
    },
    "2": (db: IDBDatabase) => {
        if (!db.objectStoreNames.contains(Table.EVIDENCE)) {
            const evidence = db.createObjectStore(Table.EVIDENCE, {
                keyPath: "uuid",
            });
            evidence.createIndex("requirement_id", "requirement_id", {
                unique: false,
            });
            evidence.createIndex("filename", "filename", {
                unique: false,
            });
            evidence.createIndex("data", "data", {
                unique: false,
            });
        }
    },
};

if (typeof window !== "undefined") {
    const request = window?.indexedDB?.open("800_171_r3", version);

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

            for (let v = 1; v <= version; v++) {
                migrations?.[`${v}`]?.(db);
            }
        };
    });
}

export const getDB = function () {
    return loader || Promise.reject("Can't use IndexDB");
};

export interface IDBSecurityRequirement {
    id: string;
    status: string;
    description: string;
}

export interface IDBRequirement {
    id: string;
    bySecurityRequirementId: Record<string, Status>;
}

export interface IDBEvidence {
    uuid: string;
    requirement_id: string;
    filename: string;
    data: ArrayBuffer;
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
export const put =
    <T>(table: string) =>
    async (data: T): Promise<T[]> => {
        const store = await getStore(table, Permission.READWRITE);
        return new Promise<T[]>((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => {
                resolve(request.result as T[]);
            };
            request.onerror = () => {
                reject();
            };
        });
    };

export const clear = (table: string) => async (): Promise<boolean> => {
    const store = await getStore(table, Permission.READWRITE);
    return new Promise<boolean>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => {
            resolve(true);
        };
        request.onerror = () => {
            reject(false);
        };
    });
};

class StoreWrapper<T> {
    public table: Table;
    getAll: (
        query?: IDBKeyRange | IDBValidKey | null,
        count?: number
    ) => Promise<T[]>;
    put: (data: T) => Promise<T[]>;
    clear: () => Promise<boolean>;
    store: (permission: Permission) => Promise<IDBObjectStore>;

    constructor(table: Table) {
        this.table = table;
        this.getAll = getAll<T>(table);
        this.put = put<T>(table);
        this.clear = clear(table);
        this.store = (permission: Permission = Permission.READONLY) =>
            getStore(table, permission);
    }
}

export class IDB {
    static requirements = new StoreWrapper<IDBRequirement>(Table.REQUIREMENTS);
    static securityRequirements = new StoreWrapper<IDBSecurityRequirement>(
        Table.SECURITY_REQUIREMENTS
    );

    static version = version;
}
