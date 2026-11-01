"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Crown, AlarmClock, Search, ExternalLink, Sparkles,
} from "lucide-react";
import type { Order } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { useFinanceCustomers } from "@/hooks/use-finance-customers";
import type { FinancePeriod, Granularity } from "@/hooks/use-finance-period";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { CustomersSummary } from "./customers-summary";
import { CustomersLtvDistribution } from "./customers-ltv-distribution";
import { CustomersAcquisitionMix } from "./customers-acquisition-mix";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { CustomerSummary, DormantCustomer } from "@/hooks/use-finance-customers";

interface Props {
    orders: Order[];
    period: FinancePeriod;
    compareRange: { start: Date; end: Date } | null;
    granularity: Granularity;
}

export function CustomersFinanceTab({ orders, period, granularity }: Props) {
    const data = useFinanceCustomers(
        orders,
        { start: period.start, end: period.end },
        granularity,
    );

    return (
        <div className="space-y-5">
            <CustomersSummary data={data.summary} />

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-3">
                    <CustomersAcquisitionMix data={data.acquisitionMix} />
                </div>
                <div className="xl:col-span-2">
                    <CustomersLtvDistribution buckets={data.ltvBuckets} />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <TopSpendersTable rows={data.topSpenders} />
                <DormantHighValueTable rows={data.dormantHighValue} />
            </div>
        </div>
    );
}

function TopSpendersTable({ rows }: { rows: CustomerSummary[] }) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
        if (!query) return rows;
        const q = query.toLowerCase();
        return rows.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.phone.includes(q) ||
            (r.city || "").toLowerCase().includes(q)
        );
    }, [rows, query]);

    return (
        <SectionCard
            title={t("finances.cust.top.title")}
            subtitle={rows.length === 0 ? t("finances.cust.top.emptySub") : t("finances.cust.top.sub", { count: rows.length })}
            icon={Crown}
            accent="amber"
            action={
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("finances.cust.search")}
                        className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-amber-500/50 w-44"
                    />
                </div>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                    {t("finances.cust.top.empty")}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map((c, i) => (
                        <motion.div
                            key={c.phone}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.2) }}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 px-3 py-2 hover:bg-[var(--background)] transition-colors"
                        >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[12.5px] font-medium text-foreground truncate flex items-center gap-1.5">
                                        {c.name}
                                        {c.is_repeat && (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                {c.orders_count}x
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10.5px] text-muted">
                                        {c.phone}{c.city ? ` · ${c.city}` : ""}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <FinanceValue
                                        value={c.revenue}
                                        abbreviate
                                        className="text-[13px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums block"
                                    />
                                    <div className="text-[10px] text-muted tabular-nums">
                                        {t("finances.cust.aovShort", { value: Math.round(c.aov / 1000) })}
                                    </div>
                                </div>
                                <Link
                                    href={`/customers/${encodeURIComponent(normalizePhoneForSearch(c.phone))}`}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                    title={t("finances.cust.open")}
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}

function DormantHighValueTable({ rows }: { rows: DormantCustomer[] }) {
    const { t } = useLanguage();
    const totalRevenue = rows.reduce((s, c) => s + c.revenue, 0);

    return (
        <SectionCard
            title={t("finances.cust.dormant.title")}
            subtitle={
                rows.length === 0
                    ? t("finances.cust.dormant.emptySub")
                    : t("finances.cust.dormant.sub", { count: rows.length, value: Math.round(totalRevenue / 1000) })
            }
            icon={AlarmClock}
            accent="rose"
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                    {t("finances.cust.dormant.empty")}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {rows.map((c, i) => (
                        <motion.div
                            key={c.phone}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.025, 0.25) }}
                            className={cn(
                                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 hover:bg-[var(--background)] transition-colors",
                                c.risk_tone === "rose"
                                    ? "border-rose-500/30 bg-rose-500/5"
                                    : "border-amber-500/30 bg-amber-500/5"
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-[12.5px] font-medium text-foreground truncate">{c.name}</div>
                                <div className="text-[10.5px] text-muted">
                                    {c.phone}{c.city ? ` · ${c.city}` : ""} · {t("finances.cust.dormant.orders", { count: c.orders_count })}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <FinanceValue
                                        value={c.revenue}
                                        abbreviate
                                        className="text-[13px] font-semibold text-foreground tabular-nums block"
                                    />
                                    <div className={cn(
                                        "text-[10px] tabular-nums font-medium",
                                        c.risk_tone === "rose"
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-amber-600 dark:text-amber-400"
                                    )}>
                                        {t("finances.cust.dormant.silent", { days: c.days_since_last_order })}
                                    </div>
                                </div>
                                <Link
                                    href={`/customers/${encodeURIComponent(normalizePhoneForSearch(c.phone))}`}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                    title={t("finances.cust.open")}
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}
