"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
    Grid3X3,
    Camera,
    Wand2,
    ChevronDown,
    ChevronUp,
    Package,
    CheckSquare,
    Square,
    Trash2,
    Tag,
    ArrowUpDown,
    Search,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { VariantOptionType, OptionValueMetadata } from "@/types/product";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantRowData {
    id?: string;
    name: string;
    price: number;
    cost: number;
    stock_quantity: number;
    sku: string;
    option_values?: Record<string, string>;
    image_url?: string;
    is_enabled?: boolean;
    reserved_quantity?: number;
    barcode?: string;
    low_stock_threshold?: number;
    compare_at_price?: number;
}

interface VariantMatrixTableProps {
    variants: VariantRowData[];
    options: Array<{
        name: string;
        values: string[];
        option_type?: VariantOptionType;
        values_metadata?: OptionValueMetadata[];
    }>;
    onUpdateVariant: (index: number, updates: Partial<VariantRowData>) => void;
    onBulkUpdateVariants?: (indices: number[], updates: Partial<VariantRowData>) => void;
    onApplyToAll: (field: "price" | "cost" | "stock_quantity", value: number) => void;
    onDeleteVariants?: (indices: number[]) => void;
    productSku?: string;
    productPrice: number;
    productCost: number;
    /** Cost and margin are for admins only (products.manage). */
    showCost?: boolean;
    disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPTION_BADGE_STYLES = [
    "bg-[var(--pastel-blue)] text-blue-800",
    "bg-[var(--pastel-pink)] text-pink-800",
    "bg-[var(--pastel-mint)] text-teal-800",
    "bg-[var(--pastel-yellow)] text-yellow-800",
    "bg-[var(--pastel-green)] text-green-800",
];

const EDITABLE_COLUMNS = ["price", "cost", "stock_quantity", "sku", "barcode"] as const;
type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

const SORTABLE_COLUMNS = ["price", "cost", "stock_quantity", "sku", "margin", "is_enabled"] as const;
type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

const TH =
    "text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2.5 bg-[var(--background)]";
const INPUT_BASE =
    "px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeMargin(price: number, cost: number): number | null {
    if (!price || price === 0) return null;
    return ((price - cost) / price) * 100;
}

function stockIndicatorColor(
    qty: number,
    threshold: number | undefined,
): string {
    const t = threshold ?? 10;
    if (qty <= 0) return "bg-gray-400";
    const ratio = qty / Math.max(t * 2, 1);
    if (ratio < 0.25) return "bg-red-500";
    if (ratio < 0.5) return "bg-amber-500";
    return "bg-emerald-500";
}

function generateSkuForVariant(
    variant: VariantRowData,
    options: VariantMatrixTableProps["options"],
    productSku?: string,
): string {
    const base = productSku || "SKU";
    const parts = options.map((opt) => {
        const val = variant.option_values?.[opt.name] || "";
        return val.substring(0, 3).toUpperCase().replace(/\s+/g, "");
    });
    return [base, ...parts].filter(Boolean).join("-");
}

