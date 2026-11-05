"use client";

import { useLanguage } from "@/hooks/use-language";
import { usePrimeStatements } from "@/hooks/use-prime-statements";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const tile = "flex min-w-0 flex-col gap-0.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3";

/**
 * Three numbers above the track: the cash on the parcels we track at Prime,
 * what Prime paid that the store has not approved yet, and the difference
 * between what Prime paid and what the orders expect. The last two are the
 * administrators' money and show only to them.
 */
export function PrimeMoneyStrip({ onRoad, admin }: { onRoad: number; admin: boolean }) {
    const { t } = useLanguage();
    const statements = usePrimeStatements(admin);
    const answer = statements.data?.connected ? statements.data : null;
    const waiting = answer ? answer.statements.filter((s) => s.approval === null) : [];
    const waitingTotal = waiting.reduce((sum, s) => sum + s.amount, 0);
    // The difference belongs to the newest payment and counts only until it is approved.
    const latest = answer?.latest ?? null;
    const diff = latest && waiting.some((s) => s.id === latest.id) ? Math.abs(latest.summary.diff) : 0;

    return (
        <section aria-label={t("prime.page.moneyStrip")} className={admin ? "grid grid-cols-3 gap-3" : "grid grid-cols-1 gap-3"}>
            <div data-prime-money="on_road" className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-[#315EA8] px-4 py-3 text-white">
                <span className="text-xs text-[#D6E1F5]">{t("prime.page.moneyOnRoad")}</span>
                <b className="text-[26px] leading-tight tabular-nums">{amount.format(onRoad)}</b>
            </div>
            {admin && (
                <>
                    <div data-prime-money="waiting" className={tile}>
                        <span className="text-xs text-muted">{t("prime.page.moneyWaiting")}</span>
                        <b className="text-[26px] leading-tight tabular-nums text-foreground">{statements.isPending ? "…" : amount.format(waitingTotal)}</b>
                        {waiting.length > 0 && <span className="text-xs text-muted">{t("prime.page.moneyWaitingCount", { count: waiting.length })}</span>}
                    </div>
                    <div data-prime-money="diff" className={tile}>
                        <span className="text-xs text-muted">{t("prime.page.moneyDiff")}</span>
                        <b className="text-[26px] leading-tight tabular-nums text-foreground">{statements.isPending ? "…" : `${amount.format(diff)} IQD`}</b>
                    </div>
                </>
            )}
        </section>
    );
}
