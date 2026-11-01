"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Receipt, TrendingUp, TrendingDown, Calendar, Tag, Repeat,
    Plus, AlertCircle, Download, Wallet,
} from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { useLanguage } from "@/hooks/use-language";
import { useExpenseCategoryLabel } from "@/hooks/use-expense-category-label";
import { supabase } from "@/lib/supabase";
import {
    Expense, ExpenseCategory,
    expenseCategoryColors, isAutoExpense,
} from "@/types/expense";
import { ExpenseFormModal, type ExpenseFormData } from "@/components/finances/expense-form-modal";
import { ExpenseList } from "@/components/finances/expense-list";
import { ExpenseBreakdown } from "@/components/finances/expense-breakdown";
import { SectionCard } from "@/components/finances/hub/primitives/section-card";
import { FinanceValue } from "@/components/finances/hub/primitives/finance-value";
import { Delta } from "@/components/finances/hub/primitives/delta";
import { Sparkline } from "@/components/finances/hub/primitives/sparkline";
import type { FinancePeriod } from "@/hooks/use-finance-period";
import { cn } from "@/lib/utils";
import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";

interface ExpensesTabProps {
    period: FinancePeriod;
    comparePeriod: { start: Date; end: Date } | null;
    dateRangeStrings: { startDate: string; endDate: string };
}

function fmtDate(d: Date): string {
    return baghdadDayKey(d);
}

