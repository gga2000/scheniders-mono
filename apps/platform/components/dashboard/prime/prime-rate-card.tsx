"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeHomeSummary } from "@/lib/prime/home";
import { cn } from "@/lib/utils";
import { PrimeMark } from "./prime-mark";

/**
 * «نسبة التسليم · آخر 7 أيام»: of the parcels Prime finished in the last
 * seven Baghdad days, the share it delivered (the rest came back), against
 * the week before, with one bar per day.
 */
export function PrimeRateCard({ summary }: { summary: PrimeHomeSummary }) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const { rate, previousRate, days } = summary;
    const delta = rate !== null && previousRate !== null ? rate - previousRate : null;
    const dayName = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", { weekday: "short", timeZone: "UTC" });

    return (
        <section data-prime-rate className="flex h-full flex-col gap-3 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <header className="flex items-center justify-between gap-3">
                <span dir={dir} className="text-left text-xs text-muted">
                    {t("prime.home.rateTitle")}
                </span>
                <PrimeMark label={t("prime.home.badge")} />
            </header>
            {rate === null ? (
                <p dir={dir} className="text-left text-sm text-muted">
                    {t("prime.home.rateNone")}
                </p>
            ) : (
                <div className="flex items-baseline gap-3">
                    <span className="text-[40px] font-bold leading-none tracking-tight text-foreground tabular-nums">{rate}%</span>
                    {delta !== null && (
                        <span
                            className={cn(
                                "flex items-baseline gap-1.5 text-sm font-semibold",
                                delta > 0 ? "text-[#165C39] dark:text-emerald-300" : delta < 0 ? "text-[#8F1D13] dark:text-rose-300" : "text-muted",
                            )}
                        >
                            {delta !== 0 && <span className="tabular-nums">{delta > 0 ? `+${delta}` : `−${-delta}`}</span>}
                            <span dir={dir}>{delta === 0 ? t("prime.home.rateSame") : t("prime.home.rateVs")}</span>
                        </span>
                    )}
                </div>
            )}
            <div className="mt-auto flex h-16 items-end gap-2" role="list">
                {days.map((d, i) => {
                    const label = dayName.format(Date.parse(`${d.day}T00:00:00Z`));
                    const shown = d.rate === null ? "—" : `${d.rate}%`;
                    return (
                        <span
                            key={d.day}
                            role="listitem"
                            title={t("prime.home.rateDay", { day: label, rate: shown })}
                            aria-label={t("prime.home.rateDay", { day: label, rate: shown })}
                            className={cn(
                                "flex-1 rounded-md",
                                d.rate === null ? "bg-[var(--card-border)]" : i === days.length - 1 ? "bg-[#315EA8]" : "bg-[#9DB4DD] dark:bg-sky-400/40",
                            )}
                            style={{ height: d.rate === null ? "6px" : `${Math.max(8, d.rate)}%` }}
                        />
                    );
                })}
            </div>
        </section>
    );
}
