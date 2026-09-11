"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Search, X, Check, Plus, Minus, ChevronDown, ChevronLeft, Layers } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useProductsCrud } from "@/hooks/use-products-crud";
import type { Product } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

interface ProductPickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (product: { product_id: string; name: string; price: number; quantity: number; image_url?: string; tag_color?: string; is_open_box?: boolean }) => void;
}

interface SelectedProduct {
    product: Product;
    quantity: number;
    isOpenBox: boolean;
}

export function ProductPicker({ open, onClose, onSelect }: ProductPickerProps) {
    const { products, loading } = useProductsCrud();
    const [search, setSearch] = useState("");
    const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct>>(new Map());
    const { t } = useLanguage();

    const [fillerOpen, setFillerOpen] = useState(false);

    // Only show active (non-archived) products that are not supplies, split by
    // whether the shop actually keeps them in stock. Filler is catalogue depth —
    // orderable, but staff should reach real stock first, so it gets tucked
    // behind a collapsed group rather than padding out the everyday list.
    const { mainProducts, fillerProducts } = useMemo(() => {
        const sellable = products.filter(p => !p.is_archived && !p.is_supply);
        const searchLower = search.trim().toLowerCase();
        const matched = searchLower
            ? sellable.filter(p => p.name.toLowerCase().includes(searchLower))
            : sellable;
        return {
            mainProducts: matched.filter(p => !p.is_filler),
            fillerProducts: matched.filter(p => p.is_filler),
        };
    }, [products, search]);

    const totalShown = mainProducts.length + fillerProducts.length;
    const selectedFillerCount = fillerProducts.reduce(
        (n, p) => n + (selectedProducts.has(p.id) ? 1 : 0), 0
    );
    // Derived, not stored: searching a real product name and being told there
    // is nothing — with the answer one collapsed click away — is the failure
    // this guards against.
    const fillerExpanded = fillerOpen || (search.trim().length > 0 && mainProducts.length === 0);

    const toggleProduct = (product: Product) => {
        setSelectedProducts(prev => {
            const newMap = new Map(prev);
            if (newMap.has(product.id)) {
                newMap.delete(product.id);
            } else {
                newMap.set(product.id, { product, quantity: 1, isOpenBox: false });
            }
            return newMap;
        });
    };

    const setOpenBox = (productId: string, isOpenBox: boolean) => {
        setSelectedProducts(prev => {
            const newMap = new Map(prev);
            const item = newMap.get(productId);
            if (item) newMap.set(productId, { ...item, isOpenBox });
            return newMap;
        });
    };

    const updateQuantity = (productId: string, delta: number) => {
        setSelectedProducts(prev => {
            const newMap = new Map(prev);
            const item = newMap.get(productId);
            if (item) {
                const newQty = Math.max(1, item.quantity + delta);
                newMap.set(productId, { ...item, quantity: newQty });
            }
            return newMap;
        });
    };

    const handleConfirm = () => {
        selectedProducts.forEach(({ product, quantity, isOpenBox }) => {
            onSelect({
                product_id: product.id,
                // Order snapshots carry the internal ops name; the marketing
                // title (products.name) stays customer-facing on the storefront.
                name: product.short_name?.trim() || product.name,
                price: product.price,
                quantity: quantity,
                image_url: product.image_url || "",
                tag_color: product.tag_color || "#22c55e", // Include product color, default to green
                is_open_box: isOpenBox,
            });
        });
        handleClose();
    };

    const handleClose = () => {
        setSearch("");
        setSelectedProducts(new Map());
        onClose();
    };

    // One renderer for both lists — main stock and filler rows are identical;
    // only where they sit differs.
    const renderRow = (product: Product) => {
        const isSelected = selectedProducts.has(product.id);
        const selectedData = selectedProducts.get(product.id);

        return (
            <div
                key={product.id}
                className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer",
                    isSelected
                        ? "bg-[var(--pastel-green-light)] ring-1 ring-green-300"
                        : "hover:bg-[var(--background)]"
                )}
                onClick={() => !isSelected && toggleProduct(product)}
            >
                {/* Product Image */}
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                ) : (
                    <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: product.tag_color || '#e5e7eb' }}
                    >
                        <Package className="w-5 h-5 text-white/80" />
                    </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{product.name}</p>
                    <p className="text-sm font-mono text-green-700 font-bold">{formatIQD(product.price)}</p>
                    {isSelected && selectedData && (
                        <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setOpenBox(product.id, false)}
                                className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all",
                                    !selectedData.isOpenBox
                                        ? "bg-green-600 text-white"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                )}
                            >
                                جديد
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpenBox(product.id, true)}
                                className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all",
                                    selectedData.isOpenBox
                                        ? "bg-amber-500 text-white"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                )}
                            >
                                علبة مفتوحة{product.open_box_quantity > 0 ? ` (${product.open_box_quantity})` : ""}
                            </button>
                        </div>
                    )}
                </div>

                {/* Quantity Controls or Checkbox */}
                {isSelected && selectedData ? (
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-white border border-[var(--card-border)] rounded-lg overflow-hidden">
                            <button
                                onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, -1); }}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-bold">{selectedData.quantity}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, 1); }}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleProduct(product); }}
                            className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleProduct(product); }}
                        className="w-8 h-8 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center justify-center transition-colors shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    };

    const totalSelected = selectedProducts.size;
    const totalValue = Array.from(selectedProducts.values()).reduce(
        (sum, { product, quantity }) => sum + (product.price * quantity), 0
    );

    // Need to check for client-side rendering for portal
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!open || !mounted) return null;

    const modalContent = (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[var(--card-border)] flex flex-col"
                    style={{ maxHeight: 'min(80vh, 600px)' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] bg-[var(--background)] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                <Package className="w-4 h-4 text-green-700" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{t("orders.productPicker.title")}</h3>
                                <p className="text-xs text-muted">{totalShown} {t("orders.productPicker.product")} • {totalSelected} {t("orders.productPicker.selected")}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className="w-8 h-8 rounded-lg hover:bg-[var(--card-border)] flex items-center justify-center transition-all"
                        >
                            <X className="w-4 h-4 text-muted" />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-3 border-b border-[var(--card-border)] bg-white shrink-0">
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t("orders.productPicker.search")}
                                className="w-full h-10 pr-10 pl-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Product List - Scrollable */}
                    <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-gray-200 border-t-green-500 rounded-full animate-spin" />
                            </div>
                        ) : totalShown === 0 ? (
                            <div className="text-center py-12 text-muted">
                                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">{t("orders.productPicker.noProducts")}</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1.5">
                                {mainProducts.map(renderRow)}

                                {fillerProducts.length > 0 && (
                                    <div className="pt-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setFillerOpen(!fillerExpanded)}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-[var(--background)] hover:bg-[var(--card-border)] transition-colors text-right"
                                        >
                                            {fillerExpanded
                                                ? <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                                                : <ChevronLeft className="w-4 h-4 text-muted shrink-0" />}
                                            <Layers className="w-4 h-4 text-muted shrink-0" />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-semibold text-foreground truncate">
                                                    {t("orders.productPicker.fillerGroup")} ({fillerProducts.length})
                                                    {selectedFillerCount > 0 && (
                                                        <span className="mr-1.5 text-green-700">
                                                            • {selectedFillerCount} {t("orders.productPicker.selected")}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="block text-[11px] text-muted truncate">
                                                    {t("orders.productPicker.fillerHint")}
                                                </span>
                                            </span>
                                        </button>

                                        {fillerExpanded && (
                                            <div className="mt-1.5 space-y-1.5">
                                                {fillerProducts.map(renderRow)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between p-4 bg-[var(--background)] border-t border-[var(--card-border)] shrink-0">
                        <div>
                            {totalSelected > 0 && (
                                <p className="text-sm">
                                    <span className="text-muted">{totalSelected} {t("orders.productPicker.product")}</span>
                                    <span className="mx-2">•</span>
                                    <span className="font-bold font-mono text-green-700">{formatIQD(totalValue)}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                            >
                                {t("orders.productPicker.cancel")}
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={totalSelected === 0}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
                                    totalSelected > 0
                                        ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] shadow-md"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                            >
                                <Check className="w-4 h-4" />
                                {t("orders.productPicker.add", { count: String(totalSelected) })}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
