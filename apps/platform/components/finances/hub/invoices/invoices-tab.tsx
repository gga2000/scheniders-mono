"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    ArrowDownToLine, ArrowUpFromLine, AlertCircle,
    Search, ExternalLink, Receipt, Inbox,
} from "lucide-react";
import type { Order } from "@/lib/supabase";
import type { Expense, ExpenseCategory } from "@/types/expense";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useExpenseCategoryLabel } from "@/hooks/use-expense-category-label";
import { isRealizedRevenue } from "@/lib/order-revenue";
import type { FinancePeriod } from "@/hooks/use-finance-period";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";

const PENDING_STATUSES = new Set(["confirmed", "in_transit", "out_for_delivery"]);

interface Props {
    orders: Order[];
    expenses: Expense[];
    period: FinancePeriod;
}

interface ARRow {
    orderId: string;
    id: string;
    customerName: string;
    phone: string;
    city?: string;
    amount: number;
    status: string;
    daysOpen: number;
    bucket: "0-7" | "8-14" | "15-30" | "31-60" | "60+";
}

export function InvoicesTab({ orders, expenses, period }: Props) {

    const ar = useMemo<{
        rows: ARRow[];
        totalOpen: number;
        buckets: Record<ARRow["bucket"], { count: number; value: number }>;
    }>(() => {
        const rows: ARRow[] = [];
        const now = Date.now();
        for (const o of orders) {
            if (!PENDING_STATUSES.has(o.status)) continue;
            const created = o.created_at ? new Date(o.created_at).getTime() : now;
            const days = Math.max(0, Math.floor((now - created) / 86400000));
            const bucket: ARRow["bucket"] =
                days <= 7 ? "0-7"
                    : days <= 14 ? "8-14"
                        : days <= 30 ? "15-30"
                            : days <= 60 ? "31-60"
                                : "60+";
            rows.push({
                orderId: o.order_id,
                id: o.id,
                customerName: o.customer_name,
                phone: o.phone,
                city: o.city,
                amount: Number(o.price) || 0,
                status: o.status,
                daysOpen: days,
                bucket,
            });
        }
        rows.sort((a, b) => b.daysOpen - a.daysOpen);

        const buckets = {
            "0-7": { count: 0, value: 0 },
            "8-14": { count: 0, value: 0 },
            "15-30": { count: 0, value: 0 },
            "31-60": { count: 0, value: 0 },
            "60+": { count: 0, value: 0 },
        } as Record<ARRow["bucket"], { count: number; value: number }>;
        for (const r of rows) {
            buckets[r.bucket].count += 1;
            buckets[r.bucket].value += r.amount;
        }

        return {
            rows,
            totalOpen: rows.reduce((s, r) => s + r.amount, 0),
            buckets,
        };
    }, [orders]);

    const ap = useMemo(() => {
        const rows = expenses.map(e => ({
            id: e.id,
            date: e.expense_date,
            category: e.category,
            description: e.description || e.notes || "",
            amount: e.amount,
            isRecurring: e.is_recurring,
        })).sort((a, b) => b.date.localeCompare(a.date));
        const total = rows.reduce((s, r) => s + r.amount, 0);
        return { rows, total };
    }, [expenses]);

    const periodRevenue = useMemo(() => {
        const start = period.start.getTime();
        const end = period.end.getTime();
        let v = 0;
        for (const o of orders) {
            const placedAt = o.created_at ? new Date(o.created_at).getTime() : 0;
            if (placedAt < start || placedAt > end) continue;
            if (!isRealizedRevenue(o)) continue;
            v += Number(o.price) || 0;
        }
        return v;
    }, [orders, period.start, period.end]);

    return (
        <div className="space-y-5">
            <KpiStrip
                outboundCount={ap.rows.length}
                outboundValue={ap.total}
                inboundCount={ar.rows.length}
                inboundValue={ar.totalOpen}
                receiptsValue={periodRevenue}
                overdueValue={ar.buckets["31-60"].value + ar.buckets["60+"].value}
            />

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-3">
                    <ARTable rows={ar.rows} />
                </div>
                <div className="xl:col-span-2">
                    <ARAgingCard buckets={ar.buckets} totalValue={ar.totalOpen} />
                </div>
            </div>

            <APInvoicesCard rows={ap.rows} />
        </div>
    );
}