function diffDays(a: Date, b: Date): number {
    return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

export function ExpensesTab({ period, comparePeriod, dateRangeStrings }: ExpensesTabProps) {
    const { t } = useLanguage();
    const categoryLabel = useExpenseCategoryLabel();
    const { expenses, loading, addExpense, updateExpense, deleteExpense } = useExpenses({
        startDate: dateRangeStrings.startDate,
        endDate: dateRangeStrings.endDate,
    });

    const [prevExpenses, setPrevExpenses] = useState<Expense[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Expense | null>(null);

    // Fetch previous-period expenses for comparison
    const prevStartDay = comparePeriod ? fmtDate(comparePeriod.start) : null;
    const prevEndDay = comparePeriod ? fmtDate(comparePeriod.end) : null;
    useEffect(() => {
        if (!prevStartDay || !prevEndDay) return;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("expenses")
                .select("*")
                .gte("expense_date", prevStartDay)
                .lte("expense_date", prevEndDay);
            if (!cancelled && !error) setPrevExpenses(data || []);
        })();
        return () => { cancelled = true; };
    }, [prevStartDay, prevEndDay]);

    const periodStartDay = baghdadDayKey(period.start);
    const periodEndDay = baghdadDayKey(period.end);

    const totals = useMemo(() => {
        const current = expenses.reduce((s, e) => s + e.amount, 0);
        const prev = prevStartDay ? prevExpenses.reduce((s, e) => s + e.amount, 0) : 0;
        const days = diffDays(period.start, period.end);
        const dailyAvg = current / days;

        const byCategory: Record<ExpenseCategory, number> = {
            product_cost: 0, packaging: 0, sample_vial: 0,
            sample_perfume: 0, thank_you_cards: 0, sweets: 0,
            marketing: 0, shipping: 0, other: 0,
        };
        expenses.forEach((e) => { byCategory[e.category] += e.amount; });

        const sortedCats = (Object.keys(byCategory) as ExpenseCategory[])
            .map((c) => ({ category: c, amount: byCategory[c] }))
            .sort((a, b) => b.amount - a.amount);

        const top = sortedCats[0] && sortedCats[0].amount > 0 ? sortedCats[0] : null;
        const topShare = top && current > 0 ? (top.amount / current) * 100 : 0;

        return {
            current, prev, dailyAvg, byCategory,
            sortedCategories: sortedCats,
            topCategory: top,
            topShare,
            count: expenses.length,
            days,
        };
    }, [expenses, prevExpenses, prevStartDay, period.start, period.end]);

    // Daily series for sparkline
    const dailySeries = useMemo(() => {
        const buckets = new Map<string, number>();
        expenses.forEach((e) => {
            buckets.set(e.expense_date, (buckets.get(e.expense_date) ?? 0) + e.amount);
        });
        const out: number[] = [];
        for (let day = periodStartDay; day <= periodEndDay; day = addDaysToDayKey(day, 1)) {
            out.push(buckets.get(day) ?? 0);
        }
        return out;
    }, [expenses, periodStartDay, periodEndDay]);

    // Recurring detection: explicitly flagged + repeated patterns
    const recurringGroups = useMemo(() => {
        type Row = {
            key: string;
            description: string;
            category: ExpenseCategory;
            occurrences: number;
            totalSpent: number;
            lastDate: string;
            isFlagged: boolean;
        };

        const map = new Map<string, Row>();
        expenses.forEach((e) => {
            const desc = (e.description || categoryLabel(e.category)).trim().toLowerCase();
            const key = `${e.category}::${desc}`;
            const prev = map.get(key);
            if (prev) {
                prev.occurrences += 1;
                prev.totalSpent += e.amount;
                if (e.expense_date > prev.lastDate) prev.lastDate = e.expense_date;
                if (e.is_recurring) prev.isFlagged = true;
            } else {
                map.set(key, {
                    key,
                    description: e.description || categoryLabel(e.category),
                    category: e.category,
                    occurrences: 1,
                    totalSpent: e.amount,
                    lastDate: e.expense_date,
                    isFlagged: e.is_recurring,
                });
            }
        });

        return Array.from(map.values())
            .filter((r) => r.isFlagged || r.occurrences >= 2)
            .sort((a, b) => b.totalSpent - a.totalSpent);
    }, [expenses, categoryLabel]);

    const handleSubmit = async (data: ExpenseFormData) => {
        const saved = editing ? await updateExpense(editing.id, data) : (await addExpense(data)) !== null;
        // Throwing keeps the form open with what was typed; the hook already showed the error.
        if (!saved) throw new Error(t("finances.expense.saveFailed"));
        setEditing(null);
        setModalOpen(false);
    };

    const handleEdit = (expense: Expense) => {
        if (isAutoExpense(expense)) return;
        setEditing(expense);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (expenses.some((e) => e.id === id && isAutoExpense(e))) return;
        if (!confirm(t("finances.expense.confirmDelete"))) return;
        await deleteExpense(id);
    };

    const handleExport = () => {
        const rows = [
            [
                t("finances.expense.csv.date"), t("finances.expense.csv.category"),
                t("finances.expense.csv.description"), t("finances.expense.csv.amount"),
                t("finances.expense.csv.recurring"), t("finances.expense.csv.notes"),
            ],
            ...expenses.map((e) => [
                e.expense_date,
                categoryLabel(e.category),
                e.description ?? "",
                e.amount.toString(),
                e.is_recurring ? t("finances.expense.csv.yes") : t("finances.expense.csv.no"),
                (e.notes ?? "").replace(/[\n\r]/g, " "),
            ]),
        ];
        const csv = rows
            .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `expenses_${dateRangeStrings.startDate}_to_${dateRangeStrings.endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading && expenses.length === 0) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 animate-pulse">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-[140px] rounded-2xl bg-[var(--card-bg)]" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Action bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{t("finances.expense.ledger")}</h2>
                    <p className="text-xs text-muted">
                        {t(totals.count === 1 ? "finances.expense.entryCountOne" : "finances.expense.entryCount", { count: totals.count, days: totals.days })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        disabled={expenses.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:border-[var(--ink)] transition-colors disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        {t("finances.expense.exportCsv")}
                    </button>
                    <button
                        onClick={() => { setEditing(null); setModalOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[var(--ink)] text-white hover:opacity-90 transition-opacity"
                    >
                        <Plus className="w-4 h-4" />
                        {t("finances.expense.add")}
                    </button>
                </div>
            </div>

            {/* Summary strip */}
            <ExpensesSummaryStrip
                total={totals.current}
                prev={totals.prev}
                dailyAvg={totals.dailyAvg}
                count={totals.count}
                topCategory={totals.topCategory}
                topShare={totals.topShare}
                recurringCount={recurringGroups.length}
                series={dailySeries}
            />

            {expenses.length === 0 ? (
                <SectionCard
                    icon={Receipt}
                    accent="amber"
                    title={t("finances.expense.emptyTitle")}
                    subtitle={t("finances.expense.emptySub")}
                >
                    <div className="text-center py-8">
                        <p className="text-sm text-muted mb-4 max-w-md mx-auto">
                            {t("finances.expense.emptyBody")}
                        </p>
                        <button
                            onClick={() => { setEditing(null); setModalOpen(true); }}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--ink)] text-white hover:opacity-90"
                        >
                            <Plus className="w-4 h-4" />
                            {t("finances.expense.logFirst")}
                        </button>
                    </div>
                </SectionCard>
            ) : (
                <>
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                        <div className="xl:col-span-3">
                            <SectionCard
                                icon={Tag}
                                accent="violet"
                                title={t("finances.expense.whereTitle")}
                                subtitle={t("finances.expense.whereSub")}
                            >
                                <ExpenseBreakdown data={totals.byCategory} />
                            </SectionCard>
                        </div>
                        <div className="xl:col-span-2">
                            <CategoryShareCard
                                sorted={totals.sortedCategories}
                                total={totals.current}
                            />
                        </div>
                    </div>

                    {recurringGroups.length > 0 && (
                        <RecurringRadar groups={recurringGroups} />
                    )}

                    {totals.topCategory && totals.topShare > 50 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3"
                        >
                            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-[13px]">
                                <span className="font-semibold text-amber-700 dark:text-amber-300">
                                    {t("finances.expense.concentration", { category: categoryLabel(totals.topCategory.category), pct: totals.topShare.toFixed(0) })}
                                </span>{" "}
                                <span className="text-muted">
                                    {t("finances.expense.concentrationHint")}
                                </span>
                            </div>
                        </motion.div>
                    )}

                    <SectionCard
                        icon={Receipt}
                        accent="slate"
                        title={t("finances.expense.allTitle")}
                        subtitle={t("finances.expense.allSub")}
                    >
                        <ExpenseList
                            expenses={expenses}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    </SectionCard>
                </>
            )}

            <ExpenseFormModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditing(null); }}
                onSubmit={handleSubmit}
                expense={editing}
                mode={editing ? "edit" : "add"}
            />
        </div>
    );
}

// =============================
// Summary Strip
// =============================
interface SummaryStripProps {
    total: number;
    prev: number;
    dailyAvg: number;
    count: number;
    topCategory: { category: ExpenseCategory; amount: number } | null;
    topShare: number;
    recurringCount: number;
    series: number[];
}

function ExpensesSummaryStrip({
    total, prev, dailyAvg, count, topCategory, topShare, recurringCount, series,
}: SummaryStripProps) {
    const { t } = useLanguage();
    const categoryLabel = useExpenseCategoryLabel();
    const trend = prev > 0 ? ((total - prev) / prev) * 100 : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
        >
            {/* Total Spent */}
            <div className="relative rounded-2xl border p-4 overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg("rose"))}>
                        <Receipt className={cn("w-4 h-4", accentText("rose"))} />
                    </div>
                    {trend !== null && <Delta value={trend} size="sm" inverse />}
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("finances.expense.kpi.total")}</div>
                <div className="mt-1">
                    <FinanceValue value={total} currency="IQD" abbreviate
                        className={cn("text-[22px] leading-none", accentText("rose"))} />
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                    {t(count === 1 ? "finances.expense.entryShortOne" : "finances.expense.entriesShort", { count })}
                </div>
                {series.length > 0 && (
                    <div className={cn("mt-2 -mb-1", accentText("rose"))}>
                        <Sparkline data={series} width={180} height={22}
                            stroke="currentColor" fill={accentFill("rose")} />
                    </div>
                )}
            </div>

            {/* vs Previous */}
            <div className="relative rounded-2xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg("violet"))}>
                        {prev > total
                            ? <TrendingDown className={cn("w-4 h-4", accentText("violet"))} />
                            : <TrendingUp className={cn("w-4 h-4", accentText("violet"))} />}
                    </div>
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("finances.expense.kpi.prev")}</div>
                <div className="mt-1">
                    <FinanceValue value={prev} currency="IQD" abbreviate
                        className={cn("text-[22px] leading-none", accentText("violet"))} />
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                    {prev > 0 ? t("finances.expense.kpi.sameWindow") : t("finances.expense.kpi.noPrior")}
                </div>
            </div>

            {/* Daily Burn */}
            <div className="relative rounded-2xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg("amber"))}>
                        <Calendar className={cn("w-4 h-4", accentText("amber"))} />
                    </div>
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("finances.expense.kpi.burn")}</div>
                <div className="mt-1">
                    <FinanceValue value={dailyAvg} currency="IQD" abbreviate
                        className={cn("text-[22px] leading-none", accentText("amber"))} />
                </div>
                <div className="text-[11px] text-muted mt-1">{t("finances.expense.kpi.perDay")}</div>
            </div>

            {/* Top Category */}
            <div className="relative rounded-2xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-2">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                            backgroundColor: topCategory
                                ? `${expenseCategoryColors[topCategory.category]}20`
                                : undefined,
                        }}
                    >
                        <Tag
                            className="w-4 h-4"
                            style={{
                                color: topCategory
                                    ? expenseCategoryColors[topCategory.category]
                                    : undefined,
                            }}
                        />
                    </div>
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("finances.expense.kpi.top")}</div>
                <div className="mt-1">
                    <FinanceValue
                        value={topCategory?.amount ?? 0}
                        currency="IQD"
                        abbreviate
                        className="text-[22px] leading-none text-foreground"
                    />
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                    {topCategory
                        ? <bdi>{`${categoryLabel(topCategory.category)} · ${topShare.toFixed(0)}%`}</bdi>
                        : "—"}
                </div>
            </div>

            {/* Recurring */}
            <div className="relative rounded-2xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg("emerald"))}>
                        <Repeat className={cn("w-4 h-4", accentText("emerald"))} />
                    </div>
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("finances.expense.kpi.recurring")}</div>
                <div className="mt-1">
                    <span className="text-[22px] leading-none font-bold tabular-nums text-foreground">
                        {recurringCount}
                    </span>
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                    {recurringCount === 0
                        ? t("finances.expense.kpi.none")
                        : recurringCount === 1
                            ? t("finances.expense.kpi.patternOne")
                            : t("finances.expense.kpi.patterns", { count: recurringCount })}
                </div>
            </div>
        </motion.div>
    );
}

// =============================
// Category Share Card
// =============================
function CategoryShareCard({
    sorted,
    total,
}: {
    sorted: { category: ExpenseCategory; amount: number }[];
    total: number;
}) {
    const { t } = useLanguage();
    const categoryLabel = useExpenseCategoryLabel();
    const visible = sorted.filter((c) => c.amount > 0).slice(0, 6);

    return (
        <SectionCard
            icon={Wallet}
            accent="emerald"
            title={t("finances.expense.share.title")}
            subtitle={t("finances.expense.share.sub")}
        >
            <div className="space-y-3">
                {visible.length === 0 ? (
                    <p className="text-sm text-muted text-center py-8">{t("finances.expense.share.empty")}</p>
                ) : (
                    visible.map((row) => {
                        const pct = total > 0 ? (row.amount / total) * 100 : 0;
                        const color = expenseCategoryColors[row.category];
                        return (
                            <div key={row.category}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="text-[13px] text-foreground truncate">
                                            {categoryLabel(row.category)}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-2 shrink-0">
                                        <FinanceValue
                                            value={row.amount}
                                            currency="IQD"
                                            abbreviate
                                            compact
                                            className="text-[13px] text-foreground"
                                        />
                                        <span className="text-[11px] text-muted tabular-nums">
                                            {pct.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, pct)}%` }}
                                        transition={{ duration: 0.6, ease: "easeOut" }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: color }}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </SectionCard>
    );
}

