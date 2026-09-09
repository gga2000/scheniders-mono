"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Truck, RefreshCw, CheckCircle2, AlertTriangle, Clock,
    Wallet, ChevronRight, FileText, ExternalLink, ArrowRight,
} from "lucide-react";
import { useWaseet } from "@/hooks/use-waseet";
import { useOrdersList } from "@/components/providers/orders-provider";
import type { WaseetInvoice } from "@/types/waseet";
import { SectionCard } from "@/components/finances/hub/primitives/section-card";
import { FinanceValue } from "@/components/finances/hub/primitives/finance-value";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ReconciliationRow {
    invoice: WaseetInvoice;
    expectedAmount: number;
    reportedAmount: number;
    delta: number;
    deltaPct: number;
    status: "matched" | "mismatch" | "pending" | "fetching";
    orderCount: number;
}

export function PayoutsTab() {
    const { fetchInvoices, fetchInvoiceOrders } = useWaseetExtended();
    const { orders } = useOrdersList();

    const [invoices, setInvoices] = useState<WaseetInvoice[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

    const loadInvoices = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchInvoices();
            if (!data) {
                setError("Could not reach Al-Waseet. Check connection or try again.");
                return;
            }
            setInvoices(data);
            setLastSync(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load invoices");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInvoices();
    }, []);

    // Merge invoice data with locally tracked orders to compute expected vs reported
    const reconciliation: ReconciliationRow[] = useMemo(() => {
        if (!invoices) return [];
        return invoices.map((inv) => {
            const reportedAmount = parseFloat(inv.merchant_price) || 0;
            const orderCount = parseInt(inv.delivered_orders_count, 10) || 0;
            // Expected = sum of order prices for orders linked to this invoice
            const linkedOrders = orders.filter((o) => (o as any).waseet_invoice_id === inv.id);
            const expectedAmount = linkedOrders.reduce((s, o) => s + (o.price || 0), 0);
            const delta = reportedAmount - expectedAmount;
            const deltaPct = expectedAmount > 0 ? (delta / expectedAmount) * 100 : 0;

            let status: ReconciliationRow["status"];
            if (linkedOrders.length === 0) {
                status = "pending";
            } else if (Math.abs(deltaPct) < 1) {
                status = "matched";
            } else {
                status = "mismatch";
            }

            return {
                invoice: inv,
                expectedAmount,
                reportedAmount,
                delta,
                deltaPct,
                status,
                orderCount,
            };
        });
    }, [invoices, orders]);

    const totals = useMemo(() => {
        const upcoming = reconciliation.filter((r) => r.invoice.status?.toLowerCase() === "pending");
        const settled = reconciliation.filter((r) => r.invoice.status?.toLowerCase() === "settled");
        const mismatches = reconciliation.filter((r) => r.status === "mismatch");

        const upcomingValue = upcoming.reduce((s, r) => s + r.reportedAmount, 0);
        const settledValue = settled.reduce((s, r) => s + r.reportedAmount, 0);
        const totalDelta = mismatches.reduce((s, r) => s + r.delta, 0);

        return {
            upcomingCount: upcoming.length,
            upcomingValue,
            settledCount: settled.length,
            settledValue,
            mismatchCount: mismatches.length,
            totalDelta,
        };
    }, [reconciliation]);

    const tiles = [
        {
            id: "upcoming",
            label: "Upcoming Payouts",
            sublabel: `${totals.upcomingCount} pending invoices`,
            value: totals.upcomingValue,
            Icon: Clock,
            accent: "amber" as const,
        },
        {
            id: "settled",
            label: "Settled (all-time)",
            sublabel: `${totals.settledCount} invoices closed`,
            value: totals.settledValue,
            Icon: CheckCircle2,
            accent: "emerald" as const,
        },
        {
            id: "mismatches",
            label: "Mismatches",
            sublabel: `${totals.mismatchCount} need review`,
            value: Math.abs(totals.totalDelta),
            Icon: AlertTriangle,
            accent: totals.mismatchCount > 0 ? ("rose" as const) : ("slate" as const),
        },
        {
            id: "courier",
            label: "Courier Cash Float",
            sublabel: "Held by Al-Waseet",
            value: totals.upcomingValue,
            Icon: Truck,
            accent: "violet" as const,
        },
    ];

    return (
        <div className="space-y-5">
            {/* Connection status banner */}
            <ConnectionStatus
                isConnected={!error && invoices !== null}
                isLoading={loading}
                lastSync={lastSync}
                error={error}
                onRefresh={loadInvoices}
            />

            {/* KPI strip */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
                {tiles.map((t) => (
                    <div
                        key={t.id}
                        className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg(t.accent))}>
                                <t.Icon className={cn("w-4 h-4", accentText(t.accent))} />
                            </div>
                        </div>
                        <div className="text-[11px] font-semibold text-muted uppercase tracking-wider truncate">
                            {t.label}
                        </div>
                        <div className="mt-1">
                            <FinanceValue
                                value={t.value}
                                currency="IQD"
                                abbreviate
                                className="text-[22px] leading-none text-foreground"
                            />
                        </div>
                        <div className="text-[11px] text-muted mt-1 truncate">{t.sublabel}</div>
                    </div>
                ))}
            </motion.div>

            {/* Main reconciliation table */}
            <SectionCard
                title="Invoice reconciliation"
                subtitle="Expected (your records) vs reported (Al-Waseet) — flag mismatches"
                icon={Wallet}
                accent="cyan"
                action={
                    <button
                        onClick={loadInvoices}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground disabled:opacity-50"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                        Refresh
                    </button>
                }
            >
                {loading && !invoices ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-16 rounded-xl bg-[var(--background)] animate-pulse"
                            />
                        ))}
                    </div>
                ) : !invoices || invoices.length === 0 ? (
                    <EmptyReconciliation />
                ) : (
                    <div className="overflow-hidden rounded-xl border border-[var(--card-border)]">
                        <table className="w-full text-[13px]">
                            <thead className="bg-[var(--background)] text-[11px] font-semibold text-muted uppercase tracking-wider">
                                <tr>
                                    <th className="text-left px-3 py-2.5">Invoice</th>
                                    <th className="text-right px-3 py-2.5">Orders</th>
                                    <th className="text-right px-3 py-2.5 hidden md:table-cell">Expected</th>
                                    <th className="text-right px-3 py-2.5">Reported</th>
                                    <th className="text-right px-3 py-2.5">Delta</th>
                                    <th className="text-right px-3 py-2.5">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--card-border)]">
                                {reconciliation.map((r) => (
                                    <tr
                                        key={r.invoice.id}
                                        className={cn(
                                            "cursor-pointer hover:bg-[var(--background)] transition-colors",
                                            selectedInvoiceId === r.invoice.id && "bg-[var(--background)]"
                                        )}
                                        onClick={() =>
                                            setSelectedInvoiceId(selectedInvoiceId === r.invoice.id ? null : r.invoice.id)
                                        }
                                    >
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                                                    <FileText className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-foreground">
                                                        #{r.invoice.id}
                                                    </div>
                                                    <div className="text-[11px] text-muted">
                                                        {formatDateShort(r.invoice.updated_at)}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right px-3 py-2.5 text-foreground tabular-nums">
                                            {r.orderCount}
                                        </td>
                                        <td className="text-right px-3 py-2.5 hidden md:table-cell">
                                            <FinanceValue
                                                value={r.expectedAmount}
                                                currency="IQD"
                                                abbreviate
                                                compact
                                                className="text-foreground"
                                            />
                                        </td>
                                        <td className="text-right px-3 py-2.5">
                                            <FinanceValue
                                                value={r.reportedAmount}
                                                currency="IQD"
                                                abbreviate
                                                compact
                                                className="text-foreground"
                                            />
                                        </td>
                                        <td className="text-right px-3 py-2.5">
                                            {r.status === "pending" ? (
                                                <span className="text-muted text-[12px]">—</span>
                                            ) : (
                                                <DeltaPill delta={r.delta} pct={r.deltaPct} />
                                            )}
                                        </td>
                                        <td className="text-right px-3 py-2.5">
                                            <StatusPill status={r.status} invoiceStatus={r.invoice.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {/* Mismatch alert */}
            {totals.mismatchCount > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex items-start gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-[13px] flex-1">
                        <span className="font-semibold text-rose-700 dark:text-rose-300">
                            {totals.mismatchCount} invoice{totals.mismatchCount === 1 ? "" : "s"} need
                            {totals.mismatchCount === 1 ? "s" : ""} reconciliation
                        </span>
                        <span className="text-muted ml-1">
                            — total delta:{" "}
                            <FinanceValue
                                value={Math.abs(totals.totalDelta)}
                                currency="IQD"
                                className="text-foreground"
                            />
                            . Reach out to Al-Waseet support to dispute.
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Helpful links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <HelperLink
                    href="/finances?tab=cash"
                    title="Cash & COD position"
                    sub="Track cash float separately"
                    Icon={Wallet}
                />
                <HelperLink
                    href="/printing"
                    title="Submit new orders"
                    sub="Send orders to Al-Waseet"
                    Icon={Truck}
                />
                <HelperLink
                    href="/finances?tab=expenses"
                    title="Add courier expense"
                    sub="Log shipping costs manually"
                    Icon={FileText}
                />
            </div>
        </div>
    );
}

function ConnectionStatus({
    isConnected,
    isLoading,
    lastSync,
    error,
    onRefresh,
}: {
    isConnected: boolean;
    isLoading: boolean;
    lastSync: Date | null;
    error: string | null;
    onRefresh: () => void;
}) {
    const dotColor = error ? "bg-rose-500" : isConnected ? "bg-emerald-500" : "bg-amber-500";
    const label = error ? "Disconnected" : isConnected ? "Connected" : "Connecting…";

    return (
        <div className="flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                    {isConnected && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                    )}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColor)} />
                </span>
                <span className="text-[13px] font-medium text-foreground">Al-Waseet · {label}</span>
                {lastSync && !error && (
                    <span className="text-[11px] text-muted">· synced {timeAgo(lastSync)}</span>
                )}
                {error && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 truncate">· {error}</span>
                )}
            </div>
            <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground disabled:opacity-50"
            >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                Refresh
            </button>
        </div>
    );
}

function DeltaPill({ delta, pct }: { delta: number; pct: number }) {
    if (Math.abs(pct) < 0.5) {
        return (
            <span className="inline-flex items-center text-[12px] tabular-nums text-emerald-600 dark:text-emerald-400">
                ±0
            </span>
        );
    }
    const isPositive = delta > 0;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 text-[12px] tabular-nums font-medium",
                isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
            )}
        >
            {isPositive ? "+" : ""}
            <FinanceValue value={delta} currency="IQD" abbreviate compact className="text-current" />
            <span className="text-[10px] opacity-70">({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
        </span>
    );
}

function StatusPill({
    status,
    invoiceStatus,
}: {
    status: ReconciliationRow["status"];
    invoiceStatus?: string;
}) {
    const config = {
        matched: { label: "Matched", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
        mismatch: { label: "Mismatch", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
        pending: { label: invoiceStatus || "Pending", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
        fetching: { label: "Loading", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
    }[status];

    return (
        <span
            className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium",
                config.className
            )}
        >
            {config.label}
        </span>
    );
}

function EmptyReconciliation() {
    return (
        <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h4 className="text-[14px] font-semibold text-foreground mb-1">No invoices yet</h4>
            <p className="text-[12px] text-muted max-w-xs">
                Once Al-Waseet generates payout invoices, they'll appear here for reconciliation.
            </p>
        </div>
    );
}

function HelperLink({
    href,
    title,
    sub,
    Icon,
}: {
    href: string;
    title: string;
    sub: string;
    Icon: typeof Truck;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3.5 hover:border-[var(--ink)] transition-colors"
        >
            <div className="w-9 h-9 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground truncate">{title}</div>
                <div className="text-[11px] text-muted truncate">{sub}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted group-hover:text-foreground transition-colors shrink-0" />
        </Link>
    );
}

// useWaseet doesn't expose fetchInvoiceOrders — wrap to add it
function useWaseetExtended() {
    const base = useWaseet();
    const fetchInvoiceOrders = async (invoiceId: string) => {
        try {
            // Auth header is added by browser via session cookie if applicable;
            // for now we use the session.access_token via fetchInvoices proxy pattern.
            const res = await fetch(`/api/waseet/invoice-orders?invoice_id=${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            return json.success ? json.data : null;
        } catch {
            return null;
        }
    };
    return { ...base, fetchInvoiceOrders };
}

function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
}

function formatDateShort(s: string): string {
    try {
        return new Date(s).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return s;
    }
}

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
