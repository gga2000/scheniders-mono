"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeStatement, usePrimeStatements } from "@/hooks/use-prime-statements";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A difference with its sign spelled out: "+1,250", "−6,750", "0". */
function signed(value: number) {
    if (value === 0) return "0";
    return `${value > 0 ? "+" : "−"}${amount.format(Math.abs(value))}`;
}

const KIND_CHIP = {
    match: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200",
    different: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
    unknown: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
} as const;

/**
 * «الكشوفات»: every payment Prime made to the store, and one payment's
 * parcels laid against our orders: what Prime collected, its fee, what it
 * paid, and whether that is what our books expect.
 */
export function PrimeStatementsTab({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const list = usePrimeStatements(true);
    const entries = list.data?.connected ? list.data.statements : [];
    const current = selected ?? entries[0]?.id ?? null;
    const statement = usePrimeStatement(current);

    if (list.isPending) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (list.isError) return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("orders.prime.unreachable")}</p>;
    if (entries.length === 0) {
        return (
            <p dir={dir} className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center text-sm text-muted">
                {t("prime.page.noStatements")}
            </p>
        );
    }

    return (
        <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-[18px]">
            <nav aria-label={t("prime.page.tabStatements")} className="flex flex-col gap-1 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                {entries.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        aria-current={entry.id === current}
                        onClick={() => onSelect(entry.id)}
                        className={cn(
                            "flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
                            entry.id === current ? "bg-[#E8EEF8] dark:bg-sky-400/10" : "hover:bg-black/[0.03] dark:hover:bg-white/5",
                        )}
                    >
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground tabular-nums">#{entry.id}</span>
                            <span dir={dir} className="block truncate text-left text-xs text-muted">
                                {entry.at ? primeWhen(entry.at, t) : "—"} · {entry.confirmed ? t("prime.page.received") : t("prime.page.notReceived")}
                            </span>
                        </span>
                        <b className="text-sm tabular-nums text-foreground">{amount.format(entry.amount)}</b>
                    </button>
                ))}
            </nav>

            <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
                {statement.isPending ? (
                    <div className="h-48 animate-pulse rounded-xl bg-black/[0.03] dark:bg-white/5" aria-busy="true" />
                ) : statement.isError || !statement.data ? (
                    <p className="text-sm text-muted">{t("orders.prime.unreachable")}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: t("prime.page.collected"), value: amount.format(statement.data.statement.summary.collect) },
                                { label: t("orders.prime.panel.fee"), value: amount.format(statement.data.statement.summary.fees) },
                                { label: t("prime.page.paid"), value: amount.format(statement.data.statement.summary.net) },
                                { label: t("prime.page.difference"), value: signed(statement.data.statement.summary.diff) },
                            ].map(({ label, value }) => (
                                <div key={label} className="rounded-2xl bg-[#F5F3EF] px-4 py-3 dark:bg-white/5">
                                    <span className="block text-xs text-muted">{label}</span>
                                    <b className="text-lg tabular-nums text-foreground">{value}</b>
                                </div>
                            ))}
                        </div>
                        <p dir={dir} className="text-left text-xs text-muted">
                            {t("prime.page.statementCounts", {
                                matched: statement.data.statement.summary.matched,
                                different: statement.data.statement.summary.different,
                                unknown: statement.data.statement.summary.unknown,
                            })}
                        </p>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted">
                                    <th className="py-2 font-medium">{t("prime.page.order")}</th>
                                    <th className="py-2 text-right font-medium">{t("prime.page.collected")}</th>
                                    <th className="py-2 text-right font-medium">{t("orders.prime.panel.fee")}</th>
                                    <th className="py-2 text-right font-medium">{t("prime.page.paid")}</th>
                                    <th className="py-2 text-right font-medium">{t("prime.page.difference")}</th>
                                    <th className="py-2 pl-3 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {statement.data.statement.rows.map((row, i) => (
                                    <tr key={`${row.caseId ?? row.receipt ?? "row"}-${i}`} className="border-t border-[#F0EDE7] dark:border-white/10">
                                        <td className="py-2.5">
                                            <span className="block font-semibold text-foreground">{row.ours?.customerName || row.ours?.orderNumber || row.receipt || "—"}</span>
                                            <span className="block text-xs text-muted tabular-nums">
                                                {row.ours?.orderNumber ?? row.receipt ?? ""} {row.caseId !== null && <>· #{row.caseId}</>}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums">{amount.format(row.primeCollect)}</td>
                                        <td className="py-2.5 text-right tabular-nums">{amount.format(row.primeFee)}</td>
                                        <td className="py-2.5 text-right font-semibold tabular-nums">{amount.format(row.primeNet)}</td>
                                        <td className={cn("py-2.5 text-right tabular-nums", row.diff ? "font-semibold text-[#8A4B00] dark:text-amber-300" : "text-muted")}>
                                            {row.diff === null ? "—" : signed(row.diff)}
                                        </td>
                                        <td className="py-2.5 pl-3 text-right">
                                            <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold", KIND_CHIP[row.kind])}>
                                                {t(`prime.page.kind.${row.kind}`)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </section>
        </div>
    );
}
