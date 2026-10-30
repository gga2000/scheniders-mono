"use client";

import { Box, Check, Edit2, Info, Minus, Plus, ShoppingCart } from "lucide-react";
import { Product } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { StockFillBar } from "./stock-fill-bar";
import { DaysOfSupplyPill, daysOfSupplyFrom } from "./days-of-supply-pill";
import { StockoutEtaBadge, stockoutEtaFrom } from "./stockout-eta-badge";
import { PoStatusChip, type PoStatusInfo } from "./po-status-chip";
import { SupplierInitialsStack } from "./supplier-initials-badge";

interface SupplyListRowProps {
    supply: Product;
    categoryName?: string;
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

export function SupplyListRow({
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
}: SupplyListRowProps) {
    const stock = supply.stock_quantity ?? 0;
    const reserved = supply.reserved_quantity ?? 0;
    const timesSold = supply.times_sold_30d ?? 0;
    const days = daysOfSupplyFrom({ stock, reserved, timesSold30d: timesSold });
    const stockoutEta = stockoutEtaFrom({ stock, reserved, timesSold30d: timesSold });
    const onHandValue = stock * (supply.cost ?? 0);

    return (
        <tr
            className={cn(
                "group border-b border-[var(--card-border)] last:border-b-0 hover:bg-teal-50/30 transition-colors",
                selected && "bg-teal-50/40",
            )}
        >
            {onSelectToggle && (
                <td className="px-3 py-3 w-10">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectToggle(supply);
                        }}
                        className={cn(
                            "inline-flex items-center justify-center w-5 h-5 rounded-md border transition-all",
                            selected
                                ? "bg-teal-500 border-teal-500 text-white"
                                : "bg-[var(--card-bg)] border-[var(--card-border)] text-transparent hover:border-teal-400 hover:text-teal-500",
                        )}
                        aria-pressed={selected}
                        aria-label={selected ? "Deselect supply" : "Select supply"}
                    >
                        <Check className="w-3.5 h-3.5" />
                    </button>
                </td>
            )}
            <td className="px-3 py-3 w-14">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center ring-1 ring-[var(--card-border)]">
                    {supply.image_url ? (
                        <img
                            src={supply.image_url}
                            alt={supply.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <Box className="w-5 h-5 text-teal-600" />
                    )}
                </div>
            </td>
            <td className="px-3 py-3 min-w-[180px]">
                <div className="font-medium text-sm text-foreground truncate">{supply.name}</div>
                <div className="text-[11px] text-muted font-mono mt-0.5 flex items-center gap-1.5">
                    <span className="truncate">{supply.sku || "No SKU"}</span>
                    {supplierNames && supplierNames.length > 0 && (
                        <SupplierInitialsStack names={supplierNames} max={2} size="xs" />
                    )}
                </div>
            </td>
            <td className="px-3 py-3">
                {categoryName ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-medium ring-1 ring-teal-100">
                        {categoryName}
                    </span>
                ) : (
                    <span className="text-[11px] text-muted">—</span>
                )}
            </td>
            <td className="px-3 py-3 min-w-[140px]">
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium tabular-nums">{stock}</span>
                    <StockFillBar
                        stock={stock}
                        reorderPoint={supply.reorder_point}
                        lowStockThreshold={supply.low_stock_threshold}
                        className="flex-1 min-w-[40px]"
                    />
                </div>
                {reserved > 0 && (
                    <div className="text-[10px] text-muted mt-0.5 tabular-nums">
                        {reserved} reserved
                    </div>
                )}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-sm">
                {supply.reorder_point ?? <span className="text-muted">—</span>}
            </td>
            <td className="px-3 py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <DaysOfSupplyPill days={days} size="sm" />
                    <StockoutEtaBadge
                        daysUntilStockout={stockoutEta}
                        leadTimeDays={leadTimeDays}
                    />
                    {openPo && <PoStatusChip info={openPo} size="sm" />}
                </div>
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-sm font-medium">
                {formatIQD(supply.cost || 0)}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-muted">
                {formatIQD(onHandValue)}
            </td>
            <td className="px-3 py-3 w-[130px] sticky right-0 bg-[var(--card-bg)] group-hover:bg-[color-mix(in_oklab,var(--card-bg),theme(colors.teal.50)_30%)]">
                <div
                    className={cn(
                        "flex items-center justify-end gap-1",
                        "opacity-70 group-hover:opacity-100 transition-opacity"
                    )}
                >
                    {onAdjustStock && (
                        <>
                            <button
                                type="button"
                                onClick={() => onAdjustStock(supply, -1)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-muted transition-colors"
                                title="Adjust −1"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onAdjustStock(supply, 1)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 text-muted transition-colors"
                                title="Adjust +1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    {onReorder && (
                        <button
                            type="button"
                            onClick={() => onReorder(supply)}
                            className="p-1.5 rounded-lg hover:bg-teal-50 hover:text-teal-600 text-muted transition-colors"
                            title="Reorder"
                        >
                            <ShoppingCart className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            type="button"
                            onClick={() => onEdit(supply)}
                            className="p-1.5 rounded-lg hover:bg-sky-50 hover:text-sky-600 text-muted transition-colors"
                            title="Edit"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onMore && (
                        <button
                            type="button"
                            onClick={() => onMore(supply)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-foreground text-muted transition-colors"
                            title="Details"
                        >
                            <Info className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}
