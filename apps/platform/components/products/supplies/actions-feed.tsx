"use client";

import { useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    PackageX,
    ShoppingCart,
    TrendingUp,
    X,
    Zap,
} from "lucide-react";
import type { Product } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
    dailyRateFromHistory,
    daysUntilStockout,
    deadStockScore,
    detectConsumptionAnomaly,
    splitOutMovements,
    type HistoryEntry,
} from "@/lib/utils/supply-forecasting";
import { useSupplierPos } from "@/hooks/use-supplier-pos";
import { useLanguage } from "@/hooks/use-language";

const COLLAPSE_KEY = "supplies.actionsFeed.collapsed";

type ActionKind =
    | "reorder"
    | "critical"
    | "spike"
    | "dead"
    | "drift";

interface Action {
    id: string;
    supply: Product;
    kind: ActionKind;
    title: string;
    detail: string;
    tone: "rose" | "amber" | "slate" | "sky";
    icon: typeof ShoppingCart;
    ctaLabel: string;
}

interface SupplySupplierRaw {
    supplier_name?: string;
    is_primary?: boolean;
    lead_time_days?: number | null;
}

interface ActionsFeedProps {
    supplies: Product[];
    historyBySupply: Map<string, HistoryEntry[]>;
    onOpenSupply?: (p: Product) => void;
    onOpenReorder?: () => void;
}

const TONE_CLASSES: Record<
    Action["tone"],
    { card: string; iconWrap: string; cta: string }
> = {
    rose: {
        card: "bg-gradient-to-br from-rose-50 to-rose-50/30 border-rose-200/70 dark:from-rose-950/40 dark:to-rose-950/10 dark:border-rose-900/50",
        iconWrap: "bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300",
        cta: "bg-rose-500 hover:bg-rose-600 text-white",
    },
    amber: {
        card: "bg-gradient-to-br from-amber-50 to-amber-50/30 border-amber-200/70 dark:from-amber-950/40 dark:to-amber-950/10 dark:border-amber-900/50",
        iconWrap: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300",
        cta: "bg-amber-500 hover:bg-amber-600 text-white",
    },
    slate: {
        card: "bg-gradient-to-br from-slate-50 to-slate-50/30 border-slate-200/70 dark:from-slate-950/40 dark:to-slate-950/10 dark:border-slate-900/50",
        iconWrap: "bg-slate-200 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300",
        cta: "bg-slate-600 hover:bg-slate-700 text-white",
    },
    sky: {
        card: "bg-gradient-to-br from-sky-50 to-sky-50/30 border-sky-200/70 dark:from-sky-950/40 dark:to-sky-950/10 dark:border-sky-900/50",
        iconWrap: "bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300",
        cta: "bg-sky-500 hover:bg-sky-600 text-white",
    },
};

function primarySupplierOf(supply: Product): SupplySupplierRaw | null {
    const raw = (supply as unknown as { suppliers?: SupplySupplierRaw[] }).suppliers;
    const list = Array.isArray(raw) ? raw : [];
    if (list.length === 0) return null;
    return list.find((s) => s?.is_primary) ?? list[0];
}

function leadTimeOf(supply: Product): number | null {
    const primary = primarySupplierOf(supply);
    const lt = primary?.lead_time_days;
    return typeof lt === "number" && lt > 0 ? lt : null;
}

