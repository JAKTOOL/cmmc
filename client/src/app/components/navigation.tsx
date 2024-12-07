"use client";
import { useState } from "react";
import { ClearDB } from "./clear_db";
import { Export, Import } from "./export_import";
import { Markdown } from "./markdown";

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <nav className="bg-white dark:bg-gray-900 fixed w-full z-20 top-0 start-0 border-b border-gray-200 dark:border-gray-600">
            <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
                <a
                    href="/"
                    className="flex items-center space-x-3 rtl:space-x-reverse"
                    tabIndex={100}
                >
                    <span className="self-center text-2xl font-semibold whitespace-nowrap dark:text-white">
                        NIST SP 800-171 Rev 3
                    </span>
                </a>
                <div className="flex md:order-2 space-x-3 md:space-x-0 rtl:space-x-reverse">
                    <div className="relative inline-block text-left">
                        <div>
                            <button
                                type="button"
                                className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-transparent px-3 py-2 text-sm font-semibold text-gray-500 shadow-sm"
                                id="menu-button"
                                aria-expanded="true"
                                aria-haspopup="true"
                                onClick={() => setIsOpen(!isOpen)}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 30 30"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="currentColor"
                                    aria-hidden="true"
                                    data-slot="icon"
                                >
                                    <rect width="30" height="3" />
                                    <rect y="9" width="30" height="3" />
                                    <rect y="18" width="30" height="3" />
                                </svg>
                                {/* <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="30"
                                    height="30"
                                    fill="currentColor"
                                    aria-hidden="true"
                                    data-slot="icon"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="m17.653 10.35 2.056.336a.347.347 0 0 1 .291.343v1.913a.348.348 0 0 1-.288.342l-2.058.362a5.82 5.82 0 0 1-.49 1.185l1.217 1.69c.1.138.084.328-.036.45l-1.353 1.352a.347.347 0 0 1-.445.04l-1.707-1.198c-.376.21-.776.377-1.193.5l-.363 2.048a.347.347 0 0 1-.343.287h-1.913a.347.347 0 0 1-.343-.29l-.34-2.039a5.87 5.87 0 0 1-1.197-.495l-1.694 1.186a.348.348 0 0 1-.446-.038L5.655 16.97a.349.349 0 0 1-.036-.448l1.197-1.674a5.865 5.865 0 0 1-.5-1.204l-2.029-.36A.348.348 0 0 1 4 12.942v-1.913c0-.17.123-.315.29-.343l2.03-.338c.121-.42.289-.822.5-1.203L5.636 7.453a.347.347 0 0 1 .039-.445l1.352-1.352c.12-.12.31-.136.448-.037l1.68 1.2a5.86 5.86 0 0 1 1.196-.491l.333-2.036A.348.348 0 0 1 11.028 4h1.913c.17 0 .314.122.343.288l.359 2.047c.415.121.815.287 1.193.497l1.685-1.211a.348.348 0 0 1 .45.036l1.352 1.352c.12.12.136.308.039.446l-1.2 1.71c.206.376.37.772.49 1.185ZM9.565 12a2.435 2.435 0 1 0 4.87 0 2.435 2.435 0 0 0-4.87 0Z"
                                        clipRule="evenodd"
                                    />
                                </svg> */}
                            </button>
                        </div>
                        {isOpen && (
                            <div
                                className="absolute top-10 right-0 z-100 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none divide-y divide-gray-100"
                                role="menu"
                                aria-orientation="vertical"
                                aria-labelledby="menu-button"
                                tabIndex={-1}
                                onSubmit={() => setIsOpen(false)}
                                onKeyUp={() => setIsOpen(false)}
                            >
                                <div className="py-1" role="none">
                                    <Markdown />
                                </div>
                                <div className="py-1" role="none">
                                    <Export />
                                    <Import />
                                </div>
                                <div className="py-1" role="none">
                                    <ClearDB />
                                </div>
                                <div className="py-1" role="none">
                                    <a
                                        href="https://github.com/nealfennimore/nist-sp-800-171"
                                        className="block px-4 py-2 text-sm text-gray-700 flex flex-row"
                                        tabIndex={100}
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            aria-hidden="true"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 .333A9.911 9.911 0 0 0 6.866 19.65c.5.092.678-.215.678-.477 0-.237-.01-1.017-.014-1.845-2.757.6-3.338-1.169-3.338-1.169a2.627 2.627 0 0 0-1.1-1.451c-.9-.615.07-.6.07-.6a2.084 2.084 0 0 1 1.518 1.021 2.11 2.11 0 0 0 2.884.823c.044-.503.268-.973.63-1.325-2.2-.25-4.516-1.1-4.516-4.9A3.832 3.832 0 0 1 4.7 7.068a3.56 3.56 0 0 1 .095-2.623s.832-.266 2.726 1.016a9.409 9.409 0 0 1 4.962 0c1.89-1.282 2.717-1.016 2.717-1.016.366.83.402 1.768.1 2.623a3.827 3.827 0 0 1 1.02 2.659c0 3.807-2.319 4.644-4.525 4.889a2.366 2.366 0 0 1 .673 1.834c0 1.326-.012 2.394-.012 2.72 0 .263.18.572.681.475A9.911 9.911 0 0 0 10 .333Z"
                                                clipRule="evenodd"
                                            ></path>
                                        </svg>
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};
