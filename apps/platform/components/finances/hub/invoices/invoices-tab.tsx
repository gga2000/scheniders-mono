"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    FileText, ArrowDownToLine, ArrowUpFromLine, AlertCircle,
    Search, ExternalLink, Receipt, Inbox,
} from "lucide-react";
import type { Order } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import type { FinancePeriod } from "@/hooks/use-finance-period";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";

const REVENUE_STATUSES = new Set(["delivered", "completed"]);
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
            const t = o.created_at ? new Date(o.created_at).getTime() : 0;
            if (t < start || t > end) continue;
            if (!REVENUE_STATUSES.has(o.status)) continue;
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
    const tiles = [
        { label: "Outbound (AP)", icon: ArrowDownToLine, value: outboundValue, sub: `${outboundCount} expenses`, tone: "amber" as const },
        { label: "Inbound AR open", icon: ArrowUpFromLine, value: inboundValue, sub: `${inboundCount} orders`, tone: "violet" as const },
        { label: "Receipts (delivered)", icon: Receipt, value: receiptsValue, sub: "in period", tone: "emerald" as const },
        { label: "AR > 30d overdue", icon: AlertCircle, value: overdueValue, sub: "needs attention", tone: overdueValue > 0 ? "rose" as const : "slate" as const },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((t, i) => {
                const Icon = t.icon;
                const ring = t.tone === "emerald" ? "ring-emerald-500/20"
                    : t.tone === "violet" ? "ring-violet-500/20"
                        : t.tone === "amber" ? "ring-amber-500/20"
                            : t.tone === "rose" ? "ring-rose-500/20"
                                : "ring-[var(--card-border)]";
                const iconClr = t.tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : t.tone === "violet" ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
                        : t.tone === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            : t.tone === "rose" ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                                : "text-slate-600 dark:text-slate-400 bg-slate-500/10";
                return (
                    <motion.div
                        key={t.label}
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
                            <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{t.label}</div>
                        </div>
                        <FinanceValue value={t.value} abbreviate className="text-2xl font-bold text-foreground tabular-nums block" />
                        <div className="text-[10.5px] text-muted">{t.sub}</div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function ARTable({ rows }: { rows: ARRow[] }) {
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
            title="Open AR — Pending Collections"
            subtitle={rows.length === 0 ? "No open receivables" : `${rows.length} orders awaiting payment`}
            icon={ArrowUpFromLine}
            accent="violet"
            action={
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search…"
                        className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-muted focus:outline-none focus:border-violet-500/50 w-44"
                    />
                </div>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">All collected — nothing pending.</div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-2">Order</th>
                                    <th className="text-left py-2 px-2">Customer</th>
                                    <th className="text-left py-2 px-2">City</th>
                                    <th className="text-left py-2 px-2">Status</th>
                                    <th className="text-right py-2 px-2">Amount</th>
                                    <th className="text-right py-2 px-2">Age</th>
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
                                                {prettyStatus(r.status)}
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
                                            {r.daysOpen}d
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            <Link
                                                href={`/orders?orderId=${r.id}`}
                                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                                title="Open order"
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
                                {showAll ? "Show less" : `Show all ${filtered.length}`}
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
    const order: ARRow["bucket"][] = ["0-7", "8-14", "15-30", "31-60", "60+"];
    const labels: Record<ARRow["bucket"], string> = {
        "0-7": "0–7 days", "8-14": "8–14 days", "15-30": "15–30 days", "31-60": "31–60 days", "60+": "60+ days",
    };
    const tones: Record<ARRow["bucket"], string> = {
        "0-7": "bg-emerald-500/70", "8-14": "bg-emerald-400/70", "15-30": "bg-amber-500/70", "31-60": "bg-orange-500/70", "60+": "bg-rose-500/70",
    };
    const max = Math.max(...order.map(b => buckets[b].value), 1);

    return (
        <SectionCard
            title="AR Aging"
            subtitle={totalValue > 0 ? `${Math.round(totalValue / 1000)}K total open` : "Nothing pending"}
            icon={AlertCircle}
            accent="amber"
        >
            {totalValue === 0 ? (
                <div className="py-12 text-center text-sm text-muted">No open invoices.</div>
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
    rows: Array<{ id: string; date: string; category: string; description: string; amount: number; isRecurring: boolean }>;
}) {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? rows : rows.slice(0, 12);

    return (
        <SectionCard
            title="AP — Outbound Invoices & Receipts"
            subtitle={rows.length === 0 ? "No expenses recorded in period" : `${rows.length} expense entries`}
            icon={Inbox}
            accent="amber"
            action={
                <Link
                    href="/finances?tab=expenses"
                    className="text-[12px] text-amber-600 dark:text-amber-400 hover:text-amber-500 font-medium"
                >
                    Manage →
                </Link>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">No outbound invoices logged yet.</div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-2">Date</th>
                                    <th className="text-left py-2 px-2">Category</th>
                                    <th className="text-left py-2 px-2">Description</th>
                                    <th className="text-right py-2 px-2">Amount</th>
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
                                                {r.category.replace(/_/g, " ")}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-foreground truncate max-w-[300px]">
                                            {r.description || "—"}
                                            {r.isRecurring && (
                                                <span className="ml-2 text-[10px] text-violet-600 dark:text-violet-400 font-medium">recurring</span>
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
                                {showAll ? "Show less" : `Show all ${rows.length}`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
}

function prettyStatus(s: string): string {
    return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
