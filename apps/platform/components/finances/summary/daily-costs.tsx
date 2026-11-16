"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { adReturn, breakEven, bulkDays, perOrder, type FinanceSummary, type ProfitStatement } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import type { FinanceTab } from "./finance-tabs";
import { formatWhole, useMoneyText } from "./money";
import { CARD_FIGURE, CARD_LINK, SummaryCard } from "./summary-card";

interface DailyCostsProps {
    summary: FinanceSummary;
    statement: ProfitStatement;
    onOpenTab: (tab: FinanceTab) => void;
}

/** 14 / 3.5: orders a day, with one decimal only under ten. */
function rate(value: number): string {
    return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

/** The count an Arabic noun after "3.5"/"14" agrees with: none for a fraction, which takes the plain form. */
function countOf(text: string): { count?: number } {
    return /^\d+$/.test(text) ? { count: Number(text) } : {};
}

/**
 * The costs that run every day whatever is sold, in one card. First the ads:
 * the sales each 1,000 IQD of ads brought, shown as a rate ("per 1,000"),
 * never with the currency sign, so it is not read as money in hand. Then how many delivered orders a
 * day pay the daily bill (ads, salaries, other costs), against how many the
 * shop delivers, as one bar drawn to scale with a name on each part.
 */
export function DailyCosts({ summary, statement, onOpenTab }: DailyCostsProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const money = useMoneyText();
    const spent = statement.lines.find((l) => l.id === "ads")?.amount ?? 0;
    const brought = adReturn(statement);
    const even = breakEven(summary, statement);
    const bulk = bulkDays(summary.daily);
    // Only the daily costs this period has, so the brackets never name a cost that is zero.
    const costItems = (["ads", "salaries", "other"] as const)
        .filter((id) => (statement.lines.find((l) => l.id === id)?.amount ?? 0) > 0)
        .map((id) => t(`fin.even.item.${id}`));
    const quiet = "text-left text-[13.5px] leading-relaxed text-muted";
    const label = "flex min-w-0 items-center gap-1.5";
    const dot = "size-2.5 shrink-0 rounded-[3px]";

    let cover = <p className={quiet} dir={dir}>{t("fin.even.none")}</p>;
    if (even && even.needed === null) {
        cover = <p className="text-left text-[13.5px] leading-relaxed text-rose-700 dark:text-rose-300" dir={dir} data-testid="break-even-never">{t("fin.even.never")}</p>;
    } else if (even && even.needed === 0) {
        cover = <p className={quiet} dir={dir} data-testid="break-even-free">{t("fin.even.free")}</p>;
    } else if (even && even.needed !== null) {
        // Whole orders pay a bill, and the two parts of the bar must add up to the figure beside them.
        const need = Math.ceil(even.needed);
        const have = Number(rate(even.delivered));
        const above = have >= need;
        cover = (
            <div data-testid="break-even-bar" data-state={above ? "above" : "below"}>
                <div className="flex items-center justify-between gap-3 text-[12.5px] font-medium text-foreground">
                    {above ? (
                        <>
                            <span className={label}>
                                <span className={`${dot} bg-stone-900 dark:bg-stone-100`} aria-hidden="true" />
                                <span dir={dir}>{t("fin.even.cover", { n: String(need), count: need })}</span>
                            </span>
                            <span className={label}>
                                <span className={dot} style={{ background: PROFIT_COLOR }} aria-hidden="true" />
                                <span dir={dir}>{t("fin.even.profit", { n: rate(have - need), have: rate(have), ...countOf(rate(have)) })}</span>
                            </span>
                        </>
                    ) : (
                        <>
                            <span className={label}>
                                <span className={dot} style={{ background: LOSS_COLOR }} aria-hidden="true" />
                                <span dir={dir}>{t("fin.even.have", { have: rate(have) })}</span>
                            </span>
                            <span className={label}>
                                <span className={`${dot} border border-dashed border-stone-400`} aria-hidden="true" />
                                <span dir={dir}>{t("fin.even.need", { n: String(need) })}</span>
                            </span>
                        </>
                    )}
                </div>
                <div className="mt-2 flex h-2.5 gap-[3px]" aria-hidden="true">
                    {above ? (
                        <>
                            <span className="min-w-[6px] rounded-full bg-stone-900 dark:bg-stone-100" style={{ flexGrow: need }} />
                            {have > need && <span className="min-w-[6px] rounded-full" style={{ flexGrow: have - need, background: PROFIT_COLOR }} />}
                        </>
                    ) : (
                        <>
                            <span className="min-w-[6px] rounded-full" style={{ flexGrow: have, background: LOSS_COLOR }} />
                            <span className="min-w-[6px] rounded-full border border-dashed border-stone-400" style={{ flexGrow: need - have }} />
                        </>
                    )}
                </div>
                <p className="mt-2.5 text-left text-[12.5px] leading-relaxed text-muted" dir={dir}>
                    {t("fin.even.how", {
                        items: costItems.join(t("fin.even.item.and")),
                        left: money(even.leftPerOrder),
                        bill: money(even.dailyBill),
                        after: money(perOrder(statement.netProfit, statement.orders) ?? 0),
                    })}
                </p>
                {bulk && (
                    <p className="mt-1.5 text-left text-[12.5px] leading-relaxed text-muted" dir={dir} data-testid="break-even-bulk">
                        {t("fin.even.bulk", {
                            share: String(Math.round(bulk.share * 100)),
                            days: t("fin.even.bulk.days", { n: String(bulk.days), count: bulk.days }),
                        })}
                    </p>
                )}
            </div>
        );
    }

    return (
        <SummaryCard
            title={t("fin.costs.title")}
            sub={t("fin.costs.sub")}
            textDir={dir}
            testId="daily-costs"
            className="h-full"
            footer={
                <>
                    <Link href="/ads" className={CARD_LINK}>
                        {t("fin.detail.ads.open")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <button type="button" onClick={() => onOpenTab("expenses")} className={CARD_LINK} data-testid="daily-costs-expenses">
                        {t("fin.even.open")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </button>
                </>
            }
        >
            {brought === null ? (
                <p className={quiet} dir={dir} data-testid="ad-return-none">{t("fin.ads.none")}</p>
            ) : (
                <div data-testid="ad-return">
                    <span className={`${CARD_FIGURE} whitespace-nowrap tabular-nums`} dir="ltr" data-testid="ad-return-figure">
                        {formatWhole(brought)}
                        <span className="ml-1.5 text-[0.5em] font-medium tracking-normal opacity-60" dir={dir}>{t("fin.ads.unit")}</span>
                    </span>
                    <p className="mt-2.5 text-left text-[13.5px] leading-relaxed text-muted" dir={dir}>
                        {t("fin.ads.say", { sales: formatWhole(brought) })} {t("fin.ads.spent", { spent: money(spent) })}
                    </p>
                </div>
            )}
            <div className="mt-4 border-t border-[var(--card-border)] pt-4">{cover}</div>
        </SummaryCard>
    );
}
