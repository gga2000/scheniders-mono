"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { CostLineId, FinanceSummary, ProfitStatement as Statement } from "@/lib/finance/summary";
import { COST_COLORS, LOSS_COLOR, PROFIT_COLOR } from "./colors";
import type { FinanceTab } from "./finance-tabs";
import { Money, formatWhole } from "./money";
import { StatementDetail } from "./statement-detail";
import { SummaryCard } from "./summary-card";

interface ProfitStatementProps {
    summary: FinanceSummary;
    statement: Statement;
    onOpenTab: (tab: FinanceTab) => void;
}

/** 12 / 3.4 / 0.2: one decimal only under ten, so the column stays short. */
function pct(share: number): string {
    const value = Math.abs(share) * 100;
    return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

const ROW = "grid w-full grid-cols-[minmax(150px,1.1fr)_minmax(120px,2fr)_minmax(96px,auto)_minmax(132px,auto)] items-center gap-x-4";

/**
 * The profit statement: sales on top, one line per cost with a bar showing its
 * share of sales, and net profit at the bottom. A cost line opens to show what
 * is inside it.
 */
export function ProfitStatement({ summary, statement, onOpenTab }: ProfitStatementProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [open, setOpen] = useState<CostLineId | null>(null);
    const loss = statement.netProfit < 0;
    const perThousand = statement.margin === null ? null : Math.round(Math.abs(statement.margin) * 1000);

    return (
        <SummaryCard title={t("fin.statement.title")} sub={t("fin.statement.sub")} textDir={dir} testId="profit-statement">
            <div className={cn(ROW, "py-2.5")} data-line="sales">
                <span className="ps-7 text-left text-[14.5px] font-semibold text-foreground" dir={dir}>{t("fin.line.sales")}</span>
                <span className="h-2.5 rounded-full bg-stone-800 dark:bg-stone-200" />
                <span />
                <Money value={statement.sales} className="text-right text-[15px] font-semibold text-foreground" />
            </div>

            {statement.lines.map((line) => {
                const expanded = open === line.id;
                const width = Math.min(Math.abs(line.share), 1) * 100;
                return (
                    <div key={line.id} className="border-t border-[var(--card-border)]" data-line={line.id}>
                        <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : line.id)}
                            aria-expanded={expanded}
                            className={cn(ROW, "rounded-lg py-2.5 text-left transition-colors hover:bg-[var(--background-soft)]")}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <ChevronRight
                                    className={cn("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-90")}
                                    aria-hidden="true"
                                />
                                <span className="size-2 shrink-0 rounded-full" style={{ background: COST_COLORS[line.id] }} aria-hidden="true" />
                                <span className="truncate text-[14.5px] text-foreground" dir={dir}>{t(`fin.line.${line.id}`)}</span>
                            </span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-[var(--background-soft)]">
                                <motion.span
                                    className="block h-full rounded-full"
                                    style={{ background: COST_COLORS[line.id] }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${width}%` }}
                                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                />
                            </span>
                            <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums text-muted" dir={dir}>
                                {line.amount === 0 || statement.sales <= 0 ? "" : t("fin.line.ofSales", { pct: pct(line.share) })}
                            </span>
                            <Money
                                value={line.amount}
                                minus
                                className={cn("text-right text-[15px] font-medium", line.amount === 0 ? "text-muted" : "text-foreground")}
                            />
                        </button>
                        <AnimatePresence initial={false}>
                            {expanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <StatementDetail line={line} summary={summary} onOpenTab={onOpenTab} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            <div className={cn(ROW, "mt-1 border-t-2 border-foreground/80 pt-4")} data-line="net">
                <span className="ps-7 text-left text-[16px] font-semibold text-foreground" dir={dir}>{t("fin.line.net")}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[var(--background-soft)]">
                    <motion.span
                        className="block h-full rounded-full"
                        style={{ background: loss ? LOSS_COLOR : PROFIT_COLOR }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(Math.abs(statement.margin ?? 0), 1) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                </span>
                <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums text-muted" dir={dir}>
                    {statement.margin === null ? "" : t("fin.line.ofSales", { pct: pct(statement.margin) })}
                </span>
                <Money
                    value={statement.netProfit}
                    className={cn("text-right text-[19px] font-semibold", loss ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}
                    unitClassName="opacity-70"
                />
            </div>
            {perThousand !== null && (
                <p
                    className={cn(
                        "mt-3 ps-7 text-left text-[13.5px] leading-relaxed",
                        loss ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300",
                    )}
                    dir={dir}
                    data-testid="statement-plain"
                >
                    {t(loss ? "fin.statement.lose" : "fin.statement.keep", { n: formatWhole(perThousand) })}
                </p>
            )}
        </SummaryCard>
    );
}
