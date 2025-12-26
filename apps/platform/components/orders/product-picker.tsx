"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Search, X, Check, Plus, Minus } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useProductsCrud } from "@/hooks/use-products-crud";
import type { Product } from "@/lib/supabase";

interface ProductPickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (product: { name: string; price: number; quantity: number; image_url?: string; tag_color?: string }) => void;
}

interface SelectedProduct {
    product: Product;
    quantity: number;
}

export function ProductPicker({ open, onClose, onSelect }: ProductPickerProps) {
    const { products, loading } = useProductsCrud();
    const [search, setSearch] = useState("");
    const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct>>(new Map());

    // Only show active (non-archived) products
    const filteredProducts = useMemo(() => {
        const activeProducts = products.filter(p => !p.is_archived);
        if (!search.trim()) return activeProducts;
        const searchLower = search.toLowerCase();
        return activeProducts.filter(p => p.name.toLowerCase().includes(searchLower));
    }, [products, search]);

    const toggleProduct = (product: Product) => {
        setSelectedProducts(prev => {
            const newMap = new Map(prev);
            if (newMap.has(product.id)) {
                newMap.delete(product.id);
            } else {
                newMap.set(product.id, { product, quantity: 1 });
            }
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
        selectedProducts.forEach(({ product, quantity }) => {
            onSelect({
                name: product.name,
                price: product.price,
                quantity: quantity,
                image_url: product.image_url || "",
                tag_color: product.tag_color || "#22c55e", // Include product color, default to green
            });
        });
        handleClose();
    };

    const handleClose = () => {
        setSearch("");
        setSelectedProducts(new Map());
        onClose();
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
                                <h3 className="font-bold text-foreground">اختر المنتجات</h3>
                                <p className="text-xs text-muted">{filteredProducts.length} منتج • {totalSelected} محدد</p>
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
                                placeholder="ابحث عن منتج..."
                                className="w-full h-10 pr-10 pl-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-green)] focus:border-transparent"
                                dir="rtl"
                            />
                        </div>
                    </div>

                    {/* Product List - Scrollable */}
                    <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-gray-200 border-t-green-500 rounded-full animate-spin" />
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="text-center py-12 text-muted">
                                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">لا توجد منتجات</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1.5">
                                {filteredProducts.map((product) => {
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
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between p-4 bg-[var(--background)] border-t border-[var(--card-border)] shrink-0">
                        <div>
                            {totalSelected > 0 && (
                                <p className="text-sm">
                                    <span className="text-muted">{totalSelected} منتج</span>
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
                                إلغاء
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
                                إضافة ({totalSelected})
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
