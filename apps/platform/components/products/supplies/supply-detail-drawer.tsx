"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowDownRight,
    ArrowUpRight,
    Box,
    ChevronLeft,
    ChevronRight,
    Clock,
    Edit2,
    FileText,
    Loader2,
    Package,
    ShoppingCart,
    Truck,
    Users,
    X,
} from "lucide-react";
import type { Product } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useSupplyHistory, type InventoryHistoryEntry } from "@/hooks/use-supply-history";
import { useSupplyRecipeUsage, type RecipeUsageRow } from "@/hooks/use-supply-recipe-usage";
import type { HistoryEntry } from "@/lib/utils/supply-forecasting";
import { useLanguage } from "@/hooks/use-language";
import { StockFillBar } from "./stock-fill-bar";
import { DaysOfSupplyPill, daysOfSupplyFrom } from "./days-of-supply-pill";
import { StockoutEtaBadge, stockoutEtaFrom } from "./stockout-eta-badge";
import { PoStatusChip, type PoStatusInfo } from "./po-status-chip";
import { SupplierInitialsBadge } from "./supplier-initials-badge";
import { ConsumptionSparkline } from "./consumption-sparkline";

type TabKey = "overview" | "suppliers" | "history" | "recipe";

const TABS: { key: TabKey; labelKey: string }[] = [
    { key: "overview", labelKey: "supplies.sp.tabOverview" },
    { key: "suppliers", labelKey: "supplies.sp.tabSuppliers" },
    { key: "history", labelKey: "supplies.sp.tabHistory" },
    { key: "recipe", labelKey: "supplies.sp.tabRecipe" },
];

interface SupplyDetailDrawerProps {
    open: boolean;
    supply: Product | null;
    openPo?: PoStatusInfo | null;
    /**
     * Optional pre-fetched 30d history from the tenant-scoped batch query.
     * When provided, History tab reuses it instead of a per-supply fetch.
     */
    history?: HistoryEntry[];
    /** Optional nav: previous / next supply in the filtered list. */
    onNavigate?: (direction: "prev" | "next") => void;
    onClose: () => void;
    onEdit?: (product: Product) => void;
    onAdjustStock?: (product: Product, delta: number) => void;
    onReorder?: (product: Product) => void;
}

interface SupplySupplierRaw {
    supplier_name?: string;
    supplier_contact?: string;
    supplier_email?: string;
    lead_time_days?: number | null;
    minimum_order_quantity?: number | null;
    unit_cost?: number | null;
    is_primary?: boolean;
}

