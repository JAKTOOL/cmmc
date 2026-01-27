"use client";

import { useNotification } from "@/app/context/notification";
import { useEffect, useRef } from "react";

interface ToastProps {
    text: string;
    identifier: string;
    warning?: boolean;
    danger?: boolean;
    permanent?: boolean;
    onClick: CallableFunction;
}

const CloseIcon = ({ onClick }: { onClick: CallableFunction }) => (
    <button
        type="button"
        className="ms-auto flex items-center justify-center text-body hover:text-heading bg-transparent box-border border border-transparent hover:bg-neutral-secondary-medium focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded text-sm h-8 w-8 focus:outline-none"
        onClick={onClick}
        aria-label="Close"
    >
        <span className="sr-only">Close</span>
        <svg
            className="w-5 h-5"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
        >
            <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18 17.94 6M18 18 6.06 6"
            />
        </svg>
    </button>
);

const IconDanger = () => (
    <div className="inline-flex items-center justify-center shrink-0 w-7 h-7 text-red-600 bg-red-300 rounded">
        <svg
            className="w-5 h-5"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
        >
            <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18 17.94 6M18 18 6.06 6"
            />
        </svg>
        <span className="sr-only">Error icon</span>
    </div>
);
const IconWarning = () => (
    <div className="inline-flex items-center justify-center shrink-0 w-7 h-7 text-yellow-600 bg-yellow-300 rounded">
        <svg
            className="w-5 h-5"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
        >
            <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 13V8m0 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
        </svg>
        <span className="sr-only">Warning icon</span>
    </div>
);

const IconSuccess = () => (
    <div
        className={`inline-flex items-center justify-center shrink-0 w-7 h-7 text-green-600 bg-green-300 rounded"`}
    >
        <svg
            className="w-5 h-5"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
        >
            <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 11.917 9.724 16.5 19 7.5"
            />
        </svg>
        <span className="sr-only">Check icon</span>
    </div>
);

export const Toast = ({
    text,
    identifier,
    danger,
    warning,
    permanent,
    onClick,
}: ToastProps) => {
    const node = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (node.current) {
            const button = node.current.querySelector("button");
            const remove = () => {
                node.current?.parentNode?.removeChild(node.current);
            };
            button?.addEventListener("click", remove);
            if (!permanent) {
                setTimeout(remove, 5000);
            }
        }
    }, [identifier, node, permanent]);

    let icon = <IconSuccess />;
    if (danger) {
        icon = <IconDanger />;
    } else if (warning) {
        icon = <IconWarning />;
    }

    return (
        <div
            id={identifier}
            className="flex items-center w-full max-w-sm p-4 text-body bg-white rounded-base shadow-xs border border-default"
            role="alert"
            ref={node}
        >
            {icon}
            <div className="ms-3 text-sm font-normal">{text}</div>
            <CloseIcon onClick={onClick} />
        </div>
    );
};

export const ToastContainer = () => {
    const { notificationsList, removeNotification } = useNotification();

    return (
        <div className="fixed flex flex-col items-center w-full max-w-xs p-4 text-body bg-neutral-primary-soft rounded-base top-20 end-5 z-20">
            {notificationsList.map((notification) => {
                return (
                    <Toast
                        key={notification.id}
                        identifier={notification.id as string}
                        text={notification.text}
                        danger={notification.danger}
                        warning={notification.warning}
                        permanent={notification.permanent}
                        onClick={removeNotification}
                    />
                );
            })}
        </div>
    );
};
