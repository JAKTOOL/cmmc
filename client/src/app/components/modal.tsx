import { useEffect } from "react";

interface InfoModalProps {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}

export function InfoModal({ open, title, children, onClose }: InfoModalProps) {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        if (open) {
            document.addEventListener("keydown", onKeyDown);
            document.body.style.overflow = "hidden";
        }

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = "";
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="
          w-full max-w-lg
          rounded-2xl
          border border-slate-700
          bg-slate-900
          shadow-2xl
          overflow-hidden
        "
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                    <h2 className="text-lg font-semibold text-white">
                        {title}
                    </h2>

                    <button
                        onClick={onClose}
                        className="
              rounded-lg
              p-2
              text-slate-400
              transition
              hover:bg-slate-800
              hover:text-white
            "
                    >
                        ✕
                    </button>
                </div>

                <div className="px-6 py-5 text-sm leading-6 text-slate-300">
                    {children}
                </div>

                <div className="flex justify-end border-t border-slate-800 px-6 py-4">
                    <button
                        onClick={onClose}
                        className="
              rounded-lg
              bg-cyan-500
              px-4
              py-2
              text-sm
              font-medium
              text-slate-950
              transition
              hover:bg-cyan-400
            "
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
