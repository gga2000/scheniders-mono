"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeHome } from "@/hooks/use-prime-home";
import { usePrimeStatements, type PrimeStatementEntryView } from "@/hooks/use-prime-statements";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";
import { PrimePaymentDetail } from "./prime-payment-detail";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const CHIP = {
    match: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200",
    different: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
    closed: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
} as const;

/** The chip on a payment in the list: closed, how many differ, or all matching; nothing until it was checked. */
function usePaymentChip(entry: PrimeStatementEntryView): { label: string; tone: keyof typeof CHIP } | null {
    const { t } = useLanguage();
    if (entry.approval) return { label: entry.approval.source === "app" ? t("prime.cash.chipApproved") : t("prime.cash.chipPdf"), tone: "closed" };
    if (!entry.check) return null;
    const off = entry.check.different + entry.check.unknown;
    return off > 0 ? { label: t("prime.cash.chipDiff", { count: off }), tone: "different" } : { label: t("prime.cash.chipMatch"), tone: "match" };
}

function PaymentButton({ entry, current, onSelect }: { entry: PrimeStatementEntryView; current: boolean; onSelect: (id: number) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const chip = usePaymentChip(entry);
    return (
        <button
            type="button"
            aria-current={current}
            onClick={() => onSelect(entry.id)}
            className={cn(
                "flex flex-col gap-1.5 rounded-2xl border bg-[var(--card-bg)] p-4 text-left transition-colors",
                current ? "border-2 border-[var(--ink)] dark:border-white" : "border-[var(--card-border)] hover:border-[#D6D3CE] dark:hover:border-white/20",
            )}
        >
            <span className="flex w-full items-center justify-between gap-2">
                <b dir={dir} className="text-sm font-bold text-foreground">
                    {t("prime.cash.payment", { id: entry.id })}
                </b>
                {chip && <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", CHIP[chip.tone])}>{chip.label}</span>}
            </span>
            <span className="text-[22px] font-bold leading-tight text-foreground tabular-nums">{amount.format(entry.amount)}</span>
            <span dir={dir} className="text-left text-xs text-muted">
                {/* Isolated, so a Latin time next to Arabic words keeps its order. */}
                <bdi>{entry.at ? primeWhen(entry.at, t) : "—"}</bdi>
                {entry.check && (
                    <>
                        {" · "}
                        <bdi>{t("prime.cash.parcels", { count: entry.check.parcels })}</bdi>
                    </>
                )}
            </span>
        </button>
    );
}

/**
 * «الكشوفات»: every payment Prime made to the store, each marked by how its
 * parcels match our orders, with what Prime still holds for the store; and
 * one payment laid against our orders, to settle its differences and close
 * its matching orders as paid.
 */
export function PrimeStatementsTab({
    selected,
    onSelect,
    onAskPrime,
}: {
    selected: number | null;
    onSelect: (id: number) => void;
    onAskPrime: (orderId: string, draft: string, label: string) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const list = usePrimeStatements(true);
    const home = usePrimeHome(true);
    const entries = list.data?.connected ? list.data.statements : [];
    const current = selected ?? entries[0]?.id ?? null;

    if (list.isPending) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (list.isError) return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("orders.prime.unreachable")}</p>;
    if (entries.length === 0 || current === null) {
        return (
            <p dir={dir} className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center text-sm text-muted">
                {t("prime.page.noStatements")}
            </p>
        );
    }

    return (
        <div className="grid grid-cols-[340px_minmax(0,1fr)] items-start gap-[18px]">
            <aside className="flex flex-col gap-2.5">
                <nav aria-label={t("prime.page.tabStatements")} className="flex flex-col gap-2.5">
                    {entries.map((entry) => (
                        <PaymentButton key={entry.id} entry={entry} current={entry.id === current} onSelect={onSelect} />
                    ))}
                </nav>
                {home.summary && (
                    <div className="mt-1.5 flex flex-col gap-1.5 rounded-2xl bg-[var(--ink)] p-4 text-white">
                        <span dir={dir} className="text-left text-xs text-white/70">
                            {t("prime.cash.owedTitle")}
                        </span>
                        <b className="text-2xl tabular-nums">{amount.format(home.summary.owed.cash)}</b>
                        <span dir={dir} className="text-left text-xs text-white/70">
                            {t("prime.home.owedParcels", { count: home.summary.owed.parcels })}
                        </span>
                    </div>
                )}
            </aside>
            <PrimePaymentDetail paymentId={current} onAskPrime={onAskPrime} />
        </div>
    );
}
