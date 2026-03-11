import React, { useEffect, useRef, useState } from "react";

export interface Option {
    label: string;
    value: any;
}

interface SearchDropdownProps {
    options: Promise<Option[]>;
    debounceMs?: number;
    placeholder?: string;
    onSelect?: (option: Option, fn: CallableFunction) => void;
}

const IconSearch = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        aria-hidden="true"
        className="h-4 mr-1"
        viewBox="0 0 24 24"
    >
        <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        />
    </svg>
);

export function SearchDropdown({
    options,
    debounceMs = 250,
    placeholder = "Search...",
    onSelect,
}: SearchDropdownProps) {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [results, setResults] = useState<Option[]>([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const debounceTimer = useRef<number | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.clearTimeout(debounceTimer.current);

        debounceTimer.current = window.setTimeout(() => {
            setDebouncedQuery(query);
        }, debounceMs);

        return () => window.clearTimeout(debounceTimer.current);
    }, [query, debounceMs]);

    useEffect(() => {
        async function filterResults() {
            if (!debouncedQuery) {
                setResults([]);
                setOpen(false);
                return;
            }

            const q = debouncedQuery.toLowerCase();
            const filtered = (await options)
                .filter((o) => o.label.toLowerCase().includes(q))
                .slice(0, 5);

            setResults(filtered);
            setOpen(true);
            setActiveIndex(-1);
        }
        filterResults();
    }, [debouncedQuery, options]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    function select(option: Option) {
        setQuery(option.label);
        setOpen(false);
        setActiveIndex(-1);
        onSelect?.(option, setQuery);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open || results.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        }

        if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            select(results[activeIndex]);
        }

        if (e.key === "Escape") {
            setOpen(false);
        }
    }

    return (
        <div ref={containerRef} className="relative w-full mt-4">
            <input
                value={query}
                placeholder={placeholder}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length && setOpen(true)}
                onKeyDown={handleKeyDown}
                className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg block w-full p-2.5"
            />
            <button
                type="submit"
                className="absolute top-0 end-0 p-2.5 h-full rounded-e-lg flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 border-l border-gray-200 border border-gray-200"
            >
                <IconSearch />
            </button>

            {open && results.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg max-h-60 overflow-y-auto shadow-sm">
                    {results.map((item, i) => (
                        <li
                            key={item.label + i}
                            onMouseDown={() => select(item)}
                            className={`cursor-pointer px-2.5 py-2 ${
                                i === activeIndex
                                    ? "bg-gray-200"
                                    : "hover:bg-gray-100"
                            }`}
                        >
                            {item.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
