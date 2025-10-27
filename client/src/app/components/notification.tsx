import { ReactNode } from "react";

export const Notification = ({
    children,
    ...props
}: {
    children: ReactNode;
}) => (
    <div
        {...props}
        className="w-full max-w-md text-sm text-blue-800 rounded-lg bg-blue-50 border border-blue-300 normal-case p-4 shadow-md"
    >
        {children}
    </div>
);
