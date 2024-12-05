"use client";

interface StatusStateProps {
    statuses?: Status[];
    status?: Status;
}

enum Status {
    IMPLEMENTED = "implemented",
    NOT_IMPLEMENTED = "not-implemented",
    NOT_APPLICABLE = "not-applicable",
}

const StatusSpan = ({ children }) => (
    <span className="text-xl text-gray-600 mx-2">{children}</span>
);

export const StatusState = ({ statuses, status }: StatusStateProps) => {
    if (statuses?.length) {
        if (statuses.includes(Status.NOT_IMPLEMENTED)) {
            return <StatusSpan>🔴</StatusSpan>;
        }

        if (statuses.every((s) => s === Status.NOT_APPLICABLE)) {
            return <StatusSpan>⚪</StatusSpan>;
        }

        if (
            statuses.every((s) =>
                [Status.NOT_APPLICABLE, Status.IMPLEMENTED].includes(s)
            )
        ) {
            return <StatusSpan>🟢</StatusSpan>;
        }
    }

    switch (status) {
        case Status.IMPLEMENTED:
            return <StatusSpan>🟢</StatusSpan>;
        case Status.NOT_IMPLEMENTED:
            return <StatusSpan>🔴</StatusSpan>;
        case Status.NOT_APPLICABLE:
        default:
            return <StatusSpan>⚪</StatusSpan>;
    }
};
