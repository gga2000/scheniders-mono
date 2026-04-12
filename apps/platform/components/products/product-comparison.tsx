"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, ArrowUpCircle, ArrowDownCircle, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { Product, Category } from "@/types/product";

// =============================================
// TYPES
// =============================================

interface ProductComparisonProps {
    productIds: string[];
    isOpen: boolean;
    onClose: () => void;
    onRemoveProduct?: (productId: string) => void;
}

interface ProductWithExtras extends Product {
    category?: Category | null;
    sales_30d?: number;
}

type HighlightDirection = "higher-better" | "lower-better" | "none";

interface ComparisonRow {
    label: string;
    key: string;
    getValue: (p: ProductWithExtras) => string | number | null;
    getNumericValue?: (p: ProductWithExtras) => number | null;
    direction: HighlightDirection;
}

// =============================================
// HELPERS
// =============================================

function calcMargin(price: number, cost?: number): number | null {
    if (!cost || price <= 0) return null;
    return ((price - cost) / price) * 100;
}

function calcDaysOfSupply(stock: number, sales30d: number): number | null {
    const dailySales = sales30d / 30;
    if (dailySales <= 0) return null;
    return Math.round(stock / dailySales);
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// =============================================
// COMPONENT
// =============================================

export function ProductComparison({
    productIds,
    isOpen,
    onClose,
    onRemoveProduct,
}: ProductComparisonProps) {
    const { session } = useAuth();
    const { t } = useLanguage();

    // Fetch product data
    const { data: products, isLoading: productsLoading } = useQuery<ProductWithExtras[]>({
        queryKey: ["product-comparison", productIds],
        queryFn: async () => {
            if (!productIds.length) return [];

            const { data, error } = await supabase
                .from("products")
                .select("*, categories!products_category_id_fkey(id, name, slug)")
                .in("id", productIds);

            if (error) throw error;

            return (data || []).map((p: any) => ({
                ...p,
                category: p.categories || null,
            }));
        },
        enabled: !!session && isOpen && productIds.length > 0,
    });

    // Fetch 30-day sales for each product
    const { data: salesData } = useQuery<Record<string, number>>({
        queryKey: ["product-comparison-sales", productIds],
        queryFn: async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data, error } = await supabase
                .from("inventory_history")
                .select("product_id, quantity_change")
                .in("product_id", productIds)
                .eq("change_type", "sold")
                .gte("created_at", thirtyDaysAgo.toISOString());

            if (error) throw error;

            const salesMap: Record<string, number> = {};
            for (const id of productIds) {
                salesMap[id] = 0;
            }
            for (const row of data || []) {
                salesMap[row.product_id] =
                    (salesMap[row.product_id] || 0) + Math.abs(row.quantity_change);
            }
            return salesMap;
        },
        enabled: !!session && isOpen && productIds.length > 0,
    });

    // Merge sales data into products
    const enrichedProducts = useMemo(() => {
        if (!products) return [];
        // Preserve the order from productIds
        return productIds
            .map((id) => {
                const p = products.find((prod) => prod.id === id);
                if (!p) return null;
                return {
                    ...p,
                    sales_30d: salesData?.[id] ?? 0,
                };
            })
            .filter(Boolean) as ProductWithExtras[];
    }, [products, salesData, productIds]);

    // Define comparison rows
    const rows: ComparisonRow[] = useMemo(
        () => [
            {
                label: t("products.compare.price") || "Price",
                key: "price",
                getValue: (p) => formatIQD(p.price),
                getNumericValue: (p) => p.price,
                direction: "none",
            },
            {
                label: t("products.compare.cost") || "Cost",
                key: "cost",
                getValue: (p) => (p.cost ? formatIQD(p.cost) : "—"),
                getNumericValue: (p) => p.cost ?? null,
                direction: "lower-better",
            },
            {
                label: t("products.compare.margin") || "Margin %",
                key: "margin",
                getValue: (p) => {
                    const m = calcMargin(p.price, p.cost ?? undefined);
                    return m !== null ? `${m.toFixed(1)}%` : "—";
                },
                getNumericValue: (p) => calcMargin(p.price, p.cost ?? undefined),
                direction: "higher-better",
            },
            {
                label: t("products.compare.stock") || "Stock Quantity",
                key: "stock",
                getValue: (p) => p.stock_quantity,
                getNumericValue: (p) => p.stock_quantity,
                direction: "higher-better",
            },
            {
                label: t("products.compare.sales30d") || "Sales (30d)",
                key: "sales",
                getValue: (p) => p.sales_30d ?? 0,
                getNumericValue: (p) => p.sales_30d ?? 0,
                direction: "higher-better",
            },
            {
                label: t("products.compare.revenue30d") || "Revenue (30d)",
                key: "revenue",
                getValue: (p) => formatIQD((p.sales_30d ?? 0) * p.price),
                getNumericValue: (p) => (p.sales_30d ?? 0) * p.price,
                direction: "higher-better",
            },
            {
                label: t("products.compare.daysOfSupply") || "Days of Supply",
                key: "dos",
                getValue: (p) => {
                    const d = calcDaysOfSupply(p.stock_quantity, p.sales_30d ?? 0);
                    return d !== null ? `${d} days` : "—";
                },
                getNumericValue: (p) =>
                    calcDaysOfSupply(p.stock_quantity, p.sales_30d ?? 0),
                direction: "lower-better",
            },
            {
                label: t("products.compare.category") || "Category",
                key: "category",
                getValue: (p) => p.category?.name ?? "—",
                direction: "none",
            },
            {
                label: "SKU",
                key: "sku",
                getValue: (p) => p.sku || "—",
                direction: "none",
            },
            {
                label: t("products.compare.productType") || "Product Type",
                key: "type",
                getValue: (p) => p.product_type,
                direction: "none",
            },
            {
                label: t("products.compare.created") || "Created Date",
                key: "created",
                getValue: (p) => (p.created_at ? formatDate(p.created_at) : "—"),
                direction: "none",
            },
        ],
        [t]
    );

    // Compute best/worst indices per row
    const highlights = useMemo(() => {
        const result: Record<string, { best: number | null; worst: number | null }> = {};
        for (const row of rows) {
            if (row.direction === "none" || !row.getNumericValue) {
                result[row.key] = { best: null, worst: null };
                continue;
            }
            let bestIdx: number | null = null;
            let worstIdx: number | null = null;
            let bestVal = -Infinity;
            let worstVal = Infinity;

            // For lower-better, invert logic
            if (row.direction === "lower-better") {
                bestVal = Infinity;
                worstVal = -Infinity;
            }

            enrichedProducts.forEach((p, i) => {
                const val = row.getNumericValue!(p);
                if (val === null) return;

                if (row.direction === "higher-better") {
                    if (val > bestVal) {
                        bestVal = val;
                        bestIdx = i;
                    }
                    if (val < worstVal) {
                        worstVal = val;
                        worstIdx = i;
                    }
                } else {
                    // lower-better
                    if (val < bestVal) {
                        bestVal = val;
                        bestIdx = i;
                    }
                    if (val > worstVal) {
                        worstVal = val;
                        worstIdx = i;
                    }
                }
            });

            // Only highlight if there are at least 2 non-null values and best !== worst
            const nonNullCount = enrichedProducts.filter(
                (p) => row.getNumericValue!(p) !== null
            ).length;
            if (nonNullCount < 2 || bestIdx === worstIdx) {
                result[row.key] = { best: null, worst: null };
            } else {
                result[row.key] = { best: bestIdx, worst: worstIdx };
            }
        }
        return result;
    }, [rows, enrichedProducts]);

    const colCount = enrichedProducts.length || productIds.length;

    const handleExportPdf = () => {
        if (!enrichedProducts.length) return;
        const title = t("products.compare.title") || "Product Comparison";
        const attrLabel = t("products.compare.attribute") || "Attribute";

        const headerCells = enrichedProducts
            .map(
                (p) =>
                    `<th>${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" />` : ""}<div>${escapeHtml(p.name)}</div></th>`
            )
            .join("");

        const bodyRows = rows
            .map((row) => {
                const highlight = highlights[row.key];
                const cells = enrichedProducts
                    .map((p, colIdx) => {
                        const value = String(row.getValue(p) ?? "—");
                        const cls =
                            highlight.best === colIdx
                                ? "best"
                                : highlight.worst === colIdx
                                    ? "worst"
                                    : "";
                        return `<td class="${cls}">${escapeHtml(value)}</td>`;
                    })
                    .join("");
                return `<tr><th class="attr">${escapeHtml(row.label)}</th>${cells}</tr>`;
            })
            .join("");

        const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: center; vertical-align: middle; }
  th.attr { text-align: left; background: #f7f7f7; font-weight: 600; width: 180px; }
  thead th { background: #f0f0f0; font-weight: 600; }
  thead img { max-width: 60px; max-height: 60px; object-fit: cover; display: block; margin: 0 auto 6px; border-radius: 8px; }
  td.best { color: #047857; font-weight: 600; }
  td.worst { color: #b91c1c; font-weight: 600; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead><tr><th class="attr">${escapeHtml(attrLabel)}</th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <script>window.addEventListener("load", () => { setTimeout(() => window.print(), 200); });</script>
</body></html>`;

        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(html);
        win.document.close();
    };

    return (
        <AnimatePresence>
            {isOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full h-full max-h-screen overflow-y-auto bg-[var(--card-bg)]"
                >
                    {/* Header */}
                    <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
                        <h2 className="text-xl font-bold text-foreground">
                            {t("products.compare.title") || "Product Comparison"}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportPdf}
                                disabled={!enrichedProducts.length}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--card-border)]"
                            >
                                <FileText className="w-4 h-4" />
                                {t("products.compare.exportPdf") || "Export PDF"}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                            >
                                <X className="w-5 h-5 text-muted" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {productsLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-8 h-8 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : enrichedProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted">
                                <Package className="w-12 h-12 mb-3" />
                                <p>{t("products.compare.empty") || "No products to compare"}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse min-w-[600px]">
                                    {/* Product headers */}
                                    <thead>
                                        <tr>
                                            <th className="w-44 p-3 text-left text-sm font-semibold text-muted align-bottom">
                                                {t("products.compare.attribute") || "Attribute"}
                                            </th>
                                            {enrichedProducts.map((product) => (
                                                <th
                                                    key={product.id}
                                                    className="p-3 text-center align-bottom"
                                                    style={{
                                                        width: `${Math.floor(
                                                            (100 - 20) / colCount
                                                        )}%`,
                                                    }}
                                                >
                                                    <div className="flex flex-col items-center gap-2">
                                                        {/* Product image */}
                                                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--background)] to-[var(--card-border)] flex items-center justify-center">
                                                            {product.image_url ? (
                                                                <img
                                                                    src={product.image_url}
                                                                    alt={product.name}
                                                                    className="w-full h-full object-cover"
                                                                    loading="lazy"
                                                                />
                                                            ) : (
                                                                <Package className="w-8 h-8 text-muted" />
                                                            )}
                                                        </div>
                                                        {/* Product name */}
                                                        <span className="text-sm font-bold text-foreground line-clamp-2 text-center">
                                                            {product.name}
                                                        </span>
                                                        {/* Remove button */}
                                                        {onRemoveProduct && (
                                                            <button
                                                                onClick={() =>
                                                                    onRemoveProduct(product.id)
                                                                }
                                                                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <X className="w-3 h-3" />
                                                                {t("common.remove") || "Remove"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    {/* Comparison rows */}
                                    <tbody>
                                        {rows.map((row, rowIdx) => {
                                            const highlight = highlights[row.key];
                                            return (
                                                <tr
                                                    key={row.key}
                                                    className={cn(
                                                        "border-t border-[var(--card-border)]",
                                                        rowIdx % 2 === 0 && "bg-[var(--background)]/30"
                                                    )}
                                                >
                                                    <td className="p-3 text-sm font-medium text-muted whitespace-nowrap">
                                                        {row.label}
                                                    </td>
                                                    {enrichedProducts.map((product, colIdx) => {
                                                        const value = row.getValue(product);
                                                        const isBest =
                                                            highlight.best === colIdx;
                                                        const isWorst =
                                                            highlight.worst === colIdx;
                                                        return (
                                                            <td
                                                                key={product.id}
                                                                className="p-3 text-center"
                                                            >
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    <span
                                                                        className={cn(
                                                                            "text-sm font-semibold",
                                                                            isBest && "text-green-600",
                                                                            isWorst && "text-red-500",
                                                                            !isBest &&
                                                                                !isWorst &&
                                                                                "text-foreground"
                                                                        )}
                                                                    >
                                                                        {String(value)}
                                                                    </span>
                                                                    {isBest && (
                                                                        <ArrowUpCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                                                    )}
                                                                    {isWorst && (
                                                                        <ArrowDownCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Legend */}
                                <div className="mt-6 flex items-center gap-6 px-3 py-3 bg-[var(--background)] rounded-2xl border border-[var(--card-border)]">
                                    <div className="flex items-center gap-1.5 text-sm text-muted">
                                        <ArrowUpCircle className="w-4 h-4 text-green-500" />
                                        <span>
                                            = {t("products.compare.bestLabel") || "Best in comparison"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm text-muted">
                                        <ArrowDownCircle className="w-4 h-4 text-red-400" />
                                        <span>
                                            = {t("products.compare.worstLabel") || "Worst in comparison"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
            )}
        </AnimatePresence>
    );
}
