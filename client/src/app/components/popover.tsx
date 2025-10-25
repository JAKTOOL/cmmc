import { ReactNode } from "react";

export const Popover = ({
    id,
    children,
}: {
    id: string;
    children: ReactNode;
}) => (
    <div
        popover="auto"
        id={id}
        className="w-64 text-sm text-blue-800 rounded-lg bg-blue-50 normal-case p-4"
    >
        {children}
    </div>
);
