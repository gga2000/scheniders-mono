"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Package, TrendingUp, TrendingDown, AlertCircle, ExternalLink, Search, Sparkles,
} from "lucide-react";
import type { Order, Product } from "@/lib/supabase";
import { useFinanceRevenue } from "@/hooks/use-finance-revenue";
import { MarginHeatmap } from "../revenue/margin-heatmap";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { FinancePeriod, Granularity } from "@/hooks/use-finance-period";
import { resolveOrderLineCost, type CostSnapshots } from "@/lib/finance/item-cost";
import { isRealizedRevenue } from "@/lib/order-revenue";
import { useLanguage } from "@/hooks/use-language";

interface Props {
    orders: Order[];
    products: Product[];
    period: FinancePeriod;
    granularity: Granularity;
    /** Unit costs frozen at delivery; absent lines use the cost on file now. */
    snapshots?: CostSnapshots;
}

interface SkuRow {
    key: string;
    name: string;
    sku?: string;
    productId?: string;
    revenue: number;
    units: number;
    orders: number;
    cogs: number;
    grossProfit: number;
    grossMarginPct: number;
    aov: number;
    returnedUnits: number;
    returnRatePct: number;
    quadrant: "star" | "cow" | "dog" | "question";
}

const REFUND_STATUSES = new Set(["refund_delivered", "refund_failed", "return_pending"]);

export function ProductsFinanceTab({ orders, products, period, granularity, snapshots }: Props) {
    const range = useMemo(() => ({ start: period.start, end: period.end }), [period.start, period.end]);
    const revenue = useFinanceRevenue(orders, products, range, null, granularity);

    const skuRows = useMemo<SkuRow[]>(() => {
        const start = period.start.getTime();
        const end = period.end.getTime();
        const map = new Map<string, SkuRow>();

        const productLink = (item: { name?: string; sku?: string }): string | undefined => {
            if (item.sku) {
                const p = products.find(p => p.sku?.toLowerCase() === item.sku?.toLowerCase());
                if (p) return p.id;
            }
            if (item.name) {
                const p = products.find(p => p.name.toLowerCase() === item.name?.toLowerCase());
                if (p) return p.id;
            }
            return undefined;
        };

        for (const o of orders) {
            const t = o.created_at ? new Date(o.created_at).getTime() : 0;
            if (t < start || t > end) continue;
            const isRevenue = isRealizedRevenue(o);
            const isRefund = REFUND_STATUSES.has(o.status);
            if (!isRevenue && !isRefund) continue;

            for (const [index, item] of (o.items || []).entries()) {
                // Prefer the canonical product id so the same product collapses
                // even when one order line carries an SKU and another only a name.
                const productId = productLink(item);
                const key = productId
                    || (item.sku ? `sku:${item.sku.toLowerCase()}` : "")
                    || (item.name ? `name:${item.name.toLowerCase()}` : "—");
                let row = map.get(key);
                if (!row) {
                    row = {
                        key,
                        name: item.name || item.sku || "",
                        sku: item.sku,
                        productId,
                        revenue: 0, units: 0, orders: 0,
                        cogs: 0, grossProfit: 0, grossMarginPct: 0, aov: 0,
                        returnedUnits: 0, returnRatePct: 0,
                        quadrant: "question",
                    };
                    map.set(key, row);
                }
                if (isRevenue) {
                    row.revenue += (Number(item.price) || 0) * item.quantity;
                    row.units += item.quantity;
                    row.orders += 1;
                    row.cogs += resolveOrderLineCost(o, index, item, products, snapshots).cost;
                }
                if (isRefund) {
                    row.returnedUnits += item.quantity;
                }
            }
        }

        const rows = Array.from(map.values());
        for (const r of rows) {
            r.grossProfit = r.revenue - r.cogs;
            r.grossMarginPct = r.revenue > 0 ? (r.grossProfit / r.revenue) * 100 : 0;
            r.aov = r.orders > 0 ? r.revenue / r.orders : 0;
            const totalUnits = r.units + r.returnedUnits;
            r.returnRatePct = totalUnits > 0 ? (r.returnedUnits / totalUnits) * 100 : 0;
        }

        // Classify into BCG-style quadrants by velocity (units) × margin.
        // Only products with actual sales get a quadrant — zero-sale SKUs default to "question".
        const sold = rows.filter(r => r.units > 0);
        const medianUnits = median(sold.map(r => r.units));
        const medianMargin = median(sold.map(r => r.grossMarginPct).filter(m => Number.isFinite(m)));
        for (const r of rows) {
            if (r.units <= 0) {
                r.quadrant = "question";
                continue;
            }
            const fastVelocity = r.units >= medianUnits;
            const highMargin = r.grossMarginPct >= medianMargin;
            r.quadrant = fastVelocity && highMargin ? "star"
                : fastVelocity && !highMargin ? "cow"
                    : !fastVelocity && highMargin ? "question"
                        : "dog";
        }

        return rows.sort((a, b) => b.revenue - a.revenue);
    }, [orders, products, snapshots, period.start, period.end]);

    const quadrantCounts = useMemo(() => ({
        star: skuRows.filter(r => r.quadrant === "star").length,
        cow: skuRows.filter(r => r.quadrant === "cow").length,
        question: skuRows.filter(r => r.quadrant === "question").length,
        dog: skuRows.filter(r => r.quadrant === "dog").length,
    }), [skuRows]);

    return (
        <div className="space-y-5">
            <QuadrantOverview counts={quadrantCounts} totalSkus={skuRows.length} />
            <MarginHeatmap data={revenue.heatmap} />
            <UnitEconomicsTable rows={skuRows} />
        </div>
    );
}

