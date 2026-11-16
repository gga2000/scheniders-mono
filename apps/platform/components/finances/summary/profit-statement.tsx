"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import {
    isComparablePeriod,
    lensChange,
    throughLens,
    waterfall,
    type CostLineId,
    type FinanceSummary,
    type Lens,
    type ProfitStatement as Statement,
} from "@/lib/finance/summary";
import { ChangeChip, isShownChange } from "./change-chip";
import { COST_COLORS } from "./colors";
import type { FinanceTab } from "./finance-tabs";
import { LensSwitch } from "./lens-switch";
import { Money, formatWhole } from "./money";
import { StatementDetail } from "./statement-detail";
import { SummaryCard } from "./summary-card";

interface ProfitStatementProps {
    summary: FinanceSummary;
    statement: Statement;
    /** The statement of the period before; null when no comparison is on (or it has not loaded). */
    previous: Statement | null;
    onOpenTab: (tab: FinanceTab) => void;
}

/** 12 / 3.4 / 0.2: one decimal only under ten, so the column stays short. */
function pct(share: number): string {
    const value = Math.abs(share) * 100;
    return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

const ROW = "grid w-full grid-cols-[190px_minmax(0,1fr)_minmax(104px,auto)_minmax(150px,auto)] items-center gap-x-[18px]";
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * The profit statement as a staircase: sales as one full bar, then each cost
 * biting its share off what the lines above left, down to the net profit as a
 * ruled total, the way a receipt ends (the dark strip above is the page's one
 * dark block). The switch re-reads every figure per order. A cost line opens
 * to show what is inside it; lines with nothing in them fold into one quiet
 * sentence. With a period to compare against, each
 * line carries an arrow beside its amount: the figure on screen against the
 * same figure before.
 */
export function ProfitStatement({ summary, statement, previous, onOpenTab }: ProfitStatementProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const reduceMotion = useReducedMotion();
    const [open, setOpen] = useState<CostLineId | null>(null);
    const [lens, setLens] = useState<Lens>("total");
    const steps = useMemo(() => new Map(waterfall(statement).map((step) => [step.id, step])), [statement]);

    const loss = statement.netProfit < 0;
    const perThousand = statement.margin === null ? null : Math.round(Math.abs(statement.margin) * 1000);
    const shown = statement.lines.filter((line) => line.amount !== 0);
    const empty = statement.lines.filter((line) => line.amount === 0);
    /** The change of a figure against the period before, through the chosen lens; null when it is not worth showing. */
    const change = (value: number, before: number | undefined) => {
        if (!previous || before === undefined || !isComparablePeriod(statement, previous)) return null;
        const pctChange = lensChange(value, statement, before, previous, lens);
        return isShownChange(pctChange) ? pctChange : null;
    };
    const salesChange = change(statement.sales, previous?.sales);
    const netChange = change(statement.netProfit, previous?.netProfit);
    const lineChanges = new Map(shown.map((line) => [line.id, change(line.amount, previous?.lines.find((l) => l.id === line.id)?.amount)]));
    const compared = salesChange !== null || netChange !== null || [...lineChanges.values()].some((value) => value !== null);
    /** A comparison is on, but the period before sold too little to be a fair base: say why no arrow shows. */
    const tooThinBefore = previous !== null && !isComparablePeriod(statement, previous);
    const compareNote = compared ? t("fin.statement.compare") : tooThinBefore ? t("fin.statement.noCompare") : null;
    /** A figure through the chosen lens; a dash when the lens has no base (no order delivered). */
    const amount = (value: number, className: string, options: { minus?: boolean; unitClassName?: string } = {}) => {
        const read = throughLens(value, statement, lens);
        if (read === null) return <span className={cn("text-right text-muted", className)}>—</span>;
        return <Money value={read} minus={options.minus} className={cn("text-right", className)} unitClassName={options.unitClassName} />;
    };

    return (
        <SummaryCard
            title={t("fin.statement.title")}
            sub={compareNote ? `${t("fin.statement.sub")} ${compareNote}` : t("fin.statement.sub")}
            textDir={dir}
            testId="profit-statement"
            action={<LensSwitch value={lens} onChange={setLens} />}
        >
            <div className={cn(ROW, "py-[11px]")} data-line="sales">
                <span className="text-left text-[15px] font-bold text-foreground" dir={dir}>{t("fin.line.sales")}</span>
                <span className="h-[30px] rounded-[9px] bg-stone-900 dark:bg-stone-100" />
                <span className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted" dir={dir}>
                    {t("fin.strip.sales.note", { n: formatWhole(statement.orders), count: statement.orders })}
                </span>
                <span className="flex items-baseline justify-end gap-3">
                    {salesChange !== null && (
                        <span data-change="sales">
                            <ChangeChip value={salesChange} surface="card" />
                        </span>
                    )}
                    {amount(statement.sales, "text-[20px] font-bold text-foreground")}
                </span>
            </div>

            {shown.map((line) => {
                const expanded = open === line.id;
                const step = steps.get(line.id);
                const lineChange = lineChanges.get(line.id) ?? null;
                return (
                    <div key={line.id} className="border-t border-[var(--card-border)]" data-line={line.id}>
                        <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : line.id)}
                            aria-expanded={expanded}
                            className={cn(ROW, "-mx-2 w-[calc(100%+16px)] rounded-xl px-2 py-[11px] text-left transition-colors hover:bg-[var(--background-soft)]")}
                        >
                            <span className="flex min-w-0 items-center gap-2.5">
                                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: COST_COLORS[line.id] }} aria-hidden="true" />
                                <span className="truncate text-[15px] font-medium text-foreground" dir={dir}>{t(`fin.line.${line.id}`)}</span>
                                <ChevronRight
                                    className={cn("size-3.5 shrink-0 text-muted transition-transform", expanded && "rotate-90")}
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="relative h-[30px]" aria-hidden="true">
                                {step && (
                                    <>
                                        <span
                                            className="absolute inset-y-0 left-0 rounded-[9px] bg-stone-500/10"
                                            style={{ width: `${(step.start + step.width) * 100}%` }}
                                        />
                                        <motion.span
                                            className="absolute inset-y-0 min-w-[6px] rounded-[9px]"
                                            style={{ background: COST_COLORS[line.id] }}
                                            initial={reduceMotion ? false : { left: `${(step.start + step.width) * 100}%`, width: "0%" }}
                                            animate={{ left: `${step.start * 100}%`, width: `${step.width * 100}%` }}
                                            transition={{ duration: 0.7, ease: EASE_OUT }}
                                        />
                                    </>
                                )}
                            </span>
                            <span className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted" dir={dir}>
                                {statement.sales > 0 ? t("fin.line.ofSales", { pct: pct(line.share) }) : ""}
                            </span>
                            <span className="flex items-baseline justify-end gap-3">
                                {lineChange !== null && (
                                    <span data-change={line.id}>
                                        <ChangeChip value={lineChange} lowerIsBetter surface="card" />
                                    </span>
                                )}
                                {amount(line.amount, "text-[18px] font-semibold text-foreground", { minus: true })}
                            </span>
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
                                    <StatementDetail line={line} summary={summary} onOpenTab={onOpenTab} averaged={lens !== "total"} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            {empty.length > 0 && (
                <div
                    className="flex items-center gap-4 border-t border-[var(--card-border)] pb-1 pt-3 text-[13.5px] text-muted"
                    data-testid="statement-quiet"
                >
                    <span className="min-w-0 flex-1 text-left" dir={dir}>
                        {t("fin.statement.none", { lines: empty.map((line) => t(`fin.line.${line.id}`)).join(language === "ar" ? "، " : ", ") })}{" "}
                        <span className="font-medium text-foreground">{t("fin.statement.noneMeans")}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => onOpenTab("expenses")}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current"
                    >
                        {t("fin.statement.addExpense")}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </button>
                </div>
            )}

            <div className="mt-3 flex items-end justify-between gap-6 border-t-2 border-foreground pt-4" data-line="net">
                <div className="min-w-0">
                    <div className="text-left text-[17px] font-bold text-foreground" dir={dir}>{t("fin.line.net")}</div>
                    <p className="mt-1 text-left text-[13.5px] leading-relaxed text-muted" dir={dir} data-testid="statement-plain">
                        {statement.margin !== null && `${t("fin.line.ofSales", { pct: pct(statement.margin) })}. `}
                        {perThousand !== null && t(loss ? "fin.statement.lose" : "fin.statement.keep", { n: formatWhole(perThousand) })}
                    </p>
                </div>
                <span className="flex shrink-0 items-baseline gap-3">
                    {netChange !== null && (
                        <span data-change="net">
                            <ChangeChip value={netChange} surface="card" />
                        </span>
                    )}
                    {amount(
                        statement.netProfit,
                        cn(
                            "text-[30px] font-bold leading-none tracking-[-0.02em]",
                            loss ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                        ),
                    )}
                </span>
            </div>
        </SummaryCard>
    );
}
