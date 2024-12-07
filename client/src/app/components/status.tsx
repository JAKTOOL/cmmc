"use client";

interface StatusStateProps {
    statuses?: Status[];
    status?: Status;
}

export enum Status {
    IMPLEMENTED = "implemented",
    NOT_IMPLEMENTED = "not-implemented",
    NOT_APPLICABLE = "not-applicable",
    PARTIALLY_IMPLEMENTED = "partially-implemented",
    NOT_STARTED = "not-started",
    NEEDS_WORK = "needs-work",
    _NOT_STARTED_DEFAULT = "", // Special default value for empty form fields
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
                    🚧
                </span>
            );
        case Status.PARTIALLY_IMPLEMENTED:
            return (
                <span
                    className="text-xl text-black mx-2"
                    title="Partially implemented"
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
    if (status) {
        return <StatusSpan status={status} />;
    }

    if (statuses?.length) {
        if (statuses.includes(Status.NEEDS_WORK)) {
            return <StatusSpan status={Status.NEEDS_WORK} />;
        }

        if (
            statuses.includes(Status.NOT_STARTED) &&
            !statuses.every((s) => s === Status.NOT_STARTED)
        ) {
            return <StatusSpan status={Status.NEEDS_WORK} />;
        }

        if (
            statuses.some((s) => s === Status.IMPLEMENTED) &&
            statuses.some((s) => s === Status.NOT_IMPLEMENTED)
        ) {
            if (
                statuses.includes(Status.NOT_STARTED) ||
                statuses.includes(Status._NOT_STARTED_DEFAULT)
            ) {
                return <StatusSpan status={Status.NEEDS_WORK} />;
            }
            return <StatusSpan status={Status.PARTIALLY_IMPLEMENTED} />;
        }

        if (statuses.includes(Status.NOT_IMPLEMENTED)) {
            return <StatusSpan status={Status.NOT_IMPLEMENTED} />;
        }

        if (statuses.every((s) => s === Status.NOT_APPLICABLE)) {
            return <StatusSpan status={Status.NOT_APPLICABLE} />;
        }

        if (
            statuses.every((s) =>
                [Status.NOT_APPLICABLE, Status.IMPLEMENTED].includes(s)
            )
        ) {
            return <StatusSpan status={Status.IMPLEMENTED} />;
        }
    }

    return <StatusSpan />;
};
