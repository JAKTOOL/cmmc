"use client";

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

export const getDB = loader;