function QuadrantOverview({
    counts, totalSkus,
}: { counts: Record<"star" | "cow" | "question" | "dog", number>; totalSkus: number }) {
    const { t } = useLanguage();
    const tiles = [
        { key: "star", label: t("finances.products.q.star"), value: counts.star, sub: t("finances.products.q.starSub"), icon: Sparkles, tone: "emerald" as const },
        { key: "cow", label: t("finances.products.q.cow"), value: counts.cow, sub: t("finances.products.q.cowSub"), icon: TrendingUp, tone: "violet" as const },
        { key: "question", label: t("finances.products.q.question"), value: counts.question, sub: t("finances.products.q.questionSub"), icon: AlertCircle, tone: "amber" as const },
        { key: "dog", label: t("finances.products.q.dog"), value: counts.dog, sub: t("finances.products.q.dogSub"), icon: TrendingDown, tone: "rose" as const },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((tile, i) => {
                const Icon = tile.icon;
                const ring = tile.tone === "emerald" ? "ring-emerald-500/20"
                    : tile.tone === "violet" ? "ring-violet-500/20"
                        : tile.tone === "amber" ? "ring-amber-500/20"
                            : "ring-rose-500/20";
                const iconClr = tile.tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : tile.tone === "violet" ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
                        : tile.tone === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            : "text-rose-600 dark:text-rose-400 bg-rose-500/10";
                return (
                    <motion.div
                        key={tile.key}
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
                        <div className="text-2xl font-bold text-foreground tabular-nums">{tile.value}</div>
                        <div className="text-[10.5px] text-muted">
                            <bdi>
                                {totalSkus > 0 ? `${t("finances.products.q.ofCatalog", { pct: ((tile.value / totalSkus) * 100).toFixed(0) })} · ` : ""}{tile.sub}
                            </bdi>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function UnitEconomicsTable({ rows }: { rows: SkuRow[] }) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(() => {
        if (!query) return rows;
        const q = query.toLowerCase();
        return rows.filter(r =>
            r.name.toLowerCase().includes(q) ||
            (r.sku || "").toLowerCase().includes(q)
        );
    }, [rows, query]);

    const visible = showAll ? filtered : filtered.slice(0, 15);

    return (
        <SectionCard
            title={t("finances.products.table.title")}
            subtitle={rows.length === 0 ? t("finances.products.table.none") : rows.length === 1 ? t("finances.products.table.soldOne") : t("finances.products.table.soldCount", { count: rows.length })}
            icon={Package}
            accent="violet"
            action={
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("finances.products.table.search")}
                        className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-violet-500/50 w-44"
                    />
                </div>
            }
        >
            {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                    {t("finances.products.table.empty")}
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto -mx-2 px-2">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                                    <th className="text-left py-2 pr-2">{t("finances.products.table.product")}</th>
                                    <th className="text-left py-2 px-2">{t("finances.products.table.quadrant")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.units")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.revenue")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.cogs")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.gross")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.margin")}</th>
                                    <th className="text-right py-2 px-2">{t("finances.products.table.returns")}</th>
                                    <th className="text-right py-2 pl-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((r, i) => (
                                    <motion.tr
                                        key={r.key}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.015, 0.25) }}
                                        className="border-b border-[var(--card-border)]/60 last:border-0 hover:bg-[var(--background)]/40"
                                    >
                                        <td className="py-2.5 pr-2">
                                            <div className="font-medium text-foreground truncate max-w-[200px]">{r.name || t("finances.products.unknown")}</div>
                                            {r.sku && <div className="text-[10.5px] text-muted font-mono">{r.sku}</div>}
                                        </td>
                                        <td className="py-2 px-2">
                                            <QuadrantBadge quadrant={r.quadrant} />
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums text-foreground">{r.units}</td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <FinanceValue value={r.revenue} abbreviate className="text-foreground" />
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            {r.cogs > 0 ? (
                                                <FinanceValue value={r.cogs} abbreviate className="text-muted" />
                                            ) : (
                                                <span className="text-muted/60">—</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <FinanceValue
                                                value={r.grossProfit}
                                                abbreviate
                                                className={r.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
                                            />
                                        </td>
                                        <td className={cn(
                                            "py-2 px-2 text-right tabular-nums font-medium",
                                            r.cogs === 0 ? "text-muted/60" :
                                                r.grossMarginPct >= 50 ? "text-emerald-600 dark:text-emerald-400" :
                                                    r.grossMarginPct >= 25 ? "text-foreground" :
                                                        r.grossMarginPct >= 0 ? "text-amber-600 dark:text-amber-400" :
                                                            "text-rose-600 dark:text-rose-400"
                                        )}>
                                            {r.cogs === 0 ? "—" : `${r.grossMarginPct.toFixed(1)}%`}
                                        </td>
                                        <td className={cn(
                                            "py-2 px-2 text-right tabular-nums",
                                            r.returnRatePct >= 5 ? "text-rose-600 dark:text-rose-400 font-medium" :
                                                r.returnRatePct >= 2 ? "text-amber-600 dark:text-amber-400" :
                                                    "text-muted"
                                        )}>
                                            {r.returnRatePct === 0 ? "—" : `${r.returnRatePct.toFixed(1)}%`}
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            {r.productId ? (
                                                <Link
                                                    href={`/products/${r.productId}`}
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-foreground hover:bg-[var(--background)] transition-colors"
                                                    title={t("finances.products.table.open")}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </Link>
                                            ) : null}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > 15 && (
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={() => setShowAll(s => !s)}
                                className="text-[12px] text-muted hover:text-foreground font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--background)] transition-colors"
                            >
                                {showAll ? t("finances.products.table.showLess") : t("finances.products.table.showAll", { count: filtered.length })}
                            </button>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
}

function QuadrantBadge({ quadrant }: { quadrant: SkuRow["quadrant"] }) {
    const { t } = useLanguage();
    const map = {
        star: { label: t("finances.products.q.badgeStar"), tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
        cow: { label: t("finances.products.q.badgeCow"), tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" },
        question: { label: t("finances.products.q.badgeQuestion"), tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
        dog: { label: t("finances.products.q.badgeDog"), tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
    };
    const { label, tone } = map[quadrant];
    return (
        <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border",
            tone
        )}>
            {label}
        </span>
    );
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
