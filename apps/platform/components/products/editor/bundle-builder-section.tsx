"use client";

import { formatIQD } from "@/lib/utils";

import { useState, useMemo } from "react";
import { Layers, Plus, Trash2, Search, GripVertical, Package } from "lucide-react";
import type { Product } from "@/lib/supabase";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useLanguage } from "@/hooks/use-language";

interface BundleItem {
    child_product_id: string;
    quantity: number;
    display_order: number;
    // For UI display
    name?: string;
    price?: number;
    image_url?: string;
}

import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface BundleBuilderSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    currentProductId?: string;
}

export function BundleBuilderSection({ formData, updateField, currentProductId }: BundleBuilderSectionProps) {
    const { t } = useLanguage();
    const { products } = useProductsCrud();
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);

    const bundleItems: BundleItem[] = formData.bundle_items || [];

    // Saved rows carry only ids; name, price and image come from the catalogue.
    const shownItems: BundleItem[] = useMemo(
        () =>
            bundleItems.map((item: BundleItem) => {
                const live = products.find((p) => p.id === item.child_product_id);
                return {
                    ...item,
                    name: item.name || live?.name || "",
                    price: item.price ?? live?.price ?? 0,
                    image_url: item.image_url || live?.image_url || undefined,
                };
            }),
        [bundleItems, products]
    );

    // Available products (exclude current product and already-added items)
    const addedIds = new Set(bundleItems.map((item: BundleItem) => item.child_product_id));
    const availableProducts = useMemo(() => {
        return products
            .filter((p) =>
                p.id !== currentProductId &&
                !addedIds.has(p.id) &&
                !p.is_archived &&
                p.product_type !== 'bundle' // Prevent nested bundles
            )
            .filter((p) =>
                !searchQuery ||
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [products, currentProductId, addedIds, searchQuery]);

    const addItem = (product: Product) => {
        const newItems = [
            ...bundleItems,
            {
                child_product_id: product.id,
                quantity: 1,
                display_order: bundleItems.length,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
            },
        ];
        updateField("bundle_items", newItems);
        setSearchQuery("");
        setShowSearch(false);
    };

    const removeItem = (index: number) => {
        const newItems = bundleItems.filter((_, i: number) => i !== index);
        updateField("bundle_items", newItems);
    };

    const updateQuantity = (index: number, quantity: number) => {
        const newItems = bundleItems.map((item: BundleItem, i: number) =>
            i === index ? { ...item, quantity: Math.max(1, quantity) } : item
        );
        updateField("bundle_items", newItems);
    };

    // Calculate bundle totals
    const totalPrice = shownItems.reduce((sum: number, item: BundleItem) =>
        sum + (item.price || 0) * item.quantity, 0
    );
    const totalItems = shownItems.reduce((sum: number, item: BundleItem) =>
        sum + item.quantity, 0
    );

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    {t("products.bundle.contents")}
                </h2>
                <button
                    type="button"
                    onClick={() => setShowSearch(!showSearch)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.bundle.addProduct")}
                </button>
            </div>

            {/* Search dropdown */}
            {showSearch && (
                <div className="border border-[var(--card-border)] rounded-xl overflow-hidden">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t("products.bundle.searchPh")}
                            autoFocus
                            className="w-full pl-10 pr-4 py-3 bg-[var(--background)] text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto border-t border-[var(--card-border)]">
                        {availableProducts.length === 0 ? (
                            <p className="p-4 text-sm text-muted text-center">{t("products.noProducts")}</p>
                        ) : (
                            availableProducts.slice(0, 10).map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => addItem(product)}
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
                                    <span className="text-sm text-muted">{formatIQD(product.price ?? 0)}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Bundle items list */}
            {bundleItems.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Layers className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No products in this bundle. Click &quot;Add Product&quot; to start building your bundle.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {shownItems.map((item: BundleItem, index: number) => (
                        <div
                            key={item.child_product_id}
                            className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                        >
                            <GripVertical className="w-4 h-4 text-muted shrink-0 cursor-grab" />

                            {item.image_url ? (
                                <img
                                    src={item.image_url}
                                    alt=""
                                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                    <Package className="w-5 h-5 text-muted" />
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {item.name || t("products.ed.related.unknown")}
                                </p>
                                <p className="text-xs text-muted">
                                    {formatIQD(item.price || 0)} {t("products.bundle.each")}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="text-xs text-muted">{t("products.bundle.qty")}</label>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                                    min={1}
                                    className="w-16 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                />
                            </div>

                            <p className="text-sm font-medium text-foreground w-24 text-right shrink-0">
                                {formatIQD(((item.price || 0) * item.quantity))}
                            </p>

                            <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    {/* Bundle summary */}
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                        <p className="text-sm text-muted">
                            {totalItems} item{totalItems !== 1 ? "s" : ""} in bundle
                        </p>
                        <div className="text-right">
                            <p className="text-xs text-muted">{t("products.bundle.sumOfParts")}</p>
                            <p className="text-lg font-bold text-foreground">{formatIQD(totalPrice)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
