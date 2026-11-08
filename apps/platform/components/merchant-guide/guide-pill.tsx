"use client";

import { Compass } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

const R = 9;
const C = 2 * Math.PI * R;

/** The guide's home in the corner: progress, and the way back to the card. */
export function GuidePill({
    label,
    done,
    total,
    onOpen,
    left,
}: {
    /** Clears the app sidebar where there is one. */
    left: number;
    label: string;
    done: number;
    total: number;
    /** Set while the card is hidden: the pill brings it back. */
    onOpen?: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const ring = (
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="12" cy="12" r={R} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" />
            <circle
                cx="12"
                cy="12"
                r={R}
                fill="none"
                stroke="#EFFF00"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(C * done) / total} ${C}`}
                style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
        </svg>
    );
    const body = (
        <>
            {ring}
            <span dir={dir}>
                {label} · {t("guide.progressDone", { done, total })}
            </span>
            {onOpen && (
                <span className="inline-flex items-center gap-1 text-[#EFFF00]">
                    <Compass className="h-4 w-4" aria-hidden="true" />
                    {t("guide.show")}
                </span>
            )}
        </>
    );
    const cls =
        "fixed bottom-6 z-[46] inline-flex h-11 items-center gap-2.5 rounded-full bg-neutral-900 px-4 text-sm text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]";
    return onOpen ? (
        <button
            type="button"
            onClick={onOpen}
            data-testid="merchant-guide-pill"
            style={{ left }}
            className={`${cls} hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]`}
        >
            {body}
        </button>
    ) : (
        <div data-testid="merchant-guide-pill" style={{ left }} className={cls} role="status">
            {body}
        </div>
    );
}
