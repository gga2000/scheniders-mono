"use client";

import { Printer, RefreshCw, Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface DispatchActionBarProps {
    selectedCount: number;
    shipping: boolean;
    /** Opens the ship dialog: labels PDF + Prime file, then in transit. */
    onShip: () => void;
    /** Labels straight to the printer; no order moves. */
    onPrint: () => void;
}

/**
 * The run's actions, pinned under the queue: one button ships the run (both
 * files, after the checks in the ship dialog) and a quiet print icon prints the
 * labels without shipping anything.
 */
export function DispatchActionBar({ selectedCount, shipping, onShip, onPrint }: DispatchActionBarProps) {
    const { t } = useLanguage();
    const none = selectedCount === 0;

    return (
        <div className="sticky bottom-4 z-30 flex items-center gap-2 rounded-2xl bg-[var(--ink)] px-3 py-2.5 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)]">
            <span className="px-2 text-sm font-semibold">{t("printing.selectedCount", { count: selectedCount })}</span>
            <span className="flex-1" />
            <button
                type="button"
                onClick={onPrint}
                disabled={none}
                title={t("printing.printDirect")}
                aria-label={t("printing.printDirect")}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/25 hover:bg-white/10 disabled:opacity-40"
            >
                <Printer className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={onShip}
                disabled={none || shipping}
                className="flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
            >
                {shipping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {shipping ? t("printing.shipping") : t("printing.shipButton", { count: selectedCount })}
            </button>
        </div>
    );
}
