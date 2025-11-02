"use client";

interface EvidenceStateProps {
    evidence?: boolean[] | boolean;
    size?: string;
}

const EvidenceSpan = ({
    evidence,
    size = "xl",
}: {
    evidence: boolean;
    size?: string;
}) => {
    return (
        evidence && (
            <span
                className={`text-${size} text-gray-600 mx-2`}
                title="Has evidence"
            >
                🧾
            </span>
        )
    );
};

export const EvidenceState = ({ evidence, size }: EvidenceStateProps) => {
    if (evidence?.length) {
        return (
            <EvidenceSpan
                evidence={(evidence as boolean[])?.every((b) => b)}
                size={size}
            />
        );
    }
    return <EvidenceSpan evidence={evidence as boolean} size={size} />;
};
