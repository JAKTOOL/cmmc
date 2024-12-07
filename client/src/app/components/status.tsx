"use client";

interface StatusStateProps {
    statuses?: Status[];
    status?: Status;
}

export enum Status {
    IMPLEMENTED = "implemented",
    NOT_IMPLEMENTED = "not-implemented",
    NOT_APPLICABLE = "not-applicable",
    NOT_STARTED = "not-started",
    NEEDS_WORK = "needs-work",
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
        case Status.NEEDS_WORK:
            return (
                <span
                    className="text-xl text-black mx-2"
                    title="Has work remaining"
                >
                    🟡
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
        if (statuses.length && statuses.includes(Status.NEEDS_WORK)) {
            return <StatusSpan status={Status.NEEDS_WORK} />;
        }

        if (statuses.length && statuses.includes(Status.NOT_IMPLEMENTED)) {
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

        if (statuses.length && statuses.includes(Status.NOT_STARTED)) {
            return <StatusSpan status={Status.NEEDS_WORK} />;
        }

        return <StatusSpan />;
    }

    return <StatusSpan status={status} />;
};
