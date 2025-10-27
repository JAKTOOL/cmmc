import { ReactNode } from "react";
import { Notification } from "./notification";

export const Popover = ({
    id,
    children,
}: {
    id: string;
    children: ReactNode;
}) => (
    <Notification popover="auto" id={id}>
        {children}
    </Notification>
);
