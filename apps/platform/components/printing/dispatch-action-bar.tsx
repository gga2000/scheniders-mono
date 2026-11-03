"use client";

import { Printer, RefreshCw, Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { PrimeRunMoney } from "@/lib/prime/desk-state";

const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

interface DispatchActionBarProps {
    selectedCount: number;
    shipping: boolean;
    /** The run goes to Prime through the API instead of the Excel file. */
    primeLinked: boolean;
    /** Opens the ship dialog: labels PDF + Prime hand-off, then in transit. */
    onShip: () => void;
    /** Labels straight to the printer; no order moves. */
    onPrint: () => void;
    /** With the Prime link: the ticked run's cash, Prime's fees and what reaches the store. */
    primeMoney?: PrimeRunMoney;
    /** While the run is handed to Prime: parcels answered so far of the run. */
    primeProgress?: { done: number; total: number } | null;
}

/**
 * The run's actions, pinned under the queue: one button ships the run (both
 * files, after the checks in the ship dialog) and a quiet print icon prints the
 * labels without shipping anything.
 */
export function DispatchActionBar({ selectedCount, shipping, primeLinked, onShip, onPrint, primeMoney, primeProgress }: DispatchActionBarProps) {
    const { t } = useLanguage();
    const none = selectedCount === 0;
    const handing = shipping && primeProgress && primeProgress.total > 0 ? primeProgress : null;

    return (
        <div className="sticky bottom-4 z-30 flex items-center gap-2 overflow-hidden rounded-2xl bg-[var(--ink)] px-3 py-2.5 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)]">
            <span className="px-2 text-sm font-semibold">{t("printing.selectedCount", { count: selectedCount })}</span>
            {primeLinked && primeMoney && !none && (
                <div data-prime-money className="flex items-center gap-4 border-l border-white/15 pl-4 text-xs">
                    <span className="flex flex-col leading-tight">
                        <span className="text-white/60">{t("printing.prime.collect")}</span>
                        <b className="font-mono text-sm tabular-nums">{amountFormat.format(primeMoney.collect)}</b>
                    </span>
                    <span className="flex flex-col leading-tight" title={primeMoney.unpriced > 0 ? t("printing.prime.unpriced", { count: primeMoney.unpriced }) : undefined}>
                        <span className="text-white/60">{t("printing.prime.fee")}</span>
                        <b className="font-mono text-sm tabular-nums text-[#F7B4AC]">
                            −{amountFormat.format(primeMoney.fees)}
                            {primeMoney.unpriced > 0 && <span className="text-white/50"> +?</span>}
                        </b>
                    </span>
                    <span className="flex flex-col leading-tight">
                        <span className="text-white/60">{t("printing.prime.net")}</span>
                        <b className="font-mono text-sm tabular-nums text-[#9BE1BC]">{amountFormat.format(primeMoney.net)}</b>
                    </span>
                </div>
            )}
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
                {handing
                    ? t("printing.prime.handing", { done: handing.done, total: handing.total })
                    : shipping
                      ? t("printing.shipping")
                      : t(primeLinked ? "printing.shipButtonLinked" : "printing.shipButton", { count: selectedCount })}
            </button>
            {handing && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <span className="block h-full bg-[#9BE1BC] transition-[width] duration-500" style={{ width: `${Math.round((handing.done / handing.total) * 100)}%` }} />
                </span>
            )}
        </div>
    );
}