export function ActionsFeed({
    supplies,
    historyBySupply,
    onOpenSupply,
    onOpenReorder,
}: ActionsFeedProps) {
    const { t } = useLanguage();
    const [collapsed, setCollapsed] = useState<boolean>(false);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const { data: supplierPos = [] } = useSupplierPos();

    useEffect(() => {
        try {
            if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
        } catch {}
    }, []);

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
            } catch {}
            return next;
        });
    };

    // Build a per-supplier drift flag from received POs (actual days vs quoted).
    const driftedSuppliers = useMemo(() => {
        const day = 24 * 60 * 60 * 1000;
        // Quoted lead-time lookup per supplier_name (lower-case key).
        const quotedBySupplier = new Map<string, number>();
        for (const s of supplies) {
            const raw = (s as unknown as { suppliers?: SupplySupplierRaw[] }).suppliers;
            const list = Array.isArray(raw) ? raw : [];
            for (const link of list) {
                const name = (link?.supplier_name ?? "").trim().toLowerCase();
                const lt = link?.lead_time_days;
                if (!name || typeof lt !== "number" || lt <= 0) continue;
                const existing = quotedBySupplier.get(name);
                if (existing == null || lt < existing) quotedBySupplier.set(name, lt);
            }
        }
        const drifted = new Set<string>();
        for (const po of supplierPos) {
            if (!po.received_at || !po.created_at) continue;
            const name = (po.supplier_name ?? "").trim().toLowerCase();
            if (!name) continue;
            const quoted = quotedBySupplier.get(name);
            if (!quoted) continue;
            const actualDays =
                (new Date(po.received_at).getTime() - new Date(po.created_at).getTime()) / day;
            if (actualDays > quoted * 1.3) drifted.add(name);
        }
        return drifted;
    }, [supplies, supplierPos]);

    const actions = useMemo<Action[]>(() => {
        const seen = new Set<string>();
        const out: Action[] = [];

        const push = (a: Action) => {
            if (seen.has(a.supply.id)) return;
            if (dismissed.has(a.id)) return;
            seen.add(a.supply.id);
            out.push(a);
        };

        // 1. Reorder now (or critical stockout < lead time)
        for (const s of supplies) {
            const stock = s.stock_quantity ?? 0;
            const reserved = s.reserved_quantity ?? 0;
            const available = Math.max(0, stock - reserved);
            const rp = s.reorder_point ?? s.low_stock_threshold ?? 5;
            if (stock > rp) continue;
            const entries = historyBySupply.get(s.id) ?? [];
            const rate = dailyRateFromHistory(entries);
            const eta = daysUntilStockout(available, rate);
            const leadTime = leadTimeOf(s);
            const isCritical =
                leadTime != null && eta != null && eta < leadTime;
            const detail = isCritical
                ? t("supplies.af.stockoutDetail", { eta: eta ?? 0, lead: leadTime ?? 0 })
                : eta != null
                ? t("supplies.af.supplyLeft", { eta })
                : t("supplies.af.atReorderPoint", { rp });
            push({
                id: `${isCritical ? "crit" : "reorder"}:${s.id}`,
                supply: s,
                kind: isCritical ? "critical" : "reorder",
                title: isCritical ? t("supplies.af.stockoutBeforeLead") : t("supplies.af.reorderNow"),
                detail,
                tone: "rose",
                icon: isCritical ? Zap : ShoppingCart,
                ctaLabel: t("supplies.af.reorder"),
            });
            if (out.length >= 6) return out;
        }

        // 2. Consumption spikes
        for (const s of supplies) {
            if (out.length >= 6) break;
            const entries = historyBySupply.get(s.id) ?? [];
            const { last7dOut, prior23dOut } = splitOutMovements(entries);
            const { isAnomaly, multiplier } = detectConsumptionAnomaly({
                last7dOut,
                prior23dOut,
            });
            if (!isAnomaly) continue;
            push({
                id: `spike:${s.id}`,
                supply: s,
                kind: "spike",
                title: t("supplies.af.spike"),
                detail: t("supplies.af.spikeDetail", { multiplier: multiplier.toFixed(1) }),
                tone: "amber",
                icon: TrendingUp,
                ctaLabel: t("supplies.af.review"),
            });
        }

        // 3. Dead stock
        for (const s of supplies) {
            if (out.length >= 6) break;
            const stock = s.stock_quantity ?? 0;
            if (stock <= 0) continue;
            const entries = historyBySupply.get(s.id) ?? [];
            const { daysSinceLastOut } = splitOutMovements(entries);
            const score = deadStockScore({ daysSinceLastOut, stock });
            if (score !== "dead") continue;
            const label =
                daysSinceLastOut === null
                    ? t("supplies.af.noMovement")
                    : t("supplies.af.noMovementDays", { days: daysSinceLastOut });
            push({
                id: `dead:${s.id}`,
                supply: s,
                kind: "dead",
                title: t("supplies.af.dead"),
                detail: label,
                tone: "slate",
                icon: PackageX,
                ctaLabel: t("supplies.af.open"),
            });
        }

        // 4. Lead-time drift
        for (const s of supplies) {
            if (out.length >= 6) break;
            const primary = primarySupplierOf(s);
            const name = (primary?.supplier_name ?? "").trim().toLowerCase();
            if (!name || !driftedSuppliers.has(name)) continue;
            push({
                id: `drift:${s.id}`,
                supply: s,
                kind: "drift",
                title: t("supplies.af.drift"),
                detail: t("supplies.af.driftDetail", { supplier: primary?.supplier_name ?? t("supplies.af.supplierFallback") }),
                tone: "sky",
                icon: Clock,
                ctaLabel: t("supplies.af.open"),
            });
        }

        return out.slice(0, 6);
    }, [supplies, historyBySupply, driftedSuppliers, dismissed, t]);

    const dismissAction = (id: string) => {
        setDismissed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    const handleCta = (a: Action) => {
        if (a.kind === "reorder" || a.kind === "critical") {
            onOpenReorder?.();
            return;
        }
        onOpenSupply?.(a.supply);
    };

    if (supplies.length === 0) return null;

    if (actions.length === 0) {
        return (
            <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-emerald-50/30 dark:from-emerald-950/40 dark:to-emerald-950/10 dark:border-emerald-900/50 px-4 py-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    All clear — no urgent supply actions right now.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">
                        {t("supplies.af.today")}
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-semibold tabular-nums">
                        {actions.length}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                    aria-expanded={!collapsed}
                >
                    {collapsed ? (
                        <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            {t("supplies.af.expand")}
                        </>
                    ) : (
                        <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            {t("supplies.af.collapse")}
                        </>
                    )}
                </button>
            </div>

            {!collapsed && (
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1">
                    {actions.map((a) => {
                        const tone = TONE_CLASSES[a.tone];
                        const Icon = a.icon;
                        return (
                            <div
                                key={a.id}
                                className={cn(
                                    "snap-start shrink-0 w-[280px] rounded-2xl border p-3.5 relative flex flex-col gap-2 shadow-sm",
                                    tone.card
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => dismissAction(a.id)}
                                    aria-label={t("supplies.af.dismiss")}
                                    className="absolute top-2 right-2 p-1 rounded-md text-muted hover:text-foreground hover:bg-white/60 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>

                                <div className="flex items-start gap-2.5 pr-6">
                                    <div
                                        className={cn(
                                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                            tone.iconWrap
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                            {a.title}
                                        </p>
                                        <p className="text-sm font-semibold truncate">
                                            {a.supply.name}
                                        </p>
                                    </div>
                                </div>

                                <p className="text-[11px] text-foreground/80 line-clamp-2 min-h-[28px]">
                                    {a.detail}
                                </p>

                                <div className="flex items-center gap-2 mt-1">
                                    <button
                                        type="button"
                                        onClick={() => handleCta(a)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-all active:scale-[0.98]",
                                            tone.cta
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {a.ctaLabel}
                                    </button>
                                    {onOpenSupply && (
                                        <button
                                            type="button"
                                            onClick={() => onOpenSupply(a.supply)}
                                            className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
                                        >
                                            {t("supplies.af.open")}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