export function SupplyDetailDrawer({
    open,
    supply,
    openPo,
    history,
    onNavigate,
    onClose,
    onEdit,
    onAdjustStock,
    onReorder,
}: SupplyDetailDrawerProps) {
    const { t } = useLanguage();
    const [tab, setTab] = useState<TabKey>("overview");

    useEffect(() => {
        if (!open) return;
        setTab("overview");
    }, [open, supply?.id]);

    // Keyboard: j/k for prev/next supply, Esc closes.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const editing =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                target?.isContentEditable;
            if (editing) return;
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "j" || e.key === "ArrowDown") {
                if (onNavigate) {
                    e.preventDefault();
                    onNavigate("next");
                }
            } else if (e.key === "k" || e.key === "ArrowUp") {
                if (onNavigate) {
                    e.preventDefault();
                    onNavigate("prev");
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose, onNavigate]);

    return (
        <AnimatePresence>
            {open && supply && (
                <>
                    <motion.div
                        key="backdrop"
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        key="panel"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("supplies.sp.detail", { name: supply.name })}
                        className="fixed right-0 top-0 bottom-0 w-full md:w-[600px] bg-[var(--background)] shadow-2xl z-50 flex flex-col"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 260 }}
                    >
                        <Header
                            supply={supply}
                            openPo={openPo}
                            onClose={onClose}
                            onEdit={onEdit}
                            onReorder={onReorder}
                            onAdjustStock={onAdjustStock}
                            onNavigate={onNavigate}
                        />
                        <Tabs tab={tab} onChange={setTab} />
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {tab === "overview" && <OverviewTab supply={supply} />}
                            {tab === "suppliers" && <SuppliersTab supply={supply} />}
                            {tab === "history" && (
                                <HistoryTab supplyId={supply.id} preloaded={history} />
                            )}
                            {tab === "recipe" && (
                                <RecipeTab
                                    supplyId={supply.id}
                                    onSelectProduct={onEdit}
                                />
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function Header({
    supply,
    openPo,
    onClose,
    onEdit,
    onReorder,
    onAdjustStock,
    onNavigate,
}: {
    supply: Product;
    openPo?: PoStatusInfo | null;
    onClose: () => void;
    onEdit?: (p: Product) => void;
    onReorder?: (p: Product) => void;
    onAdjustStock?: (p: Product, delta: number) => void;
    onNavigate?: (d: "prev" | "next") => void;
}) {
    const { t } = useLanguage();
    return (
        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[var(--background)] flex items-center justify-center shrink-0 ring-1 ring-[var(--card-border)]">
                    {supply.image_url ? (
                        <img
                            src={supply.image_url}
                            alt={supply.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <Box className="w-6 h-6 text-teal-600" />
                    )}
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-tight truncate">
                        {supply.name}
                    </h2>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted flex-wrap">
                        <span className="font-mono truncate max-w-[180px]">
                            {supply.sku || t("supplies.sp.noSku")}
                        </span>
                        {openPo && <PoStatusChip info={openPo} size="sm" />}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {onNavigate && (
                    <>
                        <button
                            type="button"
                            onClick={() => onNavigate("prev")}
                            title="Previous (k)"
                            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-[var(--card-border)]/40"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate("next")}
                            title="Next (j)"
                            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-[var(--card-border)]/40"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </>
                )}
                {onReorder && (
                    <button
                        type="button"
                        onClick={() => onReorder(supply)}
                        title={t("supplies.sp.createPo")}
                        className="p-1.5 rounded-lg text-muted hover:text-teal-700 hover:bg-teal-50"
                    >
                        <ShoppingCart className="w-4 h-4" />
                    </button>
                )}
                {onEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(supply)}
                        title={t("supplies.sp.edit")}
                        className="p-1.5 rounded-lg text-muted hover:text-sky-700 hover:bg-sky-50"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-[var(--card-border)]/40"
                    aria-label={t("supplies.sp.close")}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function Tabs({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
    const { t } = useLanguage();
    return (
        <div className="border-b border-[var(--card-border)] px-5 flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onChange(item.key)}
                    className={cn(
                        "relative px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
                        tab === item.key
                            ? "text-foreground"
                            : "text-muted hover:text-foreground"
                    )}
                >
                    {t(item.labelKey)}
                    {tab === item.key && (
                        <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-teal-500" />
                    )}
                </button>
            ))}
        </div>
    );
}

function OverviewTab({ supply }: { supply: Product }) {
    const { t } = useLanguage();
    const stock = supply.stock_quantity ?? 0;
    const reserved = supply.reserved_quantity ?? 0;
    const available = Math.max(0, stock - reserved);
    const timesSold = supply.times_sold_30d ?? 0;
    const days = daysOfSupplyFrom({ stock, reserved, timesSold30d: timesSold });
    const eta = stockoutEtaFrom({ stock, reserved, timesSold30d: timesSold });
    const onHandValue = stock * (supply.cost ?? 0);

    return (
        <div className="space-y-4">
            {/* Stock bar with numbers */}
            <div className="pastel-card p-4">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted font-medium">
                        {t("supplies.sp.stockOnHand")}
                    </p>
                    <div className="flex items-center gap-1.5">
                        <DaysOfSupplyPill days={days} size="md" />
                        <StockoutEtaBadge daysUntilStockout={eta} />
                    </div>
                </div>
                <p className="text-3xl font-bold tabular-nums leading-none">{stock}</p>
                <div className="mt-3">
                    <StockFillBar
                        stock={stock}
                        reorderPoint={supply.reorder_point}
                        lowStockThreshold={supply.low_stock_threshold}
                    />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <StatCell label={t("supplies.sp.reserved")} value={reserved.toString()} />
                    <StatCell label={t("supplies.sp.available")} value={available.toString()} />
                    <StatCell
                        label={t("supplies.sp.reorderPoint")}
                        value={supply.reorder_point?.toString() ?? "—"}
                    />
                </div>
            </div>

            {/* Value stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-teal-200/50 bg-gradient-to-br from-teal-50 to-teal-50/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted font-medium">
                        {t("supplies.sp.unitCost")}
                    </p>
                    <p className="text-lg font-bold tabular-nums mt-0.5">
                        {formatIQD(supply.cost ?? 0)}
                    </p>
                </div>
                <div className="rounded-2xl border border-teal-200/50 bg-gradient-to-br from-teal-50 to-teal-50/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted font-medium">
                        {t("supplies.sp.onHandValue")}
                    </p>
                    <p className="text-lg font-bold tabular-nums mt-0.5">
                        {formatIQD(onHandValue)}
                    </p>
                </div>
            </div>

            {supply.description && (
                <div className="pastel-card p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted font-medium mb-1">
                        {t("supplies.sp.description")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{supply.description}</p>
                </div>
            )}
        </div>
    );
}

function StatCell({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
            <p className="font-semibold text-sm tabular-nums mt-0.5">{value}</p>
        </div>
    );
}

function SuppliersTab({ supply }: { supply: Product }) {
    const { t } = useLanguage();
    const raw = (supply as unknown as { suppliers?: SupplySupplierRaw[] }).suppliers;
    const suppliers = Array.isArray(raw) ? raw : [];
    if (suppliers.length === 0) {
        return (
            <div className="text-center py-12 text-muted text-sm">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-60" />
                {t("supplies.sp.noSuppliers")}
            </div>
        );
    }
    const sorted = [...suppliers].sort((a, b) =>
        a.is_primary && !b.is_primary ? -1 : b.is_primary && !a.is_primary ? 1 : 0
    );
    return (
        <div className="space-y-2">
            {sorted.map((s, idx) => {
                const name = (s.supplier_name ?? "").trim();
                if (!name) return null;
                return (
                    <div
                        key={`${name}-${idx}`}
                        className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 flex items-start gap-3"
                    >
                        <SupplierInitialsBadge name={name} size="md" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm truncate">{name}</p>
                                {s.is_primary && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold uppercase tracking-wide">
                                        {t("supplies.sp.primary")}
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                                {s.supplier_contact && <span>{s.supplier_contact}</span>}
                                {s.supplier_email && <span>{s.supplier_email}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                                {s.lead_time_days != null && (
                                    <SupplierStat label={t("supplies.sp.leadTime")} value={t("supplies.sp.leadDays", { n: s.lead_time_days })} />
                                )}
                                {s.minimum_order_quantity != null && s.minimum_order_quantity > 1 && (
                                    <SupplierStat label={t("supplies.sp.moq")} value={s.minimum_order_quantity.toString()} />
                                )}
                                {s.unit_cost != null && (
                                    <SupplierStat label={t("supplies.sp.unit")} value={formatIQD(s.unit_cost)} />
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function SupplierStat({ label, value }: { label: string; value: string }) {
    return (
        <span className="inline-flex items-baseline gap-1">
            <span className="text-muted uppercase tracking-wide text-[9px]">{label}</span>
            <span className="font-medium tabular-nums text-[11px]">{value}</span>
        </span>
    );
}

const CHANGE_TYPE_LABEL: Record<string, { labelKey: string; tone: string }> = {
    received: { labelKey: "supplies.sp.ct.received", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    sold: { labelKey: "supplies.sp.ct.sold", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
    sale: { labelKey: "supplies.sp.ct.sold", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
    adjusted: { labelKey: "supplies.sp.ct.adjusted", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
    adjustment: { labelKey: "supplies.sp.ct.adjusted", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
    returned: { labelKey: "supplies.sp.ct.returned", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
    reserved: { labelKey: "supplies.sp.ct.reserved", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
    quarantined: { labelKey: "supplies.sp.ct.quarantined", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
    stock_take: { labelKey: "supplies.sp.ct.stock_take", tone: "bg-teal-50 text-teal-700 ring-teal-200" },
    transfer: { labelKey: "supplies.sp.ct.transfer", tone: "bg-violet-50 text-violet-700 ring-violet-200" },
    shrinkage: { labelKey: "supplies.sp.ct.shrinkage", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
    damaged: { labelKey: "supplies.sp.ct.damaged", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
};

function labelFor(
    type: string | null,
    t: (key: string) => string
): { label: string; tone: string } {
    const neutral = "bg-slate-100 text-slate-600 ring-slate-200";
    if (!type) return { label: t("supplies.sp.ct.event"), tone: neutral };
    const known = CHANGE_TYPE_LABEL[type];
    if (known) return { label: t(known.labelKey), tone: known.tone };
    return { label: type.replace(/_/g, " "), tone: neutral };
}

function HistoryTab({
    supplyId,
    preloaded,
}: {
    supplyId: string;
    preloaded?: HistoryEntry[];
}) {
    const { t } = useLanguage();
    const hasPreloaded = preloaded !== undefined;
    const { data: fetched, isLoading } = useSupplyHistory(supplyId, !hasPreloaded);
    const data = hasPreloaded ? null : fetched;
    const thirty = useMemo(
        () => summarize30d((data ?? preloaded ?? []) as HistoryEntry[]),
        [data, preloaded]
    );
    const sparkEntries: HistoryEntry[] = useMemo(() => {
        if (preloaded) return preloaded;
        return (fetched ?? []) as HistoryEntry[];
    }, [preloaded, fetched]);

    if (!hasPreloaded && isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t("supplies.sp.loadingHistory")}
            </div>
        );
    }

    const hasPreloadedData = hasPreloaded && preloaded && preloaded.length > 0;
    const hasFetchedData = !hasPreloaded && fetched && fetched.length > 0;
    if (!hasPreloadedData && !hasFetchedData) {
        return (
            <div className="text-center py-12 text-muted text-sm">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-60" />
                {t("supplies.sp.noMovements")}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-wide text-muted font-medium">
                    {t("supplies.sp.consumption30")}
                </p>
                <ConsumptionSparkline entries={sparkEntries} width={120} height={28} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <SummaryTile
                    label={t("supplies.sp.in30")}
                    value={`+${thirty.inQty}`}
                    tone="emerald"
                    icon={ArrowDownRight}
                />
                <SummaryTile
                    label={t("supplies.sp.out30")}
                    value={`-${thirty.outQty}`}
                    tone="rose"
                    icon={ArrowUpRight}
                />
                <SummaryTile
                    label={t("supplies.sp.net")}
                    value={thirty.net >= 0 ? `+${thirty.net}` : `${thirty.net}`}
                    tone={thirty.net >= 0 ? "emerald" : "rose"}
                    icon={Package}
                />
            </div>

            {!hasPreloaded && fetched && (
                <div className="space-y-1.5">
                    {fetched.map((e) => (
                        <HistoryRow key={e.id} entry={e} />
                    ))}
                </div>
            )}
        </div>
    );
}

function summarize30d(entries: HistoryEntry[]) {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let inQty = 0;
    let outQty = 0;
    for (const e of entries) {
        const t = e.created_at ? new Date(e.created_at).getTime() : 0;
        if (t < since) continue;
        const q = e.quantity_change ?? 0;
        if (q >= 0) inQty += q;
        else outQty += Math.abs(q);
    }
    return { inQty, outQty, net: inQty - outQty };
}

function SummaryTile({
    label,
    value,
    tone,
    icon: Icon,
}: {
    label: string;
    value: string;
    tone: "emerald" | "rose";
    icon: typeof Package;
}) {
    const cls =
        tone === "emerald"
            ? "from-emerald-50 to-emerald-50/20 border-emerald-200/50 text-emerald-800"
            : "from-rose-50 to-rose-50/20 border-rose-200/50 text-rose-800";
    return (
        <div className={cn("rounded-xl border bg-gradient-to-br p-2.5", cls)}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
                <Icon className="w-3 h-3" />
                {label}
            </div>
            <p className="text-lg font-bold tabular-nums mt-0.5">{value}</p>
        </div>
    );
}

function HistoryRow({ entry }: { entry: InventoryHistoryEntry }) {
    const { t } = useLanguage();
    const q = entry.quantity_change ?? 0;
    const tag = labelFor(entry.change_type, t);
    const when = entry.created_at ? new Date(entry.created_at) : null;
    const dateLabel = when ? when.toLocaleDateString() : "—";
    const timeLabel = when
        ? when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

    return (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span
                        className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded-full ring-1 text-[10px] font-medium",
                            tag.tone
                        )}
                    >
                        {tag.label}
                    </span>
                    <span className="text-[11px] text-muted">
                        {dateLabel}
                        {timeLabel ? ` · ${timeLabel}` : ""}
                    </span>
                </div>
                {entry.notes && (
                    <p className="mt-1 text-[11px] text-muted line-clamp-2">{entry.notes}</p>
                )}
                {entry.quantity_before != null && entry.quantity_after != null && (
                    <p className="mt-0.5 text-[10px] text-muted tabular-nums">
                        {entry.quantity_before} → {entry.quantity_after}
                    </p>
                )}
            </div>
            <p
                className={cn(
                    "text-lg font-bold tabular-nums shrink-0",
                    q >= 0 ? "text-emerald-700" : "text-rose-700"
                )}
            >
                {q >= 0 ? "+" : ""}
                {q}
            </p>
        </div>
    );
}

function RecipeTab({
    supplyId,
    onSelectProduct,
}: {
    supplyId: string;
    onSelectProduct?: (p: Product) => void;
}) {
    const { t } = useLanguage();
    const { data, isLoading } = useSupplyRecipeUsage(supplyId);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t("supplies.sp.loadingRecipes")}
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-12 text-muted text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-60" />
                {t("supplies.sp.noConsumers")}
                <p className="mt-1 text-[11px]">
                    {t("supplies.sp.addRecipeHint")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-muted">
                {data.length === 1
                    ? t("supplies.sp.usedByOne")
                    : t("supplies.sp.usedByMany", { n: data.length })}
            </p>
            {data.map((row) => (
                <RecipeRow key={row.productId} row={row} onClick={onSelectProduct} />
            ))}
        </div>
    );
}

function RecipeRow({
    row,
    onClick,
}: {
    row: RecipeUsageRow;
    onClick?: (p: Product) => void;
}) {
    const { t } = useLanguage();
    const unitCopy =
        row.unit === "per_unit"
            ? t("supplies.sp.perUnit")
            : row.unit === "per_order"
            ? t("supplies.sp.perOrder")
            : t("supplies.sp.perLine");

    return (
        <button
            type="button"
            onClick={
                onClick
                    ? () =>
                          onClick({
                              id: row.productId,
                              name: row.productName,
                              sku: row.sku,
                              image_url: row.imageUrl,
                          } as unknown as Product)
                    : undefined
            }
            className="w-full text-left rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 flex items-center gap-3 hover:border-teal-200 hover:shadow-sm transition-all"
        >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center ring-1 ring-[var(--card-border)] shrink-0">
                {row.imageUrl ? (
                    <img src={row.imageUrl} alt={row.productName} className="w-full h-full object-cover" />
                ) : (
                    <Truck className="w-4 h-4 text-teal-600" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{row.productName}</p>
                <p className="text-[11px] text-muted font-mono truncate">
                    {row.sku || t("supplies.sp.noSku")}
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-lg font-bold tabular-nums leading-none">
                    ×{row.quantity}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{unitCopy}</p>
            </div>
        </button>
    );
}
