"use client";

import { formatIQD } from "@/lib/utils";

import { useState, useMemo } from "react";
import { Link2, Plus, Trash2, Search, Package } from "lucide-react";
import type { Product } from "@/lib/supabase";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useLanguage } from "@/hooks/use-language";

export interface RelatedProductFormData {
    related_product_id: string;
    relation_type: 'complementary' | 'similar' | 'upsell';
    display_order: number;
    // For UI display
    name?: string;
    price?: number;
    image_url?: string;
}

interface RelatedProductsSectionProps {
    relatedProducts: RelatedProductFormData[];
    onChange: (products: RelatedProductFormData[]) => void;
    currentProductId?: string;
}

type FilterType = 'all' | 'complementary' | 'similar' | 'upsell';

const relationColors: Record<RelatedProductFormData['relation_type'], string> = {
    complementary: 'bg-[var(--pastel-blue)] text-blue-800',
    similar: 'bg-[var(--pastel-pink)] text-pink-800',
    upsell: 'bg-[var(--pastel-green)] text-green-800',
};

export function RelatedProductsSection({
    relatedProducts,
    onChange,
    currentProductId,
}: RelatedProductsSectionProps) {
    const { t } = useLanguage();
    const { products } = useProductsCrud();
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");

    // Available products (exclude current product and already-added items)
    const addedIds = new Set(relatedProducts.map((item) => item.related_product_id));
    const availableProducts = useMemo(() => {
        return products
            .filter((p) =>
                p.id !== currentProductId &&
                !addedIds.has(p.id) &&
                !p.is_archived
            )
            .filter((p) =>
                !searchQuery ||
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [products, currentProductId, addedIds, searchQuery]);

    const addProduct = (product: Product) => {
        const newProducts: RelatedProductFormData[] = [
            ...relatedProducts,
            {
                related_product_id: product.id,
                relation_type: 'complementary',
                display_order: relatedProducts.length,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
            },
        ];
        onChange(newProducts);
        setSearchQuery("");
        setShowSearch(false);
    };

    const removeProduct = (index: number) => {
        const newProducts = relatedProducts.filter((_, i) => i !== index);
        onChange(newProducts);
    };

    const updateRelationType = (index: number, relation_type: RelatedProductFormData['relation_type']) => {
        const newProducts = relatedProducts.map((item, i) =>
            i === index ? { ...item, relation_type } : item
        );
        onChange(newProducts);
    };

    // Filtered products for display
    // Saved rows carry only ids; name, price and image come from the catalogue.
    const shownRelated = relatedProducts.map((item) => {
        const live = products.find((p) => p.id === item.related_product_id);
        return {
            ...item,
            name: item.name || live?.name,
            price: item.price ?? live?.price,
            image_url: item.image_url || live?.image_url || undefined,
        };
    });

    const filteredProducts = activeFilter === 'all'
        ? shownRelated
        : shownRelated.filter((p) => p.relation_type === activeFilter);

    // Counts per type
    const complementaryCount = relatedProducts.filter((p) => p.relation_type === 'complementary').length;
    const similarCount = relatedProducts.filter((p) => p.relation_type === 'similar').length;
    const upsellCount = relatedProducts.filter((p) => p.relation_type === 'upsell').length;

    const tabs: { key: FilterType; label: string; count: number }[] = [
        { key: 'all', label: t("products.ed.related.all"), count: relatedProducts.length },
        { key: 'complementary', label: t("products.ed.related.complementary"), count: complementaryCount },
        { key: 'similar', label: t("products.ed.related.similar"), count: similarCount },
        { key: 'upsell', label: t("products.ed.related.upsell"), count: upsellCount },
    ];

    // Build summary string
    const summaryParts: string[] = [];
    if (complementaryCount > 0) summaryParts.push(`${complementaryCount} complementary`);
    if (similarCount > 0) summaryParts.push(`${similarCount} similar`);
    if (upsellCount > 0) summaryParts.push(`${upsellCount} upsell`);

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
                    {t("products.ed.related.add")}
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
                            placeholder={t("products.ed.related.search")}
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
                                    onClick={() => addProduct(product)}
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

            {/* Empty state */}
            {relatedProducts.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Link2 className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {t("products.ed.related.empty")}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Filter tabs */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveFilter(tab.key)}
                                className={
                                    activeFilter === tab.key
                                        ? "px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium"
                                        : "px-3 py-1.5 text-muted hover:text-foreground rounded-lg text-sm transition-colors"
                                }
                            >
                                {tab.label}
                                <span className="ml-1.5 opacity-70">{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Product cards */}
                    <div className="space-y-2">
                        {filteredProducts.map((item) => {
                            // Find original index in relatedProducts for mutations
                            const originalIndex = relatedProducts.findIndex(
                                (p) => p.related_product_id === item.related_product_id
                            );

                            return (
                                <div
                                    key={item.related_product_id}
                                    className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                                >
                                    {/* Product image */}
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

                                    {/* Product info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {item.name || t("products.ed.related.unknown")}
                                        </p>
                                        <p className="text-xs text-muted">
                                            {formatIQD(item.price || 0)}
                                        </p>
                                    </div>

                                    {/* Relation type selector */}
                                    <select
                                        value={item.relation_type}
                                        onChange={(e) =>
                                            updateRelationType(
                                                originalIndex,
                                                e.target.value as RelatedProductFormData['relation_type']
                                            )
                                        }
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none ${relationColors[item.relation_type]}`}
                                    >
                                        <option value="complementary">{t("products.ed.related.complementary")}</option>
                                        <option value="similar">{t("products.ed.related.similar")}</option>
                                        <option value="upsell">{t("products.ed.related.upsell")}</option>
                                    </select>

                                    {/* Delete button */}
                                    <button
                                        type="button"
                                        onClick={() => removeProduct(originalIndex)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-muted">
                        {relatedProducts.length} related product{relatedProducts.length !== 1 ? "s" : ""}
                        {summaryParts.length > 0 && ` (${summaryParts.join(", ")})`}
                    </p>
                </div>
            )}
        </div>
    );
}
