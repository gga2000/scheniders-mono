"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Link from "next/link";
import {
    Undo2, AlertTriangle, Clock, Package, MapPin, Search, ExternalLink,
} from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { Delta } from "../primitives/delta";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import { useRefundAnalytics } from "@/hooks/use-refund-analytics";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

interface Props {
    orders: Order[];
    period: { start: Date; end: Date };
    compareRange: { start: Date; end: Date } | null;
}

export function RefundsTab({ orders, period, compareRange }: Props) {
    const data = useRefundAnalytics(orders, period, compareRange);

    return (
        <div className="space-y-5">
            <RefundsHero data={data} />
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-3">
                    <RefundsTimeline data={data} />
                </div>
                <div className="xl:col-span-2">
                    <RefundReasons rows={data.reasons} totalValue={data.totalValue} />
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <TopRefundedProducts rows={data.products} />
                <RefundsByCity rows={data.byCity} />
            </div>
            <RefundOrdersTable orders={data.orders} />
        </div>
    );
}

function RefundsHero({ data }: { data: ReturnType<typeof useRefundAnalytics> }) {
    const tone = data.refundRate >= 5 ? "rose" : data.refundRate >= 2 ? "amber" : "emerald";
    const rateDelta = data.refundRate - data.refundRatePrev;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <HeroTile
                label="Refund Value"
                accent="rose"
                main={<FinanceValue value={Math.abs(data.totalValue)} currency="IQD" abbreviate className="text-2xl text-rose-600 dark:text-rose-400" />}
                sub={
                    data.valuePrev > 0 ? (
                        <Delta value={((data.totalValue - data.valuePrev) / data.valuePrev) * 100} variant="inline" size="sm" />
                    ) : (
                        <span className="text-[11px] text-muted">no prior period</span>
                    )
                }
            />
            <HeroTile
                label="Refund Count"
                accent="slate"
                main={<span className="text-2xl font-bold text-foreground tabular-nums">{data.totalCount}</span>}
                sub={<span className="text-[11px] text-muted">{data.avgRefundValue > 0 ? `Avg ${Math.round(data.avgRefundValue / 1000)}K` : "—"}</span>}
            />
            <HeroTile
                label="Refund Rate"
                accent={tone}
                main={
                    <span className={cn(
                        "text-2xl font-bold tabular-nums",
                        tone === "rose" ? "text-rose-600 dark:text-rose-400" :
                            tone === "amber" ? "text-amber-600 dark:text-amber-400" :
                                "text-emerald-600 dark:text-emerald-400"
                    )}>
                        {data.refundRate.toFixed(1)}%
                    </span>
                }
                sub={
                    data.refundRatePrev > 0 ? (
                        <Delta value={rateDelta} variant="inline" size="sm" inverse />
                    ) : (
                        <span className="text-[11px] text-muted">no baseline</span>
                    )
                }
            />
            <HeroTile
                label="Pending"
                accent="amber"
                main={<span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{data.pendingReturns}</span>}
                sub={
                    data.pendingReturnsValue > 0 ? (
                        <FinanceValue value={data.pendingReturnsValue} abbreviate className="text-[11px] text-muted" />
                    ) : (
                        <span className="text-[11px] text-muted">awaiting</span>
                    )
                }
            />
            <HeroTile
                label="Failed Returns"
                accent={data.failedReturns > 0 ? "rose" : "slate"}
                main={<span className={cn(
                    "text-2xl font-bold tabular-nums",
                    data.failedReturns > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                )}>{data.failedReturns}</span>}
                sub={<span className="text-[11px] text-muted">unprocessed</span>}
            />
        </div>
    );
}

function HeroTile({
    label, accent, main, sub,
}: {
    label: string;
    accent: "emerald" | "rose" | "amber" | "slate";
    main: React.ReactNode;
    sub: React.ReactNode;
}) {
    const ring = accent === "rose" ? "ring-rose-500/20" :
        accent === "amber" ? "ring-amber-500/20" :
            accent === "emerald" ? "ring-emerald-500/20" :
                "ring-[var(--card-border)]";
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
                "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 ring-1",
                ring
            )}
        >
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
            <div className="mt-1.5 mb-1">{main}</div>
            <div>{sub}</div>
        </motion.div>
    );
}