function getColorHex(
    opt: VariantMatrixTableProps["options"][number],
    value: string,
): string | null {
    if (opt.option_type !== "color" || !opt.values_metadata) return null;
    const meta = opt.values_metadata.find((m) => m.label === value);
    return meta?.hex ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VariantMatrixTable({
    variants,
    options,
    onUpdateVariant,
    onBulkUpdateVariants,
    onApplyToAll,
    onDeleteVariants,
    productSku,
    productPrice,
    productCost,
    showCost = true,
    disabled = false,
}: VariantMatrixTableProps) {
    const { t } = useLanguage();

    // Selection
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Quick filter
    const [filterQuery, setFilterQuery] = useState("");

    // Apply-all dropdown
    const [showApplyAll, setShowApplyAll] = useState(false);
    const [applyAllPrice, setApplyAllPrice] = useState<number>(productPrice);
    const [applyAllCost, setApplyAllCost] = useState<number>(productCost);
    const [applyAllStock, setApplyAllStock] = useState<number>(0);

    // Bulk action popovers
    const [bulkPopover, setBulkPopover] = useState<
        "price" | "cost" | "stock" | null
    >(null);
    const [bulkValue, setBulkValue] = useState<number>(0);

    // Sorting
    const [sortConfig, setSortConfig] = useState<{
        key: SortableColumn;
        direction: "asc" | "desc";
    } | null>(null);

    // Cell editing / navigation
    const [editingCell, setEditingCell] = useState<{
        row: number;
        col: EditableColumn;
    } | null>(null);

    const fileInputRefs = useRef<Record<number, HTMLInputElement>>({});
    const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // -----------------------------------------------------------------------
    // Derived data
    // -----------------------------------------------------------------------

    const hasBarcodes = useMemo(
        () => variants.some((v) => v.barcode),
        [variants],
    );

    // Columns that are actually editable in the current view
    const activeEditableColumns = useMemo(() => {
        const cols: EditableColumn[] = showCost
            ? ["price", "cost", "stock_quantity", "sku"]
            : ["price", "stock_quantity", "sku"];
        if (hasBarcodes) cols.push("barcode");
        return cols;
    }, [hasBarcodes, showCost]);

    // Sorted index mapping
    const sortedIndices = useMemo(() => {
        const indices = variants.map((_, i) => i);
        if (!sortConfig) return indices;

        const { key, direction } = sortConfig;
        const dir = direction === "asc" ? 1 : -1;

        indices.sort((a, b) => {
            const va = variants[a];
            const vb = variants[b];

            let valA: number | string;
            let valB: number | string;

            switch (key) {
                case "price":
                    valA = va.price;
                    valB = vb.price;
                    break;
                case "cost":
                    valA = va.cost;
                    valB = vb.cost;
                    break;
                case "stock_quantity":
                    valA = va.stock_quantity;
                    valB = vb.stock_quantity;
                    break;
                case "sku":
                    valA = va.sku.toLowerCase();
                    valB = vb.sku.toLowerCase();
                    break;
                case "margin": {
                    valA = computeMargin(va.price, va.cost) ?? -Infinity;
                    valB = computeMargin(vb.price, vb.cost) ?? -Infinity;
                    break;
                }
                case "is_enabled":
                    valA = va.is_enabled ? 1 : 0;
                    valB = vb.is_enabled ? 1 : 0;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        return indices;
    }, [variants, sortConfig]);

    // Filtered view of sortedIndices — matches name / sku / barcode / option values
    const visibleIndices = useMemo(() => {
        const q = filterQuery.trim().toLowerCase();
        if (!q) return sortedIndices;
        return sortedIndices.filter((i) => {
            const v = variants[i];
            if (v.name?.toLowerCase().includes(q)) return true;
            if (v.sku?.toLowerCase().includes(q)) return true;
            if (v.barcode?.toLowerCase().includes(q)) return true;
            if (v.option_values) {
                for (const val of Object.values(v.option_values)) {
                    if (val?.toLowerCase().includes(q)) return true;
                }
            }
            return false;
        });
    }, [sortedIndices, variants, filterQuery]);

    // Summary stats
    const enabledVariants = useMemo(
        () => variants.filter((v) => v.is_enabled !== false),
        [variants],
    );
    const totalStock = useMemo(
        () => enabledVariants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0),
        [enabledVariants],
    );
    const avgPrice = useMemo(() => {
        if (enabledVariants.length === 0) return 0;
        return (
            enabledVariants.reduce((sum, v) => sum + (v.price || 0), 0) /
            enabledVariants.length
        );
    }, [enabledVariants]);
    const outOfStock = useMemo(
        () => variants.filter((v) => (v.stock_quantity || 0) <= 0).length,
        [variants],
    );

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const toggleSort = useCallback(
        (key: SortableColumn) => {
            setSortConfig((prev) => {
                if (prev?.key === key) {
                    if (prev.direction === "asc") return { key, direction: "desc" };
                    return null; // third click resets
                }
                return { key, direction: "asc" };
            });
        },
        [],
    );

    const toggleSelectAll = useCallback(() => {
        if (selectedIndices.size === variants.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(variants.map((_, i) => i)));
        }
    }, [selectedIndices.size, variants.length]);

    const toggleSelect = useCallback((index: number) => {
        setSelectedIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const handleCellClick = useCallback(
        (row: number, col: EditableColumn) => {
            if (disabled) return;
            setEditingCell({ row, col });
            requestAnimationFrame(() => {
                const ref = cellRefs.current[`${row}-${col}`];
                ref?.focus();
                ref?.select();
            });
        },
        [disabled],
    );

    const navigateCell = useCallback(
        (
            currentRow: number,
            currentCol: EditableColumn,
            direction: "next" | "prev" | "down" | "up",
        ) => {
            const colIdx = activeEditableColumns.indexOf(currentCol);
            // Row position in sorted order
            const sortedPos = visibleIndices.indexOf(currentRow);

            let nextRow = currentRow;
            let nextColIdx = colIdx;

            if (direction === "next") {
                nextColIdx = colIdx + 1;
                if (nextColIdx >= activeEditableColumns.length) {
                    nextColIdx = 0;
                    const nextSortedPos = sortedPos + 1;
                    if (nextSortedPos < visibleIndices.length) {
                        nextRow = visibleIndices[nextSortedPos];
                    } else {
                        // wrap to first row
                        nextRow = visibleIndices[0];
                    }
                }
            } else if (direction === "prev") {
                nextColIdx = colIdx - 1;
                if (nextColIdx < 0) {
                    nextColIdx = activeEditableColumns.length - 1;
                    const prevSortedPos = sortedPos - 1;
                    if (prevSortedPos >= 0) {
                        nextRow = visibleIndices[prevSortedPos];
                    } else {
                        nextRow = visibleIndices[visibleIndices.length - 1];
                    }
                }
            } else if (direction === "down") {
                const nextSortedPos = sortedPos + 1;
                if (nextSortedPos < visibleIndices.length) {
                    nextRow = visibleIndices[nextSortedPos];
                }
            } else if (direction === "up") {
                const prevSortedPos = sortedPos - 1;
                if (prevSortedPos >= 0) {
                    nextRow = visibleIndices[prevSortedPos];
                }
            }

            const nextCol = activeEditableColumns[nextColIdx];
            setEditingCell({ row: nextRow, col: nextCol });
            requestAnimationFrame(() => {
                const ref = cellRefs.current[`${nextRow}-${nextCol}`];
                ref?.focus();
                ref?.select();
            });
        },
        [activeEditableColumns, visibleIndices],
    );

    const handleCellKeyDown = useCallback(
        (
            e: React.KeyboardEvent<HTMLInputElement>,
            row: number,
            col: EditableColumn,
        ) => {
            if (e.key === "Tab") {
                e.preventDefault();
                navigateCell(row, col, e.shiftKey ? "prev" : "next");
            } else if (e.key === "Enter") {
                e.preventDefault();
                navigateCell(row, col, e.shiftKey ? "up" : "down");
            } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingCell(null);
                (e.target as HTMLInputElement).blur();
            }
        },
        [navigateCell],
    );

    const handleImageClick = useCallback((index: number) => {
        fileInputRefs.current[index]?.click();
    }, []);

    const prevBlobUrlsRef = useRef<Map<number, string>>(new Map());

    const handleImageChange = useCallback(
        (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                // Revoke previous blob URL to prevent memory leak
                const prevUrl = prevBlobUrlsRef.current.get(index);
                if (prevUrl) URL.revokeObjectURL(prevUrl);
                const url = URL.createObjectURL(file);
                prevBlobUrlsRef.current.set(index, url);
                onUpdateVariant(index, { image_url: url });
            }
        },
        [onUpdateVariant],
    );

    // Bulk actions
    const selectedArray = useMemo(
        () => Array.from(selectedIndices),
        [selectedIndices],
    );
    const hasSelection = selectedIndices.size > 0;

    const applyBulkField = useCallback(
        (field: "price" | "cost" | "stock_quantity", value: number) => {
            const targets = hasSelection ? selectedArray : variants.map((_, i) => i);
            if (onBulkUpdateVariants) {
                onBulkUpdateVariants(targets, { [field]: value });
            } else {
                targets.forEach((i) => onUpdateVariant(i, { [field]: value }));
            }
        },
        [hasSelection, selectedArray, variants, onBulkUpdateVariants, onUpdateVariant],
    );

    const bulkSetEnabled = useCallback(
        (enabled: boolean) => {
            const targets = hasSelection ? selectedArray : variants.map((_, i) => i);
            if (onBulkUpdateVariants) {
                onBulkUpdateVariants(targets, { is_enabled: enabled });
            } else {
                targets.forEach((i) => onUpdateVariant(i, { is_enabled: enabled }));
            }
        },
        [hasSelection, selectedArray, variants, onBulkUpdateVariants, onUpdateVariant],
    );

    const bulkGenerateSkus = useCallback(() => {
        const targets = hasSelection ? selectedArray : variants.map((_, i) => i);
        targets.forEach((i) => {
            onUpdateVariant(i, {
                sku: generateSkuForVariant(variants[i], options, productSku),
            });
        });
    }, [hasSelection, selectedArray, variants, options, productSku, onUpdateVariant]);

    const bulkDelete = useCallback(() => {
        if (!onDeleteVariants) return;
        onDeleteVariants(selectedArray);
        setSelectedIndices(new Set());
    }, [onDeleteVariants, selectedArray]);

    // -----------------------------------------------------------------------
    // Sort header helper
    // -----------------------------------------------------------------------

    function SortableHeader({
        label,
        sortKey,
        className,
    }: {
        label: string;
        sortKey: SortableColumn;
        className?: string;
    }) {
        const active = sortConfig?.key === sortKey;
        return (
            <th
                className={cn(TH, "cursor-pointer select-none hover:text-foreground transition-colors", className)}
                onClick={() => toggleSort(sortKey)}
            >
                <span className="inline-flex items-center gap-1">
                    {label}
                    {active ? (
                        sortConfig.direction === "asc" ? (
                            <ChevronUp className="w-3 h-3" />
                        ) : (
                            <ChevronDown className="w-3 h-3" />
                        )
                    ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                </span>
            </th>
        );
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                        <Grid3X3 className="w-4 h-4" />
                        {t("products.vm.variantMatrix")}
                    </h2>
                    {variants.length > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--pastel-blue)] text-blue-800">
                            {variants.length}{" "}
                            {variants.length !== 1
                                ? t("products.vm.variants")
                                : t("products.vm.variant")}
                            {filterQuery && visibleIndices.length !== variants.length && (
                                <span className="ml-1 text-blue-600">
                                    ({visibleIndices.length} shown)
                                </span>
                            )}
                        </span>
                    )}
                    {variants.length > 5 && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                            <input
                                type="text"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder={t("products.editor.filterVariants")}
                                className="pl-8 pr-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--pastel-blue)] w-48"
                            />
                        </div>
                    )}
                </div>

                {variants.length > 0 && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowApplyAll(!showApplyAll)}
                            disabled={disabled}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors disabled:opacity-50"
                        >
                            {t("products.vm.applyToAll")}
                            <ChevronDown
                                className={cn(
                                    "w-3.5 h-3.5 transition-transform",
                                    showApplyAll && "rotate-180",
                                )}
                            />
                        </button>

                        <AnimatePresence>
                            {showApplyAll && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-2 z-20 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg p-4 w-72 space-y-3"
                                >
                                    {hasSelection && (
                                        <p className="text-xs text-muted">
                                            {t("products.vm.applyingToSelected", { count: selectedIndices.size })}
                                        </p>
                                    )}

                                    {/* Price */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">
                                            {t("products.vm.price")}
                                        </label>
                                        <input
                                            type="number"
                                            value={applyAllPrice || ""}
                                            onChange={(e) =>
                                                setApplyAllPrice(parseFloat(e.target.value) || 0)
                                            }
                                            placeholder="0"
                                            min={0}
                                            className={cn(INPUT_BASE, "flex-1 text-right placeholder:text-[var(--foreground-muted)]")}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (hasSelection) {
                                                    applyBulkField("price", applyAllPrice);
                                                } else {
                                                    onApplyToAll("price", applyAllPrice);
                                                }
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            {t("products.vm.apply")}
                                        </button>
                                    </div>

                                    {showCost && (
                                                                        <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">
                                            {t("products.vm.cost")}
                                        </label>
                                        <input
                                            type="number"
                                            value={applyAllCost || ""}
                                            onChange={(e) =>
                                                setApplyAllCost(parseFloat(e.target.value) || 0)
                                            }
                                            placeholder="0"
                                            min={0}
                                            className={cn(INPUT_BASE, "flex-1 text-right placeholder:text-[var(--foreground-muted)]")}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (hasSelection) {
                                                    applyBulkField("cost", applyAllCost);
                                                } else {
                                                    onApplyToAll("cost", applyAllCost);
                                                }
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            {t("products.vm.apply")}
                                        </button>
                                    </div>
                                    )}

                                    {/* Stock */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-muted w-12 shrink-0">
                                            {t("products.vm.stock")}
                                        </label>
                                        <input
                                            type="number"
                                            value={applyAllStock || ""}
                                            onChange={(e) =>
                                                setApplyAllStock(parseInt(e.target.value) || 0)
                                            }
                                            placeholder="0"
                                            min={0}
                                            className={cn(INPUT_BASE, "flex-1 text-right placeholder:text-[var(--foreground-muted)]")}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (hasSelection) {
                                                    applyBulkField("stock_quantity", applyAllStock);
                                                } else {
                                                    onApplyToAll("stock_quantity", applyAllStock);
                                                }
                                                setShowApplyAll(false);
                                            }}
                                            className="px-2.5 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                                        >
                                            {t("products.vm.apply")}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Bulk actions toolbar */}
            <AnimatePresence>
                {hasSelection && variants.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[var(--pastel-blue)]/40 border border-blue-200 rounded-xl text-sm">
                            <span className="font-medium text-blue-800 mr-1">
                                {selectedIndices.size} {t("products.vm.selected")}
                            </span>

                            {/* Set Price */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setBulkPopover(bulkPopover === "price" ? null : "price")
                                    }
                                    className="px-2.5 py-1 bg-white/70 rounded-lg text-xs font-medium text-foreground hover:bg-white transition-colors"
                                >
                                    {t("products.vm.setPrice")}
                                </button>
                                <AnimatePresence>
                                    {bulkPopover === "price" && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="absolute left-0 top-full mt-1 z-20 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-2 flex items-center gap-1.5"
                                        >
                                            <input
                                                type="number"
                                                value={bulkValue || ""}
                                                onChange={(e) =>
                                                    setBulkValue(parseFloat(e.target.value) || 0)
                                                }
                                                placeholder="0"
                                                min={0}
                                                className={cn(INPUT_BASE, "w-24 text-right")}
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    applyBulkField("price", bulkValue);
                                                    setBulkPopover(null);
                                                    setBulkValue(0);
                                                }}
                                                className="px-2 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80"
                                            >
                                                {t("products.vm.apply")}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Set Cost */}
                            {showCost && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setBulkPopover(bulkPopover === "cost" ? null : "cost")
                                    }
                                    className="px-2.5 py-1 bg-white/70 rounded-lg text-xs font-medium text-foreground hover:bg-white transition-colors"
                                >
                                    {t("products.vm.setCost")}
                                </button>
                                <AnimatePresence>
                                    {bulkPopover === "cost" && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="absolute left-0 top-full mt-1 z-20 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-2 flex items-center gap-1.5"
                                        >
                                            <input
                                                type="number"
                                                value={bulkValue || ""}
                                                onChange={(e) =>
                                                    setBulkValue(parseFloat(e.target.value) || 0)
                                                }
                                                placeholder="0"
                                                min={0}
                                                className={cn(INPUT_BASE, "w-24 text-right")}
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    applyBulkField("cost", bulkValue);
                                                    setBulkPopover(null);
                                                    setBulkValue(0);
                                                }}
                                                className="px-2 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80"
                                            >
                                                {t("products.vm.apply")}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            )}

                            {/* Add Stock */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setBulkPopover(bulkPopover === "stock" ? null : "stock")
                                    }
                                    className="px-2.5 py-1 bg-white/70 rounded-lg text-xs font-medium text-foreground hover:bg-white transition-colors"
                                >
                                    {t("products.vm.addStock")}
                                </button>
                                <AnimatePresence>
                                    {bulkPopover === "stock" && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="absolute left-0 top-full mt-1 z-20 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-2 flex items-center gap-1.5"
                                        >
                                            <input
                                                type="number"
                                                value={bulkValue || ""}
                                                onChange={(e) =>
                                                    setBulkValue(parseInt(e.target.value) || 0)
                                                }
                                                placeholder="0"
                                                min={0}
                                                className={cn(INPUT_BASE, "w-24 text-right")}
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Add stock means increment
                                                    selectedArray.forEach((i) => {
                                                        onUpdateVariant(i, {
                                                            stock_quantity:
                                                                (variants[i].stock_quantity || 0) +
                                                                bulkValue,
                                                        });
                                                    });
                                                    setBulkPopover(null);
                                                    setBulkValue(0);
                                                }}
                                                className="px-2 py-1.5 bg-[var(--pastel-green)] text-green-800 rounded-lg text-xs font-medium hover:opacity-80"
                                            >
                                                {t("products.vm.apply")}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="w-px h-5 bg-blue-200" />

                            {/* Enable / Disable */}
                            <button
                                type="button"
                                onClick={() => bulkSetEnabled(true)}
                                className="px-2.5 py-1 bg-emerald-100 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-200 transition-colors"
                            >
                                {t("products.vm.enableAll")}
                            </button>
                            <button
                                type="button"
                                onClick={() => bulkSetEnabled(false)}
                                className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                                {t("products.vm.disableAll")}
                            </button>

                            <div className="w-px h-5 bg-blue-200" />

                            {/* Generate SKUs */}
                            <button
                                type="button"
                                onClick={bulkGenerateSkus}
                                className="px-2.5 py-1 bg-white/70 rounded-lg text-xs font-medium text-foreground hover:bg-white transition-colors inline-flex items-center gap-1"
                            >
                                <Tag className="w-3 h-3" />
                                {t("products.vm.generateSkus")}
                            </button>

                            {/* Delete */}
                            {onDeleteVariants && (
                                <button
                                    type="button"
                                    onClick={bulkDelete}
                                    className="px-2.5 py-1 bg-red-100 rounded-lg text-xs font-medium text-red-700 hover:bg-red-200 transition-colors inline-flex items-center gap-1 ml-auto"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    {t("products.vm.deleteSelected")}
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Empty state */}
            {variants.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Grid3X3 className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {t("products.vm.variantEmptyState")}
                    </p>
                </div>
            ) : (
                <>
                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    {/* Checkbox column */}
                                    <th className={cn(TH, "w-10 text-center")}>
                                        <button
                                            type="button"
                                            onClick={toggleSelectAll}
                                            className="text-muted hover:text-foreground transition-colors"
                                            aria-label={t("products.variants.selectAll")}
                                        >
                                            {selectedIndices.size === variants.length &&
                                            variants.length > 0 ? (
                                                <CheckSquare className="w-4 h-4" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Enable toggle */}
                                    <SortableHeader
                                        label={t("products.vm.on")}
                                        sortKey="is_enabled"
                                        className="w-16"
                                    />

                                    {/* Option columns */}
                                    {options.map((opt) => (
                                        <th key={opt.name} className={cn(TH, "text-left")}>
                                            {opt.name}
                                        </th>
                                    ))}

                                    <SortableHeader
                                        label={`${t("products.vm.price")} (IQD)`}
                                        sortKey="price"
                                        className="text-left"
                                    />
                                    {showCost && (
                                        <SortableHeader
                                            label={`${t("products.vm.cost")} (IQD)`}
                                            sortKey="cost"
                                            className="text-left"
                                        />
                                    )}
                                    <SortableHeader
                                        label={t("products.vm.stock")}
                                        sortKey="stock_quantity"
                                        className="text-left"
                                    />
                                    <SortableHeader
                                        label="SKU"
                                        sortKey="sku"
                                        className="text-left"
                                    />
                                    {hasBarcodes && (
                                        <th className={cn(TH, "text-left")}>
                                            {t("products.vm.barcode")}
                                        </th>
                                    )}
                                    {showCost && (
                                        <SortableHeader
                                            label={t("products.vm.margin")}
                                            sortKey="margin"
                                            className="text-left"
                                        />
                                    )}
                                    <th className={cn(TH, "text-left")}>
                                        {t("products.vm.image")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence initial={false}>
                                    {visibleIndices.map((index) => {
                                        const variant = variants[index];
                                        if (!variant) return null;
                                        const margin = computeMargin(
                                            variant.price,
                                            variant.cost,
                                        );
                                        const isSelected = selectedIndices.has(index);
                                        const isEnabled = variant.is_enabled !== false;

                                        return (
                                            <motion.tr
                                                key={variant.id || `variant-${index}`}
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                transition={{ duration: 0.2 }}
                                                className={cn(
                                                    "border-b border-[var(--card-border)] hover:bg-[var(--background)]/50 transition-colors",
                                                    !isEnabled && "opacity-50",
                                                    isSelected && "bg-[var(--pastel-blue)]/20",
                                                )}
                                            >
                                                {/* Checkbox */}
                                                <td className="px-3 py-2.5 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSelect(index)}
                                                        className="text-muted hover:text-foreground transition-colors"
                                                    >
                                                        {isSelected ? (
                                                            <CheckSquare className="w-4 h-4 text-blue-600" />
                                                        ) : (
                                                            <Square className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Enable toggle */}
                                                <td className="px-3 py-2.5">
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={isEnabled}
                                                        disabled={disabled}
                                                        onClick={() =>
                                                            onUpdateVariant(index, {
                                                                is_enabled: !isEnabled,
                                                            })
                                                        }
                                                        className={cn(
                                                            "relative w-9 h-5 rounded-full transition-colors",
                                                            isEnabled
                                                                ? "bg-emerald-500"
                                                                : "bg-gray-300",
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                                                                isEnabled && "translate-x-4",
                                                            )}
                                                        />
                                                    </button>
                                                </td>

                                                {/* Option value cells */}
                                                {options.map((opt, optIndex) => {
                                                    const val =
                                                        variant.option_values?.[opt.name] || "\u2014";
                                                    const hex = getColorHex(opt, val);

                                                    return (
                                                        <td key={opt.name} className="px-3 py-2.5">
                                                            <span
                                                                className={cn(
                                                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                                                                    OPTION_BADGE_STYLES[
                                                                        optIndex %
                                                                            OPTION_BADGE_STYLES.length
                                                                    ],
                                                                )}
                                                            >
                                                                {hex && (
                                                                    <span
                                                                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                                                                        style={{
                                                                            backgroundColor: hex,
                                                                        }}
                                                                    />
                                                                )}
                                                                {val}
                                                            </span>
                                                        </td>
                                                    );
                                                })}

                                                {/* Price */}
                                                <td className="px-3 py-2.5">
                                                    <input
                                                        ref={(el) => {
                                                            cellRefs.current[`${index}-price`] = el;
                                                        }}
                                                        type="number"
                                                        value={variant.price || ""}
                                                        onChange={(e) =>
                                                            onUpdateVariant(index, {
                                                                price:
                                                                    Math.round(parseFloat(e.target.value)) || 0,
                                                            })
                                                        }
                                                        onFocus={() =>
                                                            setEditingCell({
                                                                row: index,
                                                                col: "price",
                                                            })
                                                        }
                                                        onClick={() =>
                                                            handleCellClick(index, "price")
                                                        }
                                                        onKeyDown={(e) =>
                                                            handleCellKeyDown(e, index, "price")
                                                        }
                                                        placeholder="0"
                                                        min={0}
                                                        disabled={disabled}
                                                        className={cn(
                                                            INPUT_BASE,
                                                            "w-24 text-right placeholder:text-[var(--foreground-muted)]",
                                                            editingCell?.row === index &&
                                                                editingCell?.col === "price" &&
                                                                "ring-2 ring-[var(--pastel-yellow)]",
                                                        )}
                                                    />
                                                </td>

                                                {/* Cost */}
                                                {showCost && (
                                                <td className="px-3 py-2.5">
                                                    <input
                                                        ref={(el) => {
                                                            cellRefs.current[`${index}-cost`] = el;
                                                        }}
                                                        type="number"
                                                        value={variant.cost || ""}
                                                        onChange={(e) =>
                                                            onUpdateVariant(index, {
                                                                cost:
                                                                    parseFloat(e.target.value) || 0,
                                                            })
                                                        }
                                                        onFocus={() =>
                                                            setEditingCell({
                                                                row: index,
                                                                col: "cost",
                                                            })
                                                        }
                                                        onClick={() =>
                                                            handleCellClick(index, "cost")
                                                        }
                                                        onKeyDown={(e) =>
                                                            handleCellKeyDown(e, index, "cost")
                                                        }
                                                        placeholder="0"
                                                        min={0}
                                                        disabled={disabled}
                                                        className={cn(
                                                            INPUT_BASE,
                                                            "w-24 text-right placeholder:text-[var(--foreground-muted)]",
                                                            editingCell?.row === index &&
                                                                editingCell?.col === "cost" &&
                                                                "ring-2 ring-[var(--pastel-yellow)]",
                                                        )}
                                                    />
                                                </td>
                                                )}

                                                {/* Stock */}
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={cn(
                                                                "w-2 h-2 rounded-full shrink-0",
                                                                stockIndicatorColor(
                                                                    variant.stock_quantity,
                                                                    variant.low_stock_threshold,
                                                                ),
                                                            )}
                                                        />
                                                        <input
                                                            ref={(el) => {
                                                                cellRefs.current[
                                                                    `${index}-stock_quantity`
                                                                ] = el;
                                                            }}
                                                            type="number"
                                                            value={variant.stock_quantity || ""}
                                                            onChange={(e) =>
                                                                onUpdateVariant(index, {
                                                                    stock_quantity:
                                                                        parseInt(e.target.value) ||
                                                                        0,
                                                                })
                                                            }
                                                            onFocus={() =>
                                                                setEditingCell({
                                                                    row: index,
                                                                    col: "stock_quantity",
                                                                })
                                                            }
                                                            onClick={() =>
                                                                handleCellClick(
                                                                    index,
                                                                    "stock_quantity",
                                                                )
                                                            }
                                                            onKeyDown={(e) =>
                                                                handleCellKeyDown(
                                                                    e,
                                                                    index,
                                                                    "stock_quantity",
                                                                )
                                                            }
                                                            placeholder="0"
                                                            min={0}
                                                            disabled={disabled}
                                                            className={cn(
                                                                INPUT_BASE,
                                                                "w-20 text-right placeholder:text-[var(--foreground-muted)]",
                                                                editingCell?.row === index &&
                                                                    editingCell?.col ===
                                                                        "stock_quantity" &&
                                                                    "ring-2 ring-[var(--pastel-yellow)]",
                                                            )}
                                                        />
                                                    </div>
                                                </td>

                                                {/* SKU */}
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            ref={(el) => {
                                                                cellRefs.current[`${index}-sku`] =
                                                                    el;
                                                            }}
                                                            type="text"
                                                            value={variant.sku}
                                                            onChange={(e) =>
                                                                onUpdateVariant(index, {
                                                                    sku: e.target.value,
                                                                })
                                                            }
                                                            onFocus={() =>
                                                                setEditingCell({
                                                                    row: index,
                                                                    col: "sku",
                                                                })
                                                            }
                                                            onClick={() =>
                                                                handleCellClick(index, "sku")
                                                            }
                                                            onKeyDown={(e) =>
                                                                handleCellKeyDown(e, index, "sku")
                                                            }
                                                            placeholder={t("products.variants.sku")}
                                                            disabled={disabled}
                                                            className={cn(
                                                                INPUT_BASE,
                                                                "w-28 text-left placeholder:text-[var(--foreground-muted)]",
                                                                editingCell?.row === index &&
                                                                    editingCell?.col === "sku" &&
                                                                    "ring-2 ring-[var(--pastel-yellow)]",
                                                            )}
                                                        />
                                                        <button
                                                            type="button"
                                                            title={
                                                                t("products.vm.autoGenerateSku")
                                                            }
                                                            disabled={disabled}
                                                            onClick={() =>
                                                                onUpdateVariant(index, {
                                                                    sku: generateSkuForVariant(
                                                                        variant,
                                                                        options,
                                                                        productSku,
                                                                    ),
                                                                })
                                                            }
                                                            className="p-1 text-muted hover:text-foreground hover:bg-[var(--background)] rounded transition-colors shrink-0 disabled:opacity-50"
                                                        >
                                                            <Wand2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Barcode (conditional) */}
                                                {hasBarcodes && (
                                                    <td className="px-3 py-2.5">
                                                        <input
                                                            ref={(el) => {
                                                                cellRefs.current[
                                                                    `${index}-barcode`
                                                                ] = el;
                                                            }}
                                                            type="text"
                                                            value={variant.barcode || ""}
                                                            onChange={(e) =>
                                                                onUpdateVariant(index, {
                                                                    barcode: e.target.value,
                                                                })
                                                            }
                                                            onFocus={() =>
                                                                setEditingCell({
                                                                    row: index,
                                                                    col: "barcode",
                                                                })
                                                            }
                                                            onClick={() =>
                                                                handleCellClick(index, "barcode")
                                                            }
                                                            onKeyDown={(e) =>
                                                                handleCellKeyDown(
                                                                    e,
                                                                    index,
                                                                    "barcode",
                                                                )
                                                            }
                                                            placeholder={t("products.variants.barcode")}
                                                            disabled={disabled}
                                                            className={cn(
                                                                INPUT_BASE,
                                                                "w-28 text-left placeholder:text-[var(--foreground-muted)]",
                                                                editingCell?.row === index &&
                                                                    editingCell?.col ===
                                                                        "barcode" &&
                                                                    "ring-2 ring-[var(--pastel-yellow)]",
                                                            )}
                                                        />
                                                    </td>
                                                )}

                                                {/* Margin */}
                                                {showCost && (
                                                <td className="px-3 py-2.5">
                                                    {margin !== null ? (
                                                        <span
                                                            className={cn(
                                                                "text-xs font-medium px-2 py-0.5 rounded-full",
                                                                margin >= 50
                                                                    ? "bg-emerald-100 text-emerald-700"
                                                                    : margin >= 20
                                                                      ? "bg-amber-100 text-amber-700"
                                                                      : margin >= 0
                                                                        ? "bg-orange-100 text-orange-700"
                                                                        : "bg-red-100 text-red-700",
                                                            )}
                                                        >
                                                            {margin.toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted">
                                                            --
                                                        </span>
                                                    )}
                                                </td>
                                                )}

                                                {/* Image */}
                                                <td className="px-3 py-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleImageClick(index)}
                                                        disabled={disabled}
                                                        className="w-8 h-8 rounded-lg border border-[var(--card-border)] bg-[var(--background)] overflow-hidden flex items-center justify-center hover:border-[var(--foreground)]/30 transition-colors disabled:opacity-50"
                                                    >
                                                        {variant.image_url ? (
                                                            <img
                                                                src={variant.image_url}
                                                                alt={variant.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <Camera className="w-3.5 h-3.5 text-muted" />
                                                        )}
                                                    </button>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        ref={(el) => {
                                                            if (el) {
                                                                fileInputRefs.current[index] = el;
                                                            }
                                                        }}
                                                        onChange={(e) =>
                                                            handleImageChange(index, e)
                                                        }
                                                    />
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>

                    {/* Summary footer */}
                    <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-[var(--background)] rounded-xl text-sm">
                        <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-muted" />
                            <span className="text-muted">
                                {t("products.vm.totalVariants")}:
                            </span>
                            <span className="font-medium text-foreground">
                                {variants.length}
                            </span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">
                                {t("products.vm.enabled")}:
                            </span>
                            <span className="font-medium text-emerald-600">
                                {enabledVariants.length}
                            </span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">
                                {t("products.vm.totalStock")}:
                            </span>
                            <span className="font-medium text-foreground">
                                {totalStock.toLocaleString()}
                            </span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">
                                {t("products.vm.avgPrice")}:
                            </span>
                            <span className="font-medium text-foreground">
                                {formatIQD(Math.round(avgPrice))}
                            </span>
                        </div>
                        <span className="text-[var(--card-border)]">|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">
                                {t("products.vm.outOfStock")}:
                            </span>
                            <span
                                className={cn(
                                    "font-medium",
                                    outOfStock > 0 ? "text-red-600" : "text-foreground",
                                )}
                            >
                                {outOfStock}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
