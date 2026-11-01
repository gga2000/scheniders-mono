"use client";

import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { useNetProfitForRange } from "@/hooks/use-net-profit-for-range";
import { cn, formatIQD } from "@/lib/utils";
import type { DayRange } from "@/lib/ads-report";

/**
 * Net profit for the selected range straight from Finances (same number as its Overview).
 * Ad spend is already inside it as a marketing expense, so nothing is subtracted twice.
 */
export function AdsNetProfit({ range }: { range: DayRange }) {
    const { t } = useLanguage();
    const profit = useNetProfitForRange(range);

    return (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div>
                <p className="text-xs font-medium text-muted">{t("ads.netProfit")}</p>
                {profit.error ? (
                    <p className="mt-2 text-sm text-red-600">{profit.error}</p>
                ) : (
                    <p className={cn("mt-2 text-2xl font-bold tabular-nums", !profit.loading && profit.netProfit < 0 ? "text-red-600" : "text-foreground")}>
                        {profit.loading ? "…" : formatIQD(profit.netProfit)}
                    </p>
                )}
                {!profit.loading && !profit.error ? (
                    <p className="mt-1 text-xs text-muted">
                        {t("ads.netProfitHint").replace("{ads}", formatIQD(profit.marketingCost))}
                    </p>
                ) : null}
            </div>
            <Link href="/finances" className="text-sm font-medium text-foreground underline underline-offset-4">
                {t("ads.netProfitLink")}
            </Link>
        </section>
    );
}