function RefundsTimeline({ data }: { data: ReturnType<typeof useRefundAnalytics> }) {
    const hasData = data.daily.some(d => d.value > 0);

    return (
        <SectionCard
            title="Refund Trend"
            subtitle={hasData ? "Daily refund value" : "No refunds in this period"}
            icon={Undo2}
            accent="rose"
        >
            {!hasData ? (
                <div className="py-12 text-center text-sm text-muted">
                    No refund activity to plot.
                </div>
            ) : (
                <div className="h-[280px] -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.daily} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="refundGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: "var(--muted)" }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: "var(--muted)" }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : v}
                            />
                            <Tooltip content={(p) => <FinanceTooltip {...p} />} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                name="Refund value"
                                stroke="#f43f5e"
                                strokeWidth={2}
                                fill="url(#refundGradient)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </SectionCard>
    );
}

function RefundReasons({ rows, totalValue }: { rows: ReturnType<typeof useRefundAnalytics>["reasons"]; totalValue: number }) {
    return (
        <SectionCard
            title="Top Refund Reasons"
            subtitle={rows.length === 0 ? "Nothing to break down" : `${rows.length} reason${rows.length === 1 ? "" : "s"} captured`}
            icon={AlertTriangle}
            accent="amber"
        >
            {rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">No refunds in this period.</div>
            ) : (
                <div className="space-y-2">
                    {rows.slice(0, 6).map((r, i) => {
                        const absTotal = Math.abs(totalValue);
                        const pct = absTotal > 0 ? (Math.abs(r.value) / absTotal) * 100 : 0;
                        const pctLabel = pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? "<1%" : "—";
                        return (
                            <motion.div
                                key={r.reason}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="relative rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 overflow-hidden"
                            >
                                <div className="absolute inset-y-0 left-0 bg-amber-500/10" style={{ width: `${pct}%` }} />
                                <div className="relative flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12.5px] font-medium text-foreground truncate" title={r.reason}>
                                            {r.reason}
                                        </div>
                                        <div className="text-[10.5px] text-muted">
                                            {r.count} refund{r.count === 1 ? "" : "s"} · {pctLabel} of value
                                        </div>
                                    </div>
                                    <FinanceValue
                                        value={Math.abs(r.value)}
                                        abbreviate
                                        className="text-[13px] font-semibold text-foreground tabular-nums shrink-0"
                                    />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
}

function TopRefundedProducts({ rows }: { rows: ReturnType<typeof useRefundAnalytics>["products"] }) {
    return (
        <SectionCard
            title="Top Refunded Products"
            subtitle={rows.length === 0 ? "No product refunds" : "Products driving refund value"}
            icon={Package}
            accent="violet"
        >
            {rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">No product-level refund data.</div>
            ) : (
                <div className="space-y-2">
                    {rows.map((p, i) => (
                        <motion.div
                            key={p.name}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 px-3 py-2"
                        >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[12.5px] font-medium text-foreground truncate">{p.name}</div>
                                    <div className="text-[10.5px] text-muted">
                                        {p.units} unit{p.units === 1 ? "" : "s"} · {p.orders} order{p.orders === 1 ? "" : "s"}
                                    </div>
                                </div>
                            </div>
                            <FinanceValue
                                value={p.value}
                                abbreviate
                                className="text-[13px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0"
                            />
                        </motion.div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}

function RefundsByCity({ rows }: { rows: ReturnType<typeof useRefundAnalytics>["byCity"] }) {
    const max = Math.max(...rows.map(r => r.count), 1);
    return (
        <SectionCard
            title="Refunds by City"
            subtitle={rows.length === 0 ? "No regional data" : "Where refunds concentrate"}
            icon={MapPin}
            accent="cyan"
        >
            {rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">No regional refund data.</div>
            ) : (
                <div className="space-y-1.5">
                    {rows.map((r) => {
                        const pct = (r.count / max) * 100;
                        return (
                            <div key={r.city} className="flex items-center gap-3 px-1 py-1.5">
                                <div className="w-24 shrink-0 text-[12px] text-foreground font-medium truncate">{r.city}</div>
                                <div className="flex-1 h-2 rounded-full bg-[var(--background)] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.4 }}
                                        className="h-full bg-cyan-500/70"
                                    />
                                </div>
                                <div className="w-24 shrink-0 flex items-center justify-end gap-2 text-[11px] tabular-nums">
                                    <span className="text-muted">{r.count}</span>
                                    <FinanceValue value={r.value} abbreviate className="text-foreground" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
}

function RefundOrdersTable({ orders }: { orders: ReturnType<typeof useRefundAnalytics>["orders"] }) {
    const [query, setQuery] = useState("");
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(() => {
        if (!query) return orders;
        const q = query.toLowerCase();
        return orders.filter(o =>
            o.customer_name.toLowerCase().includes(q) ||
            o.phone.includes(q) ||
            o.order_id.toLowerCase().includes(q) ||
            (o.city || "").toLowerCase().includes(q)
        );
    }, [orders, query]);

    const visible = showAll ? filtered : filtered.slice(0, 10);

    return (
        <SectionCard
            title="Refund Orders"
            subtitle={orders.length === 0 ? "No refund orders" : `${orders.length} refund${orders.length === 1 ? "" : "s"} in period`}
            icon={Clock}
            accent="rose"
            action={
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search…"
                        className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-muted focus:outline-none focus:border-rose-500/50 w-44"
                    />
                </div>
            }
        >
            {orders.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                    No refund or return orders in this period.
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-3">Order</th>
                                    <th className="text-left py-2 px-2">Customer</th>
                                    <th className="text-left py-2 px-2">City</th>
                                    <th className="text-left py-2 px-2">Status</th>
                                    <th className="text-right py-2 px-2">Items</th>
                                    <th className="text-right py-2 px-2">Value</th>
                                    <th className="text-right py-2 px-2">Age</th>
                                    <th className="text-right py-2 pl-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((o, i) => (
                                    <motion.tr
                                        key={o.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.02, 0.3) }}
                                        className="border-b border-[var(--card-border)]/60 last:border-0 hover:bg-[var(--background)]/40"
                                    >
                                        <td className="py-2.5 pr-3 font-mono text-[11.5px] text-foreground">
                                            #{o.order_id}
                                        </td>
                                        <td className="py-2 px-2">
                                            <div className="text-foreground font-medium truncate max-w-[160px]">{o.customer_name}</div>
                                            <div className="text-[10.5px] text-muted">{o.phone}</div>
                                        </td>
                                        <td className="py-2 px-2 text-muted">{o.city || "—"}</td>
                                        <td className="py-2 px-2">
                                            <StatusBadge status={o.status} isReturn={o.is_return} />
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums text-muted">{o.items}</td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <FinanceValue value={o.price} abbreviate className="text-rose-600 dark:text-rose-400" />
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums text-muted">
                                            {o.days_since}d
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            <Link
                                                href={`/orders?orderId=${o.id}`}
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
                    {filtered.length > 10 && (
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

function StatusBadge({ status, isReturn }: { status: string; isReturn: boolean }) {
    const map: Record<string, { label: string; tone: string }> = {
        refund_delivered: { label: "Refunded", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
        refund_failed: { label: "Failed", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40" },
        return_pending: { label: "Pending", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    };
    const fallback = isReturn
        ? { label: "Return", tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30" }
        : { label: status, tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30" };
    const { label, tone } = map[status] || fallback;
    return (
        <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border",
            tone
        )}>
            {label}
        </span>
    );
}
