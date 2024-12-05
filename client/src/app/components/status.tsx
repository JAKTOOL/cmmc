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

const StatusSpan = ({ status }: { status?: Status }) => {
    switch (status) {
        case Status.IMPLEMENTED:
            return (
                <span
                    className="text-xl text-green-600 mx-2"
                    title="Implemented"
                >
                    🟢
                </span>
            );
        case Status.NOT_IMPLEMENTED:
            return (
                <span
                    className="text-xl text-red-600 mx-2"
                    title="Not implemented"
                >
                    🔴
                </span>
            );
        case Status.NOT_APPLICABLE:
            return (
                <span
                    className="text-xl text-black mx-2"
                    title="Not applicable"
                >
                    ⚫
                </span>
            );
        default:
            return (
                <span
                    className="text-xl text-gray-600 mx-2"
                    title="Not started"
                >
                    ⚪
                </span>
            );
    }
};

export const StatusState = ({ statuses, status }: StatusStateProps) => {
    if (statuses) {
        if (statuses.includes(Status.NOT_IMPLEMENTED)) {
            return <StatusSpan status={Status.NOT_IMPLEMENTED} />;
        }

        if (
            statuses.length &&
            statuses.every((s) => s === Status.NOT_APPLICABLE)
        ) {
            return <StatusSpan status={Status.NOT_APPLICABLE} />;
        }

        if (
            statuses.length &&
            statuses.every((s) =>
                [Status.NOT_APPLICABLE, Status.IMPLEMENTED].includes(s)
            )
        ) {
            return <StatusSpan status={Status.IMPLEMENTED} />;
        }

        return <StatusSpan status={Status.IMPLEMENTED} />;
    }

    return <StatusSpan status={status} />;
};
