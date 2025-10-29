import { IDB, IDBEvidence } from "@/app/db";
import {
    ChangeEvent,
    Dispatch,
    SetStateAction,
    useEffect,
    useState,
} from "react";

const toBuffer = (file: File) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as ArrayBuffer);
        fr.onerror = (err) => reject(err);
        fr.readAsArrayBuffer(file);
    });

const toDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = (err) => reject(err);
        fr.readAsDataURL(file);
    });

const IconFileDownload = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        className="h-4 mr-1"
    >
        <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M20 12.5V6.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C17.72 2 16.88 2 15.2 2H8.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C4 4.28 4 5.12 4 6.8v10.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C6.28 22 7.12 22 8.8 22h3.7m2.5-3 3 3m0 0 3-3m-3 3v-6"
        />
    </svg>
);
const IconLink = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        className="h-4 mr-1"
    >
        <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        />
    </svg>
);
const IconExternal = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        className="h-4 mr-1"
    >
        <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 9V3m0 0h-6m6 0-8 8m-3-6H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C3 7.28 3 8.12 3 9.8v6.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C5.28 21 6.12 21 7.8 21h6.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C19 18.72 19 17.88 19 16.2V14"
        />
    </svg>
);

export const Files = ({
    requirementId,
    setUploading,
    uploading,
}: {
    requirementId: string;
    setUploading: Dispatch<SetStateAction<boolean>>;
    uploading: boolean;
}) => {
    const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
        setUploading(true);
        if (!e?.target?.files) {
            return;
        }
        for (const file of e.target.files) {
            const data = await toBuffer(file);
            const evidence: IDBEvidence = {
                uuid: window.crypto.randomUUID(),
                filename: file.name,
                type: file.type,
                data,
                requirement_id: requirementId,
            };
            await IDB.evidence.put(evidence);
        }
        setUploading(false);
    };

    return (
        <label
            htmlFor="evidence"
            className="flex flex-col items-center justify-center border border-gray-200 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
        >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg
                    className="w-8 h-8 mb-4 text-gray-500"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 20 16"
                >
                    <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                    />
                </svg>

                <p className="mb-2 text-sm text-gray-500 p-2">
                    Click or drop evidence for {requirementId}
                </p>
            </div>
            <input
                id="evidence"
                type="file"
                className="hidden"
                multiple={true}
                onChange={onChange}
                disabled={uploading}
            />
        </label>
    );
};

const Badge = ({ children, onDelete }) => {
    return (
        <span className="flex shrink items-center max-h-[20px] bg-blue-100 text-blue-800 border border-blue-200 text-xs font-medium me-2 mb-2 px-2.5 py-0.5 rounded-sm">
            {children}
            <button onClick={onDelete} className="pl-2">
                <svg
                    className="w-2 h-2"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                >
                    <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                </svg>
            </button>
        </span>
    );
};

export const FileBadge = ({ artifact }: { artifact: IDBEvidence }) => {
    const viewFile = async () => {
        const file = new File([artifact.data], artifact.filename, {
            type: artifact.type,
        });
        const url = await toDataURL(file);

        Object.assign(document.createElement("a"), {
            target: "_blank",
            rel: "noopener noreferrer",
            href: url,
        }).click();
    };

    return (
        <button
            className="border-r border-blue-200 pr-2 flex"
            title={`${artifact.data.byteLength} bytes | ${artifact.type}`}
            onClick={viewFile}
        >
            <IconFileDownload />
            <span>{artifact.filename}</span>
        </button>
    );
};
export const LinkBadge = ({ artifact }: { artifact: IDBEvidence }) => {
    const url = new TextDecoder().decode(artifact.data);

    const onClick = async () => {
        Object.assign(document.createElement("a"), {
            target: "_blank",
            rel: "noopener noreferrer",
            href: url,
        }).click();
    };

    return (
        <button
            className="border-r border-blue-200 pr-2 flex"
            title={`${url}`}
            onClick={onClick}
        >
            <IconExternal />
            <span>{artifact.filename}</span>
        </button>
    );
};

export const EvidenceBadge = ({
    artifact,
    setEvidence,
    evidence,
}: {
    artifact: IDBEvidence;
    evidence: IDBEvidence[];
    setEvidence: Dispatch<SetStateAction<IDBEvidence[]>>;
}) => {
    const onDelete = async () => {
        if (await IDB.evidence.delete(IDBKeyRange.only(artifact.uuid))) {
            setEvidence(evidence.filter((e) => e.uuid !== artifact.uuid));
        }
    };

    return (
        <Badge onDelete={onDelete}>
            {artifact.type === "url" ? (
                <LinkBadge artifact={artifact} />
            ) : (
                <FileBadge artifact={artifact} />
            )}
        </Badge>
    );
};
export const EvidenceBadges = ({
    evidence,
    setEvidence,
}: {
    evidence: IDBEvidence[];
    setEvidence: Dispatch<SetStateAction<IDBEvidence[]>>;
}) => {
    return evidence?.map((artifact) => (
        <EvidenceBadge
            key={artifact.uuid}
            artifact={artifact}
            evidence={evidence}
            setEvidence={setEvidence}
        />
    ));
};

async function fetchEvidence(requirementId, setEvidence) {
    const evidenceRecords = await IDB.evidence.getAll(
        IDBKeyRange.only(requirementId),
        "requirement_id"
    );
    setEvidence(evidenceRecords);
}

export const Evidence = ({ requirementId }: { requirementId: string }) => {
    const [evidence, setEvidence] = useState<IDBEvidence[]>([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!uploading) {
            fetchEvidence(requirementId, setEvidence);
        }
    }, [requirementId, uploading]);

    const onSubmit = async (e: SubmitEvent) => {
        setUploading(true);
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);

        if (formData.get("url")) {
            const href = formData.get("url") as string;
            const url = new URL(href);
            const data = new TextEncoder().encode(href);
            debugger;
            const evidence: IDBEvidence = {
                uuid: window.crypto.randomUUID(),
                filename: url.host || url.href,
                type: "url",
                data: data.buffer,
                requirement_id: requirementId,
            };
            await IDB.evidence.put(evidence);
            e?.target?.reset();
        }
        setUploading(false);
        return false;
    };

    return (
        <>
            <h4 className="text-2xl block sm:flex mb-6 items-center -translate-y-full">
                Evidence
            </h4>
            <form
                className="flex flex-col md:flex-row shrink mb-4 -translate-y-[36px]"
                onSubmit={onSubmit}
            >
                <div className="basis-full mb-4 md:mb-0 md:basis-1/3 md:mr-4">
                    <Files
                        requirementId={requirementId}
                        setUploading={setUploading}
                        uploading={uploading}
                    />
                    <div className="relative w-full mt-4">
                        <input
                            type="url"
                            name="url"
                            id="url"
                            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                            placeholder="URL for evidence"
                        />
                        <button
                            type="submit"
                            className="absolute top-0 end-0 p-2.5 h-full rounded-e-lg flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 border-l border-gray-200 border border-gray-200"
                        >
                            <IconLink />
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap shrink basis-full md:basis-2/3 content-center">
                    <EvidenceBadges
                        evidence={evidence}
                        setEvidence={setEvidence}
                    />
                </div>
            </form>
        </>
    );
};
