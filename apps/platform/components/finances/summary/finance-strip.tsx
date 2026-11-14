"use client";

import Link from "next/link";
import type { Format } from "@number-flow/react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NumberTicker } from "@/components/ui/number-ticker";
import { useLanguage } from "@/hooks/use-language";
import { changePct, perOrder, type FinanceSummary, type ProfitStatement } from "@/lib/finance/summary";
import { ChangeChip, isShownChange } from "./change-chip";
import { StripCell } from "./strip-cell";
import { formatWhole } from "./money";

interface FinanceStripProps {
    summary: FinanceSummary;
    statement: ProfitStatement;
    /** The same figures for the period before; null when no comparison is on (or it has not loaded). */
    previous: { summary: FinanceSummary; statement: ProfitStatement } | null;
}

const WHOLE: Format = { maximumFractionDigits: 0 };
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function adSpend(statement: ProfitStatement): number {
    return statement.lines.find((l) => l.id === "ads")?.amount ?? 0;
}

/**
 * The dark strip that opens the Finances page: net profit, large and in lime,
 * then the five figures a merchant checks next. It borrows the look of the
 * orders bar (dark, rolling numbers) and is its own component, so the approved
 * orders bar is untouched.
 */
export function FinanceStrip({ summary, statement, previous }: FinanceStripProps) {
    const { t } = useLanguage();
    const reduceMotion = useReducedMotion();
    const unit = <span className="ms-1.5 text-[0.5em] font-medium text-stone-400">{t("common.iqd")}</span>;
    const iqd = (n: number) => (
        <span dir="ltr">
            <NumberTicker value={Math.round(n)} format={WHOLE} />
            {unit}
        </span>
    );

    const orders = statement.orders;
    const profitPerOrder = perOrder(statement.netProfit, orders);
    const adPerOrder = perOrder(adSpend(statement), orders);
    const adPerOrderBefore = previous ? perOrder(adSpend(previous.statement), previous.statement.orders) : null;
    const stuck = summary.cash.stuck;
    const loss = statement.netProfit < 0;
    const netChange = previous ? changePct(statement.netProfit, previous.statement.netProfit) : null;

    return (
        <section
            aria-label={t("fin.strip.label")}
            className="flex items-stretch rounded-2xl bg-stone-900 px-6 py-5 text-stone-50 shadow-lg shadow-black/10 ring-1 ring-white/5 dark:bg-[#1d1c1a] dark:ring-white/10"
            data-testid="finance-strip"
        >
            <motion.div
                className="shrink-0 pe-7"
                title={t("fin.strip.net.hint")}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
            >
                <div className="text-[13px] text-stone-400">{t("fin.strip.net")}</div>
                <div
                    className={cn(
                        "mt-1 whitespace-nowrap text-[42px] font-semibold leading-none tracking-[-0.03em] tabular-nums",
                        loss ? "text-rose-400" : "text-[#dcfb3a]",
                    )}
                    data-stat="net_profit"
                    dir="ltr"
                >
                    <NumberTicker value={Math.round(statement.netProfit)} format={WHOLE} />
                    <span className="ms-2 text-[15px] font-medium tracking-normal text-stone-400">{t("common.iqd")}</span>
                </div>
                <div className="mt-2 flex min-h-[18px] items-center gap-2 text-[12px] text-stone-400">
                    {isShownChange(netChange) && (
                        <>
                            <ChangeChip value={netChange} />
                            <span>{t("fin.strip.vsBefore")}</span>
                        </>
                    )}
                </div>
            </motion.div>

            <div className="grid min-w-0 flex-1 grid-cols-5 items-center">
                <StripCell
                    order={1}
                    testId="sales"
                    label={t("fin.strip.sales")}
                    hint={t("fin.strip.sales.hint")}
                    value={iqd(statement.sales)}
                    change={previous ? changePct(statement.sales, previous.statement.sales) : null}
                    note={t("fin.strip.sales.note", { n: formatWhole(orders) })}
                />
                <StripCell
                    order={2}
                    testId="profit_per_order"
                    label={t("fin.strip.perOrder")}
                    hint={t("fin.strip.perOrder.hint")}
                    value={profitPerOrder === null ? "—" : iqd(profitPerOrder)}
                />
                <StripCell
                    order={3}
                    testId="ad_per_order"
                    label={t("fin.strip.adPerOrder")}
                    hint={t("fin.strip.adPerOrder.hint")}
                    value={adPerOrder === null ? "—" : iqd(adPerOrder)}
                    change={adPerOrder === null ? null : changePct(adPerOrder, adPerOrderBefore)}
                    lowerIsBetter
                />
                <StripCell
                    order={4}
                    testId="on_road"
                    label={t("fin.strip.onRoad")}
                    hint={t("fin.strip.onRoad.hint")}
                    value={iqd(summary.cash.in_transit.amount)}
                    note={t("fin.strip.onRoad.note", { n: formatWhole(summary.cash.in_transit.count) })}
                />
                <StripCell
                    order={5}
                    testId="stuck"
                    label={t("fin.strip.stuck")}
                    hint={t("fin.strip.stuck.hint")}
                    value={
                        <span className={stuck.count > 0 ? "text-amber-300" : undefined}>
                            <NumberTicker value={stuck.count} format={WHOLE} />
                        </span>
                    }
                    note={
                        stuck.count > 0 ? (
                            <Link href="/orders?status=in_transit" className="underline decoration-white/25 underline-offset-2 hover:text-stone-200">
                                <span dir="ltr">{formatWhole(stuck.amount)} {t("common.iqd")}</span>
                            </Link>
                        ) : null
                    }
                />
            </div>
        </section>
    );
}
