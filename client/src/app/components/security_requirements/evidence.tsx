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
            className="flex flex-col items-center justify-center  border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
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
        <span className="flex shrink items-center max-h-[20px] bg-blue-100 text-blue-800 border border-blue-200 text-xs font-medium me-2 mb-2 px-2.5 py-0.5 rounded-sm">
            <span
                className="border-r border-blue-200 pr-2"
                title={`${artifact.data.byteLength} bytes | ${artifact.type}`}
            >
                {artifact.filename}
            </span>
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

    return (
        <section className="flex flex-col md:flex-row shrink mb-4 -translate-y-[36px]">
            <div className="basis-full mb-4 md:mb-0 md:basis-1/3 md:mr-4">
                <Files
                    requirementId={requirementId}
                    setUploading={setUploading}
                    uploading={uploading}
                />
            </div>
            <div className="flex flex-wrap shrink basis-full md:basis-2/3 content-start">
                <EvidenceBadges evidence={evidence} setEvidence={setEvidence} />
            </div>
        </section>
    );
};
