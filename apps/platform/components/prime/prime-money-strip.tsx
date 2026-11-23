"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeStatements } from "@/hooks/use-prime-statements";
import { formatCount } from "@/lib/utils";

/**
 * One money style for all three tiles: the amount, then a small unit in the
 * page's language («د.ع», "IQD"). Laid out in the language's direction, so an
 * Arabic reader meets the number first.
 */
function Money({ value, unread = false, className }: { value: number | null; unread?: boolean; className: string }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    // Not read from Prime: a dash, never a 0 that reads as "nothing waiting".
    if (unread) return <b className="text-[26px] leading-tight text-muted">—</b>;
    return (
        <b dir={dir} className={`text-[26px] leading-tight tabular-nums ${className}`}>
            {value === null ? "…" : formatCount(Math.round(value))}
            {value !== null && <span className="ms-1 text-xs font-semibold text-muted">{t("common.iqd")}</span>}
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
    // Prime's payments could not be read (and none were read before): the two amounts are unknown.
    const unread = statements.isError && statements.data === undefined;

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
                        <Money value={statements.isPending ? null : waitingTotal} unread={unread} className="text-foreground" />
                        {/* Always takes its line, so the strip does not grow when the statements answer. */}
                        <span className="min-h-4 text-xs text-muted">
                            {unread ? t("prime.page.moneyUnread") : waiting.length > 0 && <bdi>{t("prime.page.moneyWaitingCount", { count: waiting.length })}</bdi>}
                        </span>
                    </div>
                    <div data-prime-money="diff" className={tile}>
                        <span className="text-xs text-muted">{t("prime.page.moneyDiff")}</span>
                        <Money value={statements.isPending ? null : diff} unread={unread} className="text-foreground" />
                    </div>
                </>
            )}
        </section>
    );
}
