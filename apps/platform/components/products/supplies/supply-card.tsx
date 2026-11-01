"use client";

import { Box, Check, Edit2, Minus, MoreHorizontal, Plus, ShoppingCart } from "lucide-react";
import { Product } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { StockFillBar } from "./stock-fill-bar";
import { DaysOfSupplyPill, daysOfSupplyFrom } from "./days-of-supply-pill";
import { StockoutEtaBadge, stockoutEtaFrom } from "./stockout-eta-badge";
import { PoStatusChip, type PoStatusInfo } from "./po-status-chip";
import { SupplierInitialsStack } from "./supplier-initials-badge";
import { ProductThumb } from "@/components/products/product-thumb";
import { useLanguage } from "@/hooks/use-language";

interface SupplyCardProps {
    supply: Product;
    categoryName?: string;
    /** Lead time from primary supplier, used to show stockout ETA vs lead time. */
    leadTimeDays?: number;
    supplierNames?: string[];
    openPo?: PoStatusInfo | null;
    onEdit?: (product: Product) => void;
    onAdjustStock?: (product: Product, delta: number) => void;
    onReorder?: (product: Product) => void;
    onMore?: (product: Product) => void;
    selected?: boolean;
    onSelectToggle?: (supply: Product) => void;
}

export function SupplyCard({
    supply,
    categoryName,
    leadTimeDays,
    supplierNames,
    openPo,
    onEdit,
    onAdjustStock,
    onReorder,
    onMore,
    selected = false,
    onSelectToggle,
}: SupplyCardProps) {
    const { t } = useLanguage();
    const stock = supply.stock_quantity ?? 0;
    const reserved = supply.reserved_quantity ?? 0;
    const timesSold = supply.times_sold_30d ?? 0;
    const days = daysOfSupplyFrom({ stock, reserved, timesSold30d: timesSold });
    const stockoutEta = stockoutEtaFrom({ stock, reserved, timesSold30d: timesSold });
    const available = Math.max(0, stock - reserved);
    const onHandValue = stock * (supply.cost ?? 0);

    return (
        <div
            className={cn(
                "group relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-500/5",
                selected && "ring-2 ring-teal-500 bg-teal-50/20 border-teal-200"
            )}
        >
            {/* Top-edge inner highlight for premium feel */}
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }}
            />

            {/* Selection checkbox */}
            {onSelectToggle && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelectToggle(supply);
                    }}
                    className={cn(
                        "absolute left-3 top-3 z-10 inline-flex items-center justify-center w-5 h-5 rounded-md border transition-all",
                        selected
                            ? "bg-teal-500 border-teal-500 text-white opacity-100"
                            : "bg-white/90 backdrop-blur-sm border-[var(--card-border)] text-transparent opacity-0 group-hover:opacity-100 hover:border-teal-400 focus:opacity-100",
                    )}
                    aria-pressed={selected}
                    aria-label={selected ? t("supplies.deselectSupply") : t("supplies.selectSupply")}
                    title={selected ? t("supplies.deselect") : t("supplies.select")}
                >
                    <Check className="w-3.5 h-3.5" />
                </button>
            )}

            <div className="flex items-start gap-3">
                {/* Image / icon tile */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-[var(--background)] flex items-center justify-center shrink-0 ring-1 ring-[var(--card-border)]/70">
                    {supply.image_url ? (
                        <ProductThumb src={supply.image_url} alt={supply.name} sizes="56px" />
                    ) : (
                        <Box className="w-6 h-6 text-teal-600" />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-[15px] text-foreground leading-tight truncate">
                            {supply.name}
                        </h3>
                        <DaysOfSupplyPill days={days} size="md" />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted flex-wrap">
                        <span className="font-mono truncate max-w-[50%]">{supply.sku || "No SKU"}</span>
                        {categoryName && (
                            <span
                                className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-medium ring-1 ring-teal-100"
                                title={categoryName}
                            >
                                {categoryName}
                            </span>
                        )}
                        <StockoutEtaBadge
                            daysUntilStockout={stockoutEta}
                            leadTimeDays={leadTimeDays}
                        />
                        {openPo && <PoStatusChip info={openPo} size="sm" />}
                    </div>
                </div>
            </div>

            {/* Stock fill bar */}
            <div className="mt-4">
                <StockFillBar
                    stock={stock}
                    reorderPoint={supply.reorder_point}
                    lowStockThreshold={supply.low_stock_threshold}
                />
                <div className="mt-2 flex items-end justify-between text-[11px] text-muted">
                    <div>
                        <span className="font-medium text-foreground tabular-nums">{stock}</span>
                        <span> {t("supplies.onHand")}</span>
                        {reserved > 0 && (
                            <span className="ml-1 text-muted">
                                · {t("supplies.reservedCount", { count: reserved })} · {t("supplies.freeCount", { count: available })}
                            </span>
                        )}
                    </div>
                    {supply.reorder_point != null && (
                        <span title={t("supplies.reorderPoint")}>
                            {t("supplies.reorderPointShort")}: <span className="tabular-nums">{supply.reorder_point}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex items-end justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] text-muted uppercase tracking-wide">Unit cost</p>
                    <p className="font-semibold text-sm leading-tight">{formatIQD(supply.cost || 0)}</p>
                    {supplierNames && supplierNames.length > 0 && (
                        <div className="mt-1.5">
                            <SupplierInitialsStack names={supplierNames} max={3} size="xs" />
                        </div>
                    )}
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted uppercase tracking-wide">On-hand value</p>
                    <p className="font-semibold text-sm leading-tight tabular-nums">
                        {formatIQD(onHandValue)}
                    </p>
                </div>
            </div>

            {/* Hover action rail */}
            <div
                className={cn(
                    "pointer-events-none absolute right-3 top-3 flex items-center gap-1",
                    "opacity-0 translate-x-1 transition-all duration-200",
                    "group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0"
                )}
            >
                {onAdjustStock && (
                    <>
                        <button
                            type="button"
                            onClick={() => onAdjustStock(supply, -1)}
                            className="pointer-events-auto p-1.5 rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-[var(--card-border)] hover:bg-rose-50 hover:ring-rose-200 hover:text-rose-600 text-muted transition-colors"
                            title={t("supplies.adjustMinus")}
                        >
                            <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onAdjustStock(supply, 1)}
                            className="pointer-events-auto p-1.5 rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-[var(--card-border)] hover:bg-emerald-50 hover:ring-emerald-200 hover:text-emerald-600 text-muted transition-colors"
                            title={t("supplies.adjustPlus")}
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}
                {onReorder && (
                    <button
                        type="button"
                        onClick={() => onReorder(supply)}
                        className="pointer-events-auto p-1.5 rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-[var(--card-border)] hover:bg-teal-50 hover:ring-teal-200 hover:text-teal-600 text-muted transition-colors"
                        title={t("supplies.reorder")}
                    >
                        <ShoppingCart className="w-3.5 h-3.5" />
                    </button>
                )}
                {onEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(supply)}
                        className="pointer-events-auto p-1.5 rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-[var(--card-border)] hover:bg-sky-50 hover:ring-sky-200 hover:text-sky-600 text-muted transition-colors"
                        title={t("supplies.edit")}
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                )}
                {onMore && (
                    <button
                        type="button"
                        onClick={() => onMore(supply)}
                        className="pointer-events-auto p-1.5 rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-[var(--card-border)] hover:bg-slate-50 text-muted transition-colors"
                        title={t("supplies.moreActions")}
                    >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
