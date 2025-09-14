"use client";
import { GlobalScore, useGlobalScore } from "@/app/hooks/score";

interface Props {
    familyId?: string;
    requirementId?: string;
}

export const TotalScore = ({}: Props) => {
    const globalScore = useGlobalScore();
    let score: number | string = globalScore?.score ?? 0;
    if (score % 1 > 0) {
        score = score.toFixed(1);
    }
    console.log(score);

    return (
        <div>
            <span className="text-sm text-gray-400 mr-2">Score:</span>
            <span className="text-sm text-gray-400">
                {score}/{GlobalScore.maxScore}
            </span>
        </div>
    );
};
