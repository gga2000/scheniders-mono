"use client";

import { useState } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeMonthReport } from "@/hooks/use-prime-month-report";
import { downloadCsv } from "@/lib/export-utils";
import { primeMonthKey, primeMonthOutcome, primeRecentMonths } from "@/lib/prime/month-report";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONTHS_SHOWN = 6;

/**
 * «تقرير الشهر»: one month of Prime parcels in numbers (sent, delivered,
 * returned, cancelled, still moving, and the cash and fees on the delivered
 * ones) with a CSV of every parcel for the accountant. It reads the parcels
 * handed to Prime in the Baghdad month and files each by its order's status.
 * It changes no profit rule.
 */
export function PrimeMonthReport() {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    // The months on offer are fixed when the tab opens, so the list does not shift while one is read.
    const [months] = useState(() => primeRecentMonths(Date.now(), MONTHS_SHOWN));
    const [month, setMonth] = useState(() => primeMonthKey(Date.now()));
    const { parcels, report, isPending, isError } = usePrimeMonthReport(month, true);
    const monthName = (key: string) => {
        const [year, number] = key.split("-").map(Number);
        return new Date(Date.UTC(year, number - 1, 15)).toLocaleDateString(language === "ar" ? "ar-IQ" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    };

    const exportCsv = () =>
        downloadCsv(
            [
                t("prime.cash.csv.order"),
                t("prime.cash.csv.customer"),
                t("prime.month.csv.city"),
                t("prime.month.csv.sent"),
                t("prime.month.csv.outcome"),
                t("prime.month.csv.prime"),
                t("prime.cash.colCollected"),
                t("prime.cash.colFee"),
            ],
            parcels.map((p) => [
                p.orderNumber,
                p.customerName,
                p.city ?? "",
                p.sentAt.slice(0, 10),
                t(`prime.month.${primeMonthOutcome(p.orderStatus)}`),
                p.primeStatus ?? "",
                p.collected ?? "",
                p.fee ?? "",
            ]),
            `prime-${month}`,
        );

    const lines: { key: string; label: string; value: string }[] = report
        ? [
              { key: "sent", label: t("prime.month.sent"), value: String(report.sent) },
              { key: "delivered", label: t("prime.month.delivered"), value: String(report.delivered) },
              { key: "returned", label: t("prime.month.returned"), value: String(report.returned) },
              { key: "cancelled", label: t("prime.month.cancelled"), value: String(report.cancelled) },
              { key: "open", label: t("prime.month.open"), value: String(report.open) },
              { key: "collected", label: t("prime.month.collected"), value: amount.format(report.collected) },
              { key: "fees", label: t("prime.month.fees"), value: amount.format(report.fees) },
          ]
        : [];

    return (
        <section data-prime-month className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground">{t("prime.month.title")}</h3>
                <button
                    type="button"
                    onClick={exportCsv}
                    disabled={parcels.length === 0}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--card-border)] px-3 text-xs font-semibold text-foreground hover:bg-black/[0.03] disabled:opacity-50 dark:hover:bg-white/5"
                >
                    CSV
                </button>
            </div>
            <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label={t("prime.month.title")}
                className="h-9 rounded-xl border border-[var(--card-border)] bg-transparent px-2.5 text-sm text-foreground"
            >
                {months.map((key) => (
                    <option key={key} value={key}>
                        {monthName(key)}
                    </option>
                ))}
            </select>
            {isPending ? (
                <div className="h-32 animate-pulse rounded-xl bg-black/[0.03] dark:bg-white/5" aria-busy="true" />
            ) : isError ? (
                <p dir={dir} className="text-left text-sm text-muted">
                    {t("orders.prime.unreachable")}
                </p>
            ) : (
                <dl className="flex flex-col">
                    {lines.map((line) => (
                        <div key={line.key} data-month-line={line.key} className="flex items-baseline justify-between gap-3 border-t border-[#F0EDE7] py-1.5 first:border-t-0 dark:border-white/10">
                            <dt dir={dir} className="text-left text-[13px] text-muted">
                                {line.label}
                            </dt>
                            <dd className="text-sm font-bold text-foreground tabular-nums">{line.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
}
