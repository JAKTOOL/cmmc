"use client";
import { GlobalScore, useGlobalScore } from "@/app/hooks/score";
import { renderNumber } from "@/app/utils/number";
import { IconInfo } from "./icon_info";
import { Popover } from "./popover";

interface Props {
    familyId?: string;
    requirementId?: string;
}

export const TotalScore = ({}: Props) => {
    const globalScore = useGlobalScore();
    return (
        <div>
            <span className="text-sm text-gray-400 mr-2">SPRS:</span>
            <span className="text-sm text-gray-400 mr-2">
                {renderNumber(globalScore?.score ?? 0)}/{GlobalScore.maxScore}
            </span>
            <button popoverTarget="sprs-popover">
                <IconInfo className="fill-gray-300" />
            </button>
            <Popover id="sprs-popover">
                <IconInfo />
                <p className="my-2">
                    This is the estimated SPRS score calculated by combining the
                    withdrawn revision 2 control values into their revision 3
                    replacement.
                </p>
                <p>
                    Your actual revision 2 score is:{" "}
                    <strong>{renderNumber(globalScore?.rev2Score ?? 0)}</strong>
                </p>
            </Popover>
        </div>
    );
};
