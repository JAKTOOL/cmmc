import { ReactNode } from "react";

interface Row {
    title: string;
    value: ReactNode;
}

interface Props {
    rows: Row[];
}

export const DataTable = ({ rows }: Props) => {
    return (
        <dl className="flex flex-row">
            {rows.reduce((acc, row) => {
                if (row.value !== undefined && row.value !== null) {
                    acc.push(
                        <div key={row.title}>
                            <dt className="text-xs text-gray-700 uppercase bg-gray-50 text-gray-700 border-gray-100 py-2 px-4 text-left border-r-2 border-b-2">
                                {row.title}
                            </dt>
                            <dd className="text-xs text-gray-500 bg-white border-gray-200 py-2 px-4">
                                {row.value}
                            </dd>
                        </div>
                    );
                }
                return acc;
            }, [] as ReactNode[])}
        </dl>
    );
};
