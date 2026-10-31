"use client";

import { useState, useMemo } from "react";
import { Zap, Plus, Trash2, Search, Package, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useLanguage } from "@/hooks/use-language";

export interface OrderBumpFormData {
    bump_product_id: string;
    discount_percentage: number;
    headline: string;
    description: string;
    display_order: number;
    is_active: boolean;
    // For UI display
    bump_product_name?: string;
    bump_product_price?: number;
    bump_product_image?: string;
}

interface OrderBumpsSectionProps {
    bumps: OrderBumpFormData[];
    onChange: (bumps: OrderBumpFormData[]) => void;
    currentProductId?: string;
}

export function OrderBumpsSection({ bumps, onChange, currentProductId }: OrderBumpsSectionProps) {
    const { t } = useLanguage();
    const { products } = useProductsCrud();
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const addedIds = new Set(bumps.map((b) => b.bump_product_id));

    const availableProducts = useMemo(() => {
        return products
            .filter(
                (p) =>
                    p.id !== currentProductId &&
                    !addedIds.has(p.id) &&
                    !p.is_archived
            )
            .filter(
                (p) =>
                    !searchQuery ||
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [products, currentProductId, addedIds, searchQuery]);

    const addBump = (product: any) => {
        const newBumps: OrderBumpFormData[] = [
            ...bumps,
            {
                bump_product_id: product.id,
                discount_percentage: 10,
                headline: t("products.ed.bump.defaultHeadline").replace("{name}", product.name),
                description: t("products.ed.bump.defaultDescription"),
                display_order: bumps.length,
                is_active: true,
                bump_product_name: product.name,
                bump_product_price: product.price,
                bump_product_image: product.image_url,
            },
        ];
        onChange(newBumps);
        setSearchQuery("");
        setShowSearch(false);
    };

    const removeBump = (index: number) => {
        const newBumps = bumps.filter((_, i) => i !== index);
        onChange(newBumps);
    };

    const updateBump = (index: number, updates: Partial<OrderBumpFormData>) => {
        const newBumps = bumps.map((bump, i) =>
            i === index ? { ...bump, ...updates } : bump
        );
        onChange(newBumps);
    };

    const getDiscountedPrice = (price: number, discount: number) => {
        return price * (1 - discount / 100);
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={() => setShowSearch(!showSearch)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.ed.bump.add")}
                </button>
            </div>

            {/* Search dropdown */}
            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border border-[var(--card-border)] rounded-xl overflow-hidden"
                    >
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t("products.ed.bump.search")}
                                autoFocus
                                className="w-full pl-10 pr-4 py-3 bg-[var(--background)] text-foreground placeholder:text-muted focus:outline-none"
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto border-t border-[var(--card-border)]">
                            {availableProducts.length === 0 ? (
                                <p className="p-4 text-sm text-muted text-center">No products found</p>
                            ) : (
                                availableProducts.slice(0, 10).map((product) => (
                                    <button
                                        key={product.id}
                                        type="button"
                                        onClick={() => addBump(product)}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--background)] transition-colors text-left"
                                    >
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt=""
                                                className="w-8 h-8 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center">
                                                <Package className="w-4 h-4 text-muted" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                                            {product.sku && <p className="text-xs text-muted">{product.sku}</p>}
                                        </div>
                                        <span className="text-sm text-muted">{product.price?.toLocaleString()} IQD</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Empty state */}
            {bumps.length === 0 && !showSearch && (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Zap className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {t("products.ed.bump.empty")}
                    </p>
                </div>
            )}

            {/* Bump cards */}
            <AnimatePresence>
                {bumps.map((bump, index) => {
                    const originalPrice = bump.bump_product_price || 0;
                    const discountedPrice = getDiscountedPrice(originalPrice, bump.discount_percentage);

                    return (
                        <motion.div
                            key={bump.bump_product_id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            className={`p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-3 ${
                                !bump.is_active ? "opacity-60" : ""
                            }`}
                        >
                            {/* Top row */}
                            <div className="flex items-center gap-3">
                                {/* Toggle */}
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={bump.is_active}
                                    onClick={() => updateBump(index, { is_active: !bump.is_active })}
                                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                                        bump.is_active ? "bg-emerald-500" : "bg-gray-300"
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                                            bump.is_active ? "translate-x-4" : "translate-x-0"
                                        }`}
                                    />
                                </button>

                                {/* Product image */}
                                {bump.bump_product_image ? (
                                    <img
                                        src={bump.bump_product_image}
                                        alt=""
                                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                        <Package className="w-5 h-5 text-muted" />
                                    </div>
                                )}

                                {/* Product name */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {bump.bump_product_name || "Unknown Product"}
                                    </p>
                                </div>

                                {/* Prices */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {bump.discount_percentage > 0 ? (
                                        <>
                                            <span className="text-sm text-muted line-through">
                                                {originalPrice.toLocaleString()} IQD
                                            </span>
                                            <span className="text-sm font-medium text-emerald-600">
                                                {Math.round(discountedPrice).toLocaleString()} IQD
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-sm font-medium text-foreground">
                                            {originalPrice.toLocaleString()} IQD
                                        </span>
                                    )}
                                </div>

                                {/* Delete */}
                                <button
                                    type="button"
                                    onClick={() => removeBump(index)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Middle: text inputs */}
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={bump.headline}
                                    onChange={(e) => updateBump(index, { headline: e.target.value })}
                                    placeholder={t("products.ed.bump.headline")}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                />
                                <textarea
                                    value={bump.description}
                                    onChange={(e) => updateBump(index, { description: e.target.value })}
                                    placeholder={t("products.ed.bump.description")}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] resize-none"
                                />
                            </div>

                            {/* Bottom row: discount */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={bump.discount_percentage}
                                        onChange={(e) =>
                                            updateBump(index, {
                                                discount_percentage: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                                            })
                                        }
                                        min={0}
                                        max={100}
                                        className="w-20 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                    <span className="text-sm text-muted">% off</span>
                                </div>
                                {bump.discount_percentage > 0 && (
                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-medium">
                                        {Math.round(discountedPrice).toLocaleString()} IQD
                                    </span>
                                )}
                            </div>

                            {/* Preview card */}
                            <div className="space-y-1">
                                <p className="text-xs text-muted">Customer sees:</p>
                                <div className="p-3 bg-[var(--pastel-yellow)] rounded-lg border border-yellow-200">
                                    <div className="flex items-start gap-2">
                                        <div className="w-4 h-4 mt-0.5 border-2 border-yellow-600 rounded shrink-0 flex items-center justify-center">
                                            {/* Unchecked checkbox - visual only */}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-yellow-900">
                                                {bump.headline || "Add this product!"}
                                            </p>
                                            <p className="text-xs text-yellow-800 mt-0.5">
                                                {bump.description || "Get it at a special price when you order now."}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {bump.discount_percentage > 0 ? (
                                                    <>
                                                        <span className="text-xs text-yellow-700 line-through">
                                                            {originalPrice.toLocaleString()} IQD
                                                        </span>
                                                        <span className="text-sm font-bold text-yellow-900">
                                                            {Math.round(discountedPrice).toLocaleString()} IQD
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-sm font-bold text-yellow-900">
                                                        {originalPrice.toLocaleString()} IQD
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
