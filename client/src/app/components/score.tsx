"use client";
import { GlobalScore, useGlobalScore } from "@/app/hooks/score";
import { renderNumber } from "@/app/utils/number";

interface Props {
    familyId?: string;
    requirementId?: string;
}

export const TotalScore = ({}: Props) => {
    const globalScore = useGlobalScore();
    return (
        <div>
            <span className="text-sm text-gray-400 mr-2">Score:</span>
            <span className="text-sm text-gray-400">
                {renderNumber(globalScore?.score ?? 0)}/{GlobalScore.maxScore}
            </span>
        </div>
    );
};