// =============================
// Recurring Radar
// =============================
interface RecurringRow {
    key: string;
    description: string;
    category: ExpenseCategory;
    occurrences: number;
    totalSpent: number;
    lastDate: string;
    isFlagged: boolean;
}

function RecurringRadar({ groups }: { groups: RecurringRow[] }) {
    const { t } = useLanguage();
    const top = groups.slice(0, 6);

    return (
        <SectionCard
            icon={Repeat}
            accent="cyan"
            title={t("finances.expense.radar.title")}
            subtitle={t("finances.expense.radar.sub")}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {top.map((row) => (
                    <div
                        key={row.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${expenseCategoryColors[row.category]}20` }}
                            >
                                <Repeat
                                    className="w-4 h-4"
                                    style={{ color: expenseCategoryColors[row.category] }}
                                />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {row.description}
                                    </p>
                                    {row.isFlagged && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                                            {t("finances.expense.radar.flagged")}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted">
                                    {t("finances.expense.radar.last", { count: row.occurrences, date: row.lastDate })}
                                </p>
                            </div>
                        </div>
                        <FinanceValue
                            value={row.totalSpent}
                            currency="IQD"
                            abbreviate
                            compact
                            className="text-sm text-foreground shrink-0"
                        />
                    </div>
                ))}
            </div>
            {groups.length > top.length && (
                <p className="text-[11px] text-muted text-center mt-3">
                    {groups.length - top.length === 1
                        ? t("finances.expense.radar.moreOne")
                        : t("finances.expense.radar.more", { count: groups.length - top.length })}
                </p>
            )}
        </SectionCard>
    );
}

// =============================
// Helpers
// =============================
function accentBg(a: string): string {
    switch (a) {
        case "emerald": return "bg-emerald-500/10";
        case "rose": return "bg-rose-500/10";
        case "amber": return "bg-amber-500/10";
        case "violet": return "bg-violet-500/10";
        case "cyan": return "bg-cyan-500/10";
        default: return "bg-slate-500/10";
    }
}
function accentText(a: string): string {
    switch (a) {
        case "emerald": return "text-emerald-600 dark:text-emerald-400";
        case "rose": return "text-rose-600 dark:text-rose-400";
        case "amber": return "text-amber-600 dark:text-amber-400";
        case "violet": return "text-violet-600 dark:text-violet-400";
        case "cyan": return "text-cyan-600 dark:text-cyan-400";
        default: return "text-slate-600 dark:text-slate-400";
    }
}
function accentFill(a: string): string {
    switch (a) {
        case "emerald": return "rgba(16,185,129,0.14)";
        case "rose": return "rgba(244,63,94,0.14)";
        case "amber": return "rgba(245,158,11,0.14)";
        case "violet": return "rgba(139,92,246,0.14)";
        case "cyan": return "rgba(6,182,212,0.14)";
        default: return "rgba(100,116,139,0.12)";
    }
}
