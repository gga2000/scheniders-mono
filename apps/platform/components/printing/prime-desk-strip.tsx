"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { PrimeDeskCounts } from "@/lib/prime/desk-state";
import { cn } from "@/lib/utils";

/**
 * The desk's Prime counts over today's queue: parcels that reached Prime,
 * parcels waiting to go, and orders Prime would refuse until fixed (the fix
 * is on each card). Only when the tenant ships through the Prime API.
 * When the check did not answer it says so, with a retry, instead of
 * counting zeros.
 */
export function PrimeDeskStrip({ counts, failed = false, onRetry }: { counts: PrimeDeskCounts; failed?: boolean; onRetry?: () => void }) {
    const { t } = useLanguage();
    if (failed) {
        return (
            <div data-prime-desk-strip="failed" role="alert" className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#F3D7A8] bg-[#FFFAF2] px-3 text-[13px] font-semibold text-[#8A4B00] dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("printing.prime.checkFailed")}
                </span>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-[13px] font-semibold text-foreground hover:border-[var(--border-hover)]"
                    >
                        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("printing.prime.retry")}
                    </button>
                )}
            </div>
        );
    }
    const chips = [
        { key: "sent", label: t("printing.prime.countSent"), count: counts.sent, tone: "border-[#CFE6D8] bg-[#E3F2E9] text-[#165C39] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200" },
        { key: "waiting", label: t("printing.prime.countWaiting"), count: counts.waiting, tone: "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground" },
        { key: "fix", label: t("printing.prime.countFix"), count: counts.fix, tone: "border-[#F3D7A8] bg-[#FFFAF2] text-[#8A4B00] dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200" },
    ];
    return (
        <div data-prime-desk-strip className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
                <span key={chip.key} data-prime-count={chip.key} className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold", chip.tone)}>
                    {chip.label}
                    <b className="font-mono tabular-nums">{chip.count}</b>
                </span>
            ))}
        </div>
    );
}