function KpiStrip({
    outboundCount, outboundValue,
    inboundCount, inboundValue,
    receiptsValue, overdueValue,
}: {
    outboundCount: number; outboundValue: number;
    inboundCount: number; inboundValue: number;
    receiptsValue: number; overdueValue: number;
}) {
    const { t } = useLanguage();
    const tiles = [
        { label: t("finances.invoices.kpi.out"), icon: ArrowDownToLine, value: outboundValue, sub: t("finances.invoices.kpi.outSub", { count: outboundCount }), tone: "amber" as const },
        { label: t("finances.invoices.kpi.in"), icon: ArrowUpFromLine, value: inboundValue, sub: t("finances.invoices.kpi.inSub", { count: inboundCount }), tone: "violet" as const },
        { label: t("finances.invoices.kpi.receipts"), icon: Receipt, value: receiptsValue, sub: t("finances.invoices.kpi.inPeriod"), tone: "emerald" as const },
        { label: t("finances.invoices.kpi.overdue"), icon: AlertCircle, value: overdueValue, sub: t("finances.invoices.kpi.attention"), tone: overdueValue > 0 ? "rose" as const : "slate" as const },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((tile, i) => {
                const Icon = tile.icon;
                const ring = tile.tone === "emerald" ? "ring-emerald-500/20"
                    : tile.tone === "violet" ? "ring-violet-500/20"
                        : tile.tone === "amber" ? "ring-amber-500/20"
                            : tile.tone === "rose" ? "ring-rose-500/20"
                                : "ring-[var(--card-border)]";
                const iconClr = tile.tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : tile.tone === "violet" ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
                        : tile.tone === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            : tile.tone === "rose" ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                                : "text-slate-600 dark:text-slate-400 bg-slate-500/10";
                return (
                    <motion.div
                        key={tile.label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={cn(
                            "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 ring-1",
                            ring
                        )}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", iconClr)}>
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{tile.label}</div>
                        </div>
                        <FinanceValue value={tile.value} abbreviate className="text-2xl font-bold text-foreground tabular-nums block" />
                        <div className="text-[10.5px] text-muted">{tile.sub}</div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function ARTable({ rows }: { rows: ARRow[] }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const [query, setQuery] = useState("");
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(() => {
        if (!query) return rows;
        const q = query.toLowerCase();
        return rows.filter(r =>
            r.customerName.toLowerCase().includes(q) ||
            r.phone.includes(q) ||
            r.orderId.toLowerCase().includes(q) ||
            (r.city || "").toLowerCase().includes(q)
        );
    }, [rows, query]);

    const visible = showAll ? filtered : filtered.slice(0, 12);

    return (
        <SectionCard
            title={t("finances.invoices.ar.title")}
            subtitle={rows.length === 0 ? t("finances.invoices.ar.none") : rows.length === 1 ? t("finances.invoices.ar.subOne") : t("finances.invoices.ar.sub", { count: rows.length })}
            icon={ArrowUpFromLine}
            accent="violet"
            action={
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("finances.invoices.search")}
                        className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-muted focus:outline-none focus:border-violet-500/50 w-44"
                    />
                </div>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">{t("finances.invoices.ar.empty")}</div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-2">{t("finances.invoices.col.order")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.invoices.col.customer")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.invoices.col.city")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.invoices.col.status")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.invoices.col.amount")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.invoices.col.age")}</th>
                                    <th className="text-right py-2 pl-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((r, i) => (
                                    <motion.tr
                                        key={r.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.015, 0.2) }}
                                        className="border-b border-[var(--card-border)]/60 last:border-0 hover:bg-[var(--background)]/40"
                                    >
                                        <td className="py-2.5 pr-2 font-mono text-[11.5px] text-foreground">#{r.orderId}</td>
                                        <td className="py-2 px-2">
                                            <div className="text-foreground font-medium truncate max-w-[160px]">{r.customerName}</div>
                                            <div className="text-[10.5px] text-muted">{r.phone}</div>
                                        </td>
                                        <td className="py-2 px-2 text-muted">{r.city || "—"}</td>
                                        <td className="py-2 px-2">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30">
                                                {statusLabel(r.status)}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <FinanceValue value={r.amount} abbreviate className="text-foreground font-medium" />
                                        </td>
                                        <td className={cn(
                                            "py-2 px-2 text-right tabular-nums font-medium",
                                            r.daysOpen >= 31 ? "text-rose-600 dark:text-rose-400" :
                                                r.daysOpen >= 15 ? "text-amber-600 dark:text-amber-400" :
                                                    "text-muted"
                                        )}>
                                            {t("finances.invoices.days", { count: r.daysOpen })}
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            <Link
                                                href={`/orders?orderId=${r.id}`}
                                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                                title={t("finances.invoices.openOrder")}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </Link>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > 12 && (
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={() => setShowAll(s => !s)}
                                className="text-[12px] text-muted hover:text-foreground font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--background)] transition-colors"
                            >
                                {showAll ? t("finances.invoices.showLess") : t("finances.invoices.showAll", { count: filtered.length })}
                            </button>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
}

function ARAgingCard({
    buckets, totalValue,
}: {
    buckets: Record<ARRow["bucket"], { count: number; value: number }>;
    totalValue: number;
}) {
    const { t } = useLanguage();
    const order: ARRow["bucket"][] = ["0-7", "8-14", "15-30", "31-60", "60+"];
    const labels: Record<ARRow["bucket"], string> = {
        "0-7": t("finances.invoices.aging.b0"), "8-14": t("finances.invoices.aging.b8"), "15-30": t("finances.invoices.aging.b15"),
        "31-60": t("finances.invoices.aging.b31"), "60+": t("finances.invoices.aging.b60"),
    };
    const tones: Record<ARRow["bucket"], string> = {
        "0-7": "bg-emerald-500/70", "8-14": "bg-emerald-400/70", "15-30": "bg-amber-500/70", "31-60": "bg-orange-500/70", "60+": "bg-rose-500/70",
    };
    const max = Math.max(...order.map(b => buckets[b].value), 1);

    return (
        <SectionCard
            title={t("finances.invoices.aging.title")}
            subtitle={totalValue > 0 ? t("finances.invoices.aging.sub", { value: Math.round(totalValue / 1000) }) : t("finances.invoices.aging.none")}
            icon={AlertCircle}
            accent="amber"
        >
            {totalValue === 0 ? (
                <div className="py-12 text-center text-sm text-muted">{t("finances.invoices.aging.empty")}</div>
            ) : (
                <div className="space-y-2.5">
                    {order.map((b) => {
                        const { count, value } = buckets[b];
                        const pct = (value / max) * 100;
                        return (
                            <div key={b} className="space-y-1">
                                <div className="flex items-center justify-between text-[11.5px]">
                                    <span className="text-foreground font-medium">{labels[b]}</span>
                                    <span className="tabular-nums text-muted">
                                        {count} · <FinanceValue value={value} abbreviate className="text-foreground inline" />
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.4 }}
                                        className={cn("h-full", tones[b])}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
}

function APInvoicesCard({
    rows,
}: {
    rows: Array<{ id: string; date: string; category: ExpenseCategory; description: string; amount: number; isRecurring: boolean }>;
}) {
    const { t } = useLanguage();
    const categoryLabel = useExpenseCategoryLabel();
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? rows : rows.slice(0, 12);

    return (
        <SectionCard
            title={t("finances.invoices.ap.title")}
            subtitle={rows.length === 0 ? t("finances.invoices.ap.none") : rows.length === 1 ? t("finances.invoices.ap.subOne") : t("finances.invoices.ap.sub", { count: rows.length })}
            icon={Inbox}
            accent="amber"
            action={
                <Link
                    href="/finances?tab=expenses"
                    className="text-[12px] text-amber-600 dark:text-amber-400 hover:text-amber-500 font-medium"
                >
                    {t("finances.invoices.ap.manage")}
                </Link>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">{t("finances.invoices.ap.empty")}</div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-2">{t("finances.invoices.col.date")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.invoices.col.category")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.invoices.col.description")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.invoices.col.amount")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((r, i) => (
                                    <motion.tr
                                        key={r.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.015, 0.2) }}
                                        className="border-b border-[var(--card-border)]/60 last:border-0 hover:bg-[var(--background)]/40"
                                    >
                                        <td className="py-2.5 pr-2 text-muted tabular-nums">{r.date}</td>
                                        <td className="py-2 px-2">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                                {categoryLabel(r.category)}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-foreground truncate max-w-[300px]">
                                            {r.description || "—"}
                                            {r.isRecurring && (
                                                <span className="ml-2 text-[10px] text-violet-600 dark:text-violet-400 font-medium">{t("finances.invoices.ap.recurring")}</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <FinanceValue value={r.amount} abbreviate className="text-foreground font-medium" />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > 12 && (
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={() => setShowAll(s => !s)}
                                className="text-[12px] text-muted hover:text-foreground font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--background)] transition-colors"
                            >
                                {showAll ? t("finances.invoices.showLess") : t("finances.invoices.showAll", { count: rows.length })}
                            </button>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
}
