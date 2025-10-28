"use client";
import { ElementWrapper } from "@/api/entities/Framework";
import Link from "next/link";
import { useEffect, useRef } from "react";

interface PageNavigationProps {
    previous?: ElementWrapper | undefined;
    next?: ElementWrapper | undefined;

    elementIdentity?: (
        element: ElementWrapper | undefined
    ) => string | undefined;

    elementType?: string;
}

const defaultElementIdentity = (element: ElementWrapper | undefined) =>
    element?.requirement;

function inViewport(element: HTMLAnchorElement) {
    const clientRect = element.getBoundingClientRect();
    return (
        // 82 = navbar height
        clientRect.top >= 82 &&
        clientRect.left >= 0 &&
        clientRect.bottom <=
            (window.innerHeight || document.documentElement.clientHeight) &&
        clientRect.right <=
            (window.innerWidth || document.documentElement.clientWidth)
    );
}

export const ContentNavigation = ({
    previous,
    next,
    elementType = "requirement",
    elementIdentity = defaultElementIdentity,
}: PageNavigationProps) => {
    const previousRef = useRef<HTMLAnchorElement>(null);
    const nextRef = useRef<HTMLAnchorElement>(null);

    let nextClasses = "rounded-r-lg rounded-l-lg";
    if (previous) {
        nextClasses = "rounded-r-lg";
    }
    let prevClasses = "rounded-r-lg rounded-l-lg";
    if (next) {
        prevClasses = "rounded-l-lg border-r";
    }

    useEffect(() => {
        if (nextRef.current && inViewport(nextRef.current)) {
            nextRef.current.focus();
        } else if (previousRef.current && inViewport(previousRef.current)) {
            previousRef.current.focus();
        }
    }, [previousRef, nextRef]);

    const prevElement = elementIdentity(previous);
    const nextElement = elementIdentity(next);

    return (
        <aside className="w-5/6 flex flex-row mb-4">
            {previous && (
                <Link
                    href={`/r3/${elementType}/${prevElement}`}
                    className={`flex flex-row items-center bg-gray-200 text-gray-700 border-gray-400 py-2 px-4 border-b-4 hover:bg-gray-300 ${prevClasses}`}
                    tabIndex={10}
                    ref={previousRef}
                >
                    <svg
                        className="w-6 h-6 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 19l-7-7 7-7"
                        ></path>
                    </svg>
                    <span className="mr-4 ml-2">
                        <span>{prevElement}</span>
                        {!!previous.title && (
                            <span className="hidden md:inline">
                                : {previous.title}
                            </span>
                        )}
                    </span>
                </Link>
            )}
            {next && (
                <Link
                    href={`/r3/${elementType}/${nextElement}`}
                    className={`flex flex-row items-center bg-gray-200 text-gray-700 border-gray-400 py-2 px-4 border-b-4 hover:bg-gray-300 ${nextClasses}`}
                    tabIndex={11}
                    ref={nextRef}
                >
                    <span className="ml-4 mr-2">
                        <span>{nextElement}</span>
                        {!!next.title && (
                            <span className="hidden md:inline">
                                : {next.title}
                            </span>
                        )}
                    </span>
                    <svg
                        className="w-6 h-6 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5l7 7-7 7"
                        />
                    </svg>
                </Link>
            )}
        </aside>
    );
};
