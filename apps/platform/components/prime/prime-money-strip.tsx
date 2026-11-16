"use client";

import { useLanguage } from "@/hooks/use-language";
import { usePrimeStatements } from "@/hooks/use-prime-statements";
import { formatIqdNumber } from "@scheniders/shared";

/** One money style for all three tiles: the amount, then a small «IQD». */
function Money({ value, className }: { value: number | null; className: string }) {
    return (
        <b className={`text-[26px] leading-tight tabular-nums ${className}`}>
            {value === null ? "…" : formatIqdNumber(value)}
            {value !== null && <span className="ms-1 text-xs font-semibold text-muted">IQD</span>}
        </b>
    );
}

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
            <div data-prime-money="on_road" className={tile}>
                <span className="text-xs text-muted">{t("prime.page.moneyOnRoad")}</span>
                <Money value={onRoad} className="text-[#315EA8] dark:text-sky-300" />
            </div>
            {admin && (
                <>
                    <div data-prime-money="waiting" className={tile}>
                        <span className="text-xs text-muted">{t("prime.page.moneyWaiting")}</span>
                        <Money value={statements.isPending ? null : waitingTotal} className="text-foreground" />
                        {/* Always takes its line, so the strip does not grow when the statements answer. */}
                        <span className="min-h-4 text-xs text-muted">
                            {waiting.length > 0 && <bdi>{t("prime.page.moneyWaitingCount", { count: waiting.length })}</bdi>}
                        </span>
                    </div>
                    <div data-prime-money="diff" className={tile}>
                        <span className="text-xs text-muted">{t("prime.page.moneyDiff")}</span>
                        <Money value={statements.isPending ? null : diff} className="text-foreground" />
                    </div>
                </>
            )}
        </section>
    );
}
