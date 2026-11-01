"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Box,
    Clock,
    FileText,
    Mail,
    Package,
    Phone,
    TrendingUp,
    Truck,
    X,
} from "lucide-react";
import type { AggregatedSupplier } from "@/lib/utils/suppliers-aggregate";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { SupplierInitialsBadge } from "./supplier-initials-badge";
import { PoStatusChip, type PoStatusInfo, type PoStatus } from "./po-status-chip";
import { StockFillBar } from "./stock-fill-bar";
import { PoActions } from "./po-actions";
import type { Product } from "@/lib/supabase";

type TabKey = "overview" | "supplies" | "pos";

interface SupplierDetailDrawerProps {
    open: boolean;
    supplier: AggregatedSupplier | null;
    onClose: () => void;
    onSelectSupply?: (supply: Product) => void;
}

const TABS: { key: TabKey; labelKey: string }[] = [
    { key: "overview", labelKey: "supplies.sd.tabOverview" },
    { key: "supplies", labelKey: "supplies.sd.tabSupplies" },
    { key: "pos", labelKey: "supplies.sd.tabPos" },
];

export function SupplierDetailDrawer({
    open,
    supplier,
    onClose,
    onSelectSupply,
}: SupplierDetailDrawerProps) {
    const { t } = useLanguage();
    const [tab, setTab] = useState<TabKey>("overview");

    return (
        <AnimatePresence>
            {open && supplier && (
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
                        aria-label={t("supplies.sd.detail", { name: supplier.name })}
                        className="fixed right-0 top-0 bottom-0 w-full md:w-[560px] bg-[var(--background)] shadow-2xl z-50 flex flex-col"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 260 }}
                    >
                        <SupplierHeader supplier={supplier} onClose={onClose} />
                        <SupplierTabs tab={tab} onChange={setTab} />
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {tab === "overview" && <OverviewTab supplier={supplier} />}
                            {tab === "supplies" && (
                                <SuppliesTab supplier={supplier} onSelectSupply={onSelectSupply} />
                            )}
                            {tab === "pos" && <PosTab supplier={supplier} />}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function SupplierHeader({
    supplier,
    onClose,
}: {
    supplier: AggregatedSupplier;
    onClose: () => void;
}) {
    const { t } = useLanguage();
    return (
        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
                <SupplierInitialsBadge name={supplier.name} size="md" />
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-tight truncate">
                        {supplier.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        {supplier.email && (
                            <a
                                href={`mailto:${supplier.email}`}
                                className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                                <Mail className="w-3 h-3" />
                                {supplier.email}
                            </a>
                        )}
                        {supplier.contact && (
                            <a
                                href={`tel:${supplier.contact}`}
                                className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                                <Phone className="w-3 h-3" />
                                {supplier.contact}
                            </a>
                        )}
                    </div>
                </div>
            </div>
            <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-[var(--card-border)]/40 transition-colors"
                aria-label={t("supplies.sd.close")}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

function SupplierTabs({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
    const { t } = useLanguage();
    return (
        <div className="border-b border-[var(--card-border)] px-5 flex gap-1">
            {TABS.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onChange(item.key)}
                    className={cn(
                        "relative px-3 py-2.5 text-sm font-medium transition-colors",
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

function OverviewTab({ supplier }: { supplier: AggregatedSupplier }) {
    const { t } = useLanguage();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <KpiTile
                    icon={Package}
                    label={t("supplies.sd.kpiSupplies")}
                    value={supplier.supplies.length.toString()}
                />
                <KpiTile
                    icon={Clock}
                    label={t("supplies.sd.kpiLead")}
                    value={
                        supplier.avgLeadTimeDays != null
                            ? t("supplies.sd.days", { n: supplier.avgLeadTimeDays })
                            : "—"
                    }
                />
                <KpiTile
                    icon={Truck}
                    label={t("supplies.sd.kpiOpenPos")}
                    value={supplier.openPoCount.toString()}
                    tone={supplier.openPoCount > 0 ? "sky" : "slate"}
                />
                <KpiTile
                    icon={TrendingUp}
                    label={t("supplies.sd.kpiYtd")}
                    value={formatIQD(supplier.ytdSpend)}
                    tone="teal"
                />
            </div>

            <div className="pastel-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted font-medium">
                    {t("supplies.sd.recent")}
                </p>
                <div className="mt-2 space-y-1.5 text-sm">
                    {supplier.pos.slice(0, 3).length === 0 ? (
                        <p className="text-muted text-sm">{t("supplies.sd.noPos")}</p>
                    ) : (
                        supplier.pos.slice(0, 3).map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 border-[var(--card-border)]/50"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{p.poNumber}</p>
                                    <p className="text-[11px] text-muted">
                                        {p.createdAt
                                            ? new Date(p.createdAt).toLocaleDateString()
                                            : "—"}
                                    </p>
                                </div>
                                <PoStatusChip
                                    info={{
                                        poNumber: p.poNumber,
                                        status: p.status as PoStatus,
                                        expectedDate: p.expectedDate,
                                        quantity: 0,
                                    }}
                                    size="sm"
                                />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function KpiTile({
    icon: Icon,
    label,
    value,
    tone = "slate",
}: {
    icon: typeof Package;
    label: string;
    value: string;
    tone?: "teal" | "sky" | "slate";
}) {
    const toneClasses =
        tone === "teal"
            ? "from-teal-50 to-teal-50/20 border-teal-200/50"
            : tone === "sky"
            ? "from-sky-50 to-sky-50/20 border-sky-200/50"
            : "from-slate-50 to-slate-50/20 border-slate-200/50";
    return (
        <div
            className={cn(
                "rounded-2xl border bg-gradient-to-br p-3",
                toneClasses
            )}
        >
            <div className="flex items-center gap-2 text-muted">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wide font-medium">{label}</span>
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
        </div>
    );
}

function SuppliesTab({
    supplier,
    onSelectSupply,
}: {
    supplier: AggregatedSupplier;
    onSelectSupply?: (supply: Product) => void;
}) {
    const { t } = useLanguage();
    const sorted = useMemo(
        () =>
            [...supplier.supplies].sort((a, b) => {
                if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
                return a.product.name.localeCompare(b.product.name);
            }),
        [supplier.supplies]
    );

    if (sorted.length === 0) {
        return (
            <div className="text-center py-12 text-muted text-sm">
                {t("supplies.sd.noSupplies")}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {sorted.map(({ product, leadTimeDays, unitCost, moq, isPrimary }) => {
                const stock = product.stock_quantity ?? 0;
                return (
                    <button
                        key={product.id}
                        type="button"
                        onClick={
                            onSelectSupply ? () => onSelectSupply(product) : undefined
                        }
                        className={cn(
                            "w-full text-left rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 transition-all",
                            "hover:border-teal-200 hover:shadow-sm"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center ring-1 ring-[var(--card-border)] shrink-0">
                                {product.image_url ? (
                                    <img
                                        src={product.image_url}
                                        alt={product.name}
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <Box className="w-5 h-5 text-teal-600" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-sm truncate">{product.name}</p>
                                    {isPrimary && (
                                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold uppercase tracking-wide">
                                            {t("supplies.sd.primary")}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted font-mono truncate">
                                    {product.sku || t("supplies.sd.noSku")}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                                    <span className="tabular-nums font-medium">{stock}</span>
                                    <StockFillBar
                                        stock={stock}
                                        reorderPoint={product.reorder_point}
                                        lowStockThreshold={product.low_stock_threshold}
                                        className="flex-1 min-w-[80px]"
                                    />
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                                    {leadTimeDays != null && (
                                        <span>{t("supplies.sd.leadD", { n: leadTimeDays })}</span>
                                    )}
                                    {moq != null && moq > 1 && <span>{t("supplies.sd.moq", { n: moq })}</span>}
                                    {unitCost != null && (
                                        <span>{t("supplies.sd.perUnit", { price: formatIQD(unitCost) })}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function PosTab({ supplier }: { supplier: AggregatedSupplier }) {
    const { t } = useLanguage();
    if (supplier.pos.length === 0) {
        return (
            <div className="text-center py-12 text-muted text-sm">
                {t("supplies.sd.noPos")}
            </div>
        );
    }
    return (
        <div className="space-y-2">
            {supplier.pos.map((p) => {
                const info: PoStatusInfo = {
                    poNumber: p.poNumber,
                    status: p.status as PoStatus,
                    expectedDate: p.expectedDate,
                    quantity: 0,
                };
                return (
                    <div
                        key={p.id}
                        className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 flex items-start justify-between gap-3"
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-muted" />
                                <p className="font-medium text-sm truncate">{p.poNumber}</p>
                            </div>
                            <p className="text-[11px] text-muted mt-0.5">
                                {p.createdAt
                                    ? new Date(p.createdAt).toLocaleDateString()
                                    : "—"}
                                {p.receivedAt && (
                                    <>
                                        {` · ${t("supplies.sd.received")} `}
                                        {new Date(p.receivedAt).toLocaleDateString()}
                                    </>
                                )}
                            </p>
                            <PoActions poId={p.id} poNumber={p.poNumber} status={p.status} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {p.totalCost != null && p.totalCost > 0 && (
                                <span className={`text-sm font-semibold tabular-nums ${p.status === "cancelled" ? "text-muted line-through font-normal" : ""}`}>
                                    {formatIQD(p.totalCost)}
                                </span>
                            )}
                            {p.status === "received" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                    {t("supplies.sd.receivedChip")}
                                </span>
                            ) : p.status === "partial" || p.status === "cancelled" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                                    {t(p.status === "partial" ? "supplies.po.statusPartial" : "supplies.po.statusCancelled")}
                                </span>
                            ) : (
                                <PoStatusChip info={info} size="sm" />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
