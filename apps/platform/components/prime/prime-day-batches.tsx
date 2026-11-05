"use client";

import { useMemo, useState } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeRecentParcels } from "@/hooks/use-prime-month-report";
import { primeDayBatches } from "@/lib/prime/day-batches";

const DAYS = 7;

const FATES = [
    { key: "delivered", dot: "bg-[#1F7A4D]" },
    { key: "open", dot: "bg-[#315EA8]" },
    { key: "returned", dot: "bg-[#B42318]" },
    { key: "cancelled", dot: "bg-[#B8B3AA]" },
] as const;

/**
 * «الدفعات»: one column per day the store handed parcels to Prime, the last
 * seven, with what became of that day's parcels (delivered, still on the way,
 * returned, cancelled) by the orders' status. A day that is mostly returned,
 * or one that is stuck on the way, shows at a glance.
 */
export function PrimeDayBatches() {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const { parcels, isPending, isError } = usePrimeRecentParcels(DAYS, true);
    // Fixed when the view opens, so the columns do not shift under the reader.
    const [now] = useState(() => Date.now());
    const batches = useMemo(() => primeDayBatches(parcels, now, DAYS), [parcels, now]);
    const tallest = Math.max(1, ...batches.map((b) => b.sent));
    const dayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(language === "ar" ? "ar-IQ" : "en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });

    if (isPending) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (isError) return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("orders.prime.unreachable")}</p>;

    return (
        <section data-prime-batches className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-bold text-foreground">{t("prime.batches.title")}</h2>
                <ul className="flex flex-wrap gap-3 text-xs text-muted">
                    {FATES.map((fate) => (
                        <li key={fate.key} className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${fate.dot}`} />
                            {t(`prime.month.${fate.key}`)}
                        </li>
                    ))}
                </ul>
            </div>
            <ol className="grid grid-cols-7 gap-2">
                {batches.map((batch) => (
                    <li key={batch.day} data-batch-day={batch.day} className="flex min-w-0 flex-col gap-2">
                        <span dir={dir} className="truncate text-left text-xs text-muted">
                            {dayName(batch.day)}
                        </span>
                        <div className="flex h-36 flex-col justify-end rounded-xl bg-black/[0.03] p-1 dark:bg-white/5">
                            {batch.sent === 0 ? (
                                <span className="m-auto text-xs text-muted">—</span>
                            ) : (
                                <div className="flex flex-col-reverse overflow-hidden rounded-lg" style={{ height: `${Math.max(12, (batch.sent / tallest) * 100)}%` }}>
                                    {FATES.map((fate) =>
                                        batch[fate.key] === 0 ? null : <span key={fate.key} data-batch-fate={fate.key} className={fate.dot} style={{ flexGrow: batch[fate.key], flexBasis: 0 }} />,
                                    )}
                                </div>
                            )}
                        </div>
                        <b className="text-sm tabular-nums text-foreground">{batch.sent}</b>
                        <span dir={dir} className="text-left text-[11px] leading-tight text-muted">
                            {batch.sent > 0 ? t("prime.batches.fate", { delivered: batch.delivered, returned: batch.returned }) : ""}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}
