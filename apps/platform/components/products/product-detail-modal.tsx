"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Package,
    TrendingUp,
    DollarSign,
    ShoppingCart,
    Calendar,
    History,
    BarChart3,
    Edit,
} from "lucide-react";
import { Product, ProductPriceHistory, getStockStatus } from "@/lib/supabase";
import { formatIQD, formatDate, maskIQD, FINANCIAL_MASK } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { StockIndicator } from "./stock-indicator";
import { ProductThumb } from "@/components/products/product-thumb";

interface ProductDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    priceHistory: ProductPriceHistory[];
    onEdit: () => void;
}

export function ProductDetailModal({
    isOpen,
    onClose,
    product,
    priceHistory,
    onEdit,
}: ProductDetailModalProps) {
    const { t } = useLanguage();
    // Cost, margin and revenue follow the page's reveal toggle (hidden unless revealed).
    const { revealed } = useFinancialVisibility();
    // Cost and margin stay masked for anyone without products.manage.
    const { can } = usePermission();
    const costRevealed = revealed && can(PERMISSIONS.MANAGE_PRODUCTS);
    if (!isOpen || !product) return null;

    const stockStatus = getStockStatus(product);
    const profitMargin = product.cost
        ? (((product.price - product.cost) / product.price) * 100).toFixed(1)
        : null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
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
                    className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    {/* Header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-4">
                            {product.image_url ? (
                                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
                                    <ProductThumb src={product.image_url} alt={product.name} sizes="56px" />
                                </div>
                            ) : (
                                <div className="w-14 h-14 rounded-xl bg-[var(--background)] flex items-center justify-center">
                                    <Package className="w-7 h-7 text-muted" />
                                </div>
                            )}
                            <div>
                                <h2 className="text-xl font-bold text-foreground">
                                    {product.name}
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <StockIndicator status={stockStatus} quantity={product.stock_quantity} />
                                    {product.is_archived && (
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
                                            {t("products.detail.archived")}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                            >
                                <Edit className="w-4 h-4" />
                                {t("common.edit")}
                            </button>
                            <button
                                onClick={onClose}
                                aria-label={t("common.close")}
                                className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                            >
                                <X className="w-5 h-5 text-muted" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {/* Description */}
                        {product.description && (
                            <div>
                                <p className="text-muted">{product.description}</p>
                            </div>
                        )}

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="pastel-card pastel-card-mint p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <DollarSign className="w-4 h-4 text-teal-700" />
                                    <span className="text-xs text-teal-700">{t("products.detail.price")}</span>
                                </div>
                                <p className="text-xl font-bold text-teal-900">
                                    {formatIQD(product.price)}
                                </p>
                            </div>

                            <div className="pastel-card pastel-card-yellow p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShoppingCart className="w-4 h-4 text-amber-700" />
                                    <span className="text-xs text-amber-700">{t("products.detail.unitsSold")}</span>
                                </div>
                                <p className="text-xl font-bold text-amber-900">
                                    {product.times_sold || 0}
                                </p>
                            </div>

                            <div className="pastel-card pastel-card-green p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-4 h-4 text-green-700" />
                                    <span className="text-xs text-green-700">{t("products.totalRevenue")}</span>
                                </div>
                                <p className="text-xl font-bold text-green-900">
                                    {maskIQD(product.total_revenue || 0, revealed)}
                                </p>
                            </div>

                            <div className="pastel-card pastel-card-pink p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart3 className="w-4 h-4 text-rose-700" />
                                    <span className="text-xs text-rose-700">{t("products.detail.aov")}</span>
                                </div>
                                <p className="text-xl font-bold text-rose-900">
                                    {maskIQD(product.average_order_value || 0, revealed)}
                                </p>
                            </div>
                        </div>

                        {/* Pricing Details */}
                        <div className="pastel-card p-5">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                {t("products.detail.pricing")}
                            </h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.price")}</p>
                                    <p className="text-lg font-bold text-foreground">
                                        {formatIQD(product.price)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.cost")}</p>
                                    <p className="text-lg font-bold text-foreground">
                                        {product.cost ? maskIQD(product.cost, costRevealed) : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.margin")}</p>
                                    <p className="text-lg font-bold text-green-600">
                                        {!profitMargin ? "—" : costRevealed ? `${profitMargin}%` : FINANCIAL_MASK}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Variants */}
                        {product.variants && product.variants.length > 0 && (
                            <div className="pastel-card p-5">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                    {t("products.detail.variants")}
                                </h3>
                                <div className="space-y-2">
                                    {product.variants.map((variant) => (
                                        <div
                                            key={variant.id}
                                            className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="font-medium text-foreground">
                                                    {variant.name}
                                                </span>
                                                {variant.sku && (
                                                    <span className="text-xs text-muted">
                                                        {t("products.detail.sku", { sku: variant.sku })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-muted">
                                                    {t("products.detail.variantStock", { count: variant.stock_quantity })}
                                                </span>
                                                <span className="font-bold text-foreground">
                                                    {formatIQD(variant.price || product.price)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Price History */}
                        {priceHistory.length > 0 && (
                            <div className="pastel-card p-5">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <History className="w-4 h-4" />
                                    {t("products.detail.priceHistory")}
                                </h3>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {priceHistory.map((history) => (
                                        <div
                                            key={history.id}
                                            className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Calendar className="w-4 h-4 text-muted" />
                                                <span className="text-sm text-muted">
                                                    {formatDate(history.created_at)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted line-through">
                                                    {history.old_price ? formatIQD(history.old_price) : "—"}
                                                </span>
                                                <span className="text-sm">→</span>
                                                <span className="font-bold text-foreground">
                                                    {formatIQD(history.new_price)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Inventory */}
                        <div className="pastel-card p-5">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                {t("products.detail.stock")}
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.onShelf")}</p>
                                    <p className="text-lg font-bold text-foreground">
                                        {t("products.detail.units", { count: product.stock_quantity })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.reserved")}</p>
                                    <p className="text-lg font-bold text-amber-600">
                                        {t("products.detail.units", { count: product.reserved_quantity || 0 })}
                                    </p>
                                    <p className="text-xs text-muted mt-1">{t("products.detail.reservedHint")}</p>
                                </div>
                                <div className="border-l border-[var(--card-border)] pl-4">
                                    <p className="text-sm text-muted">{t("products.detail.available")}</p>
                                    <p className="text-lg font-bold text-green-600">
                                        {t("products.detail.units", { count: Math.max(0, product.stock_quantity - (product.reserved_quantity || 0)) })}
                                    </p>
                                    <p className="text-xs text-muted mt-1">{t("products.detail.availableHint")}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted">{t("products.detail.lowStockAt")}</p>
                                    <p className="text-lg font-bold text-foreground">
                                        ≤ {t("products.detail.units", { count: product.low_stock_threshold })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
