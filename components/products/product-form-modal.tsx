"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Package, DollarSign, Archive, Image as ImageIcon } from "lucide-react";
import { Product, ProductVariant } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { ProductImageUpload } from "./product-image-upload";

interface ProductFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ProductFormData) => Promise<void>;
    product?: Product | null;
    mode: "add" | "edit";
}

export interface ProductFormData {
    name: string;
    description: string;
    sku: string; // Product SKU for LightFunnels matching
    price: number;
    cost: number;
    stock_quantity: number;
    low_stock_threshold: number;
    image_url: string;
    tag_color: string; // Custom color for product tag display
    variants: VariantFormData[];
}

interface VariantFormData {
    id?: string;
    name: string;
    price: number;
    cost: number;
    stock_quantity: number;
    sku: string;
}

export function ProductFormModal({
    isOpen,
    onClose,
    onSubmit,
    product,
    mode,
}: ProductFormModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<ProductFormData>({
        name: "",
        description: "",
        sku: "",
        price: 0,
        cost: 0,
        stock_quantity: 0,
        low_stock_threshold: 5,
        image_url: "",
        tag_color: "#22c55e", // Default green
        variants: [],
    });

    // Initialize form with product data when editing
    useEffect(() => {
        if (product && mode === "edit") {
            setFormData({
                name: product.name,
                description: product.description || "",
                sku: product.sku || "",
                price: product.price,
                cost: product.cost || 0,
                stock_quantity: product.stock_quantity,
                low_stock_threshold: product.low_stock_threshold,
                image_url: product.image_url || "",
                tag_color: product.tag_color || "#22c55e",
                variants: (product.variants || []).map((v) => ({
                    id: v.id,
                    name: v.name,
                    price: v.price || 0,
                    cost: v.cost || 0,
                    stock_quantity: v.stock_quantity,
                    sku: v.sku || "",
                })),
            });
        } else {
            setFormData({
                name: "",
                description: "",
                sku: "",
                price: 0,
                cost: 0,
                stock_quantity: 0,
                low_stock_threshold: 5,
                image_url: "",
                tag_color: "#22c55e",
                variants: [],
            });
        }
    }, [product, mode, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            console.error("Error submitting product:", error);
        } finally {
            setLoading(false);
        }
    };

    const addVariant = () => {
        setFormData((prev) => ({
            ...prev,
            variants: [
                ...prev.variants,
                { name: "", price: prev.price, cost: prev.cost, stock_quantity: 0, sku: "" },
            ],
        }));
    };

    const removeVariant = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.filter((_, i) => i !== index),
        }));
    };

    const updateVariant = (index: number, field: keyof VariantFormData, value: string | number) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((v, i) =>
                i === index ? { ...v, [field]: value } : v
            ),
        }));
    };

    const profitMargin = formData.cost > 0
        ? (((formData.price - formData.cost) / formData.price) * 100).toFixed(1)
        : null;

    if (!isOpen) return null;

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
                    className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    {/* Header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                                <Package className="w-5 h-5 text-amber-700" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">
                                {mode === "add" ? "Add New Product" : "Edit Product"}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                        >
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                                Basic Information
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Product Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g., Dior Sauvage"
                                        required
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        SKU (LightFunnels)
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, sku: e.target.value }))}
                                        placeholder="e.g., DIOR-SAU-100"
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                        placeholder="Product description..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <ProductImageUpload
                                        value={formData.image_url}
                                        onChange={(url) => setFormData((prev) => ({ ...prev, image_url: url }))}
                                        productId={product?.id}
                                    />
                                </div>

                                {/* Tag Color Picker */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Tag Color
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { color: '#22c55e', name: 'Green' },
                                            { color: '#f97316', name: 'Orange' },
                                            { color: '#3b82f6', name: 'Blue' },
                                            { color: '#a855f7', name: 'Purple' },
                                            { color: '#ec4899', name: 'Pink' },
                                            { color: '#14b8a6', name: 'Teal' },
                                            { color: '#eab308', name: 'Yellow' },
                                            { color: '#ef4444', name: 'Red' },
                                        ].map((preset) => (
                                            <button
                                                key={preset.color}
                                                type="button"
                                                onClick={() => setFormData((prev) => ({ ...prev, tag_color: preset.color }))}
                                                className={`w-10 h-10 rounded-xl border-2 transition-all ${formData.tag_color === preset.color
                                                        ? 'border-foreground scale-110 shadow-lg'
                                                        : 'border-transparent hover:scale-105'
                                                    }`}
                                                style={{ backgroundColor: preset.color }}
                                                title={preset.name}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted mt-2">This color will be used for the product tag in orders</p>
                                </div>
                            </div>
                        </div>

                        {/* Pricing */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                                Pricing
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Selling Price (IQD) *
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                                        placeholder="0"
                                        required
                                        min={0}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Cost Price (IQD)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.cost}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                                        placeholder="0"
                                        min={0}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                <div className="flex items-end">
                                    {profitMargin && (
                                        <div className="w-full px-4 py-3 bg-[var(--pastel-green)] rounded-xl text-center">
                                            <p className="text-xs text-green-700">Profit Margin</p>
                                            <p className="text-lg font-bold text-green-900">{profitMargin}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Inventory */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                                Inventory
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Stock Quantity
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.stock_quantity}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, stock_quantity: parseInt(e.target.value) || 0 }))}
                                        placeholder="0"
                                        min={0}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Low Stock Alert Threshold
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.low_stock_threshold}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, low_stock_threshold: parseInt(e.target.value) || 5 }))}
                                        placeholder="5"
                                        min={0}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Variants */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                                    Variants (Sizes)
                                </h3>
                                <button
                                    type="button"
                                    onClick={addVariant}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Variant
                                </button>
                            </div>

                            {formData.variants.length === 0 ? (
                                <div className="p-6 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                                    <p className="text-muted text-sm">
                                        No variants added. Click "Add Variant" to create size options (e.g., 50ml, 100ml)
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {formData.variants.map((variant, index) => (
                                        <div
                                            key={index}
                                            className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-medium text-foreground">
                                                    Variant {index + 1}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeVariant(index)}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <input
                                                    type="text"
                                                    value={variant.name}
                                                    onChange={(e) => updateVariant(index, "name", e.target.value)}
                                                    placeholder="Size (e.g., 50ml)"
                                                    className="px-3 py-2 bg-white border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                                <input
                                                    type="number"
                                                    value={variant.price}
                                                    onChange={(e) => updateVariant(index, "price", parseFloat(e.target.value) || 0)}
                                                    placeholder="Price"
                                                    className="px-3 py-2 bg-white border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                                <input
                                                    type="number"
                                                    value={variant.stock_quantity}
                                                    onChange={(e) => updateVariant(index, "stock_quantity", parseInt(e.target.value) || 0)}
                                                    placeholder="Stock"
                                                    className="px-3 py-2 bg-white border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                                <input
                                                    type="text"
                                                    value={variant.sku}
                                                    onChange={(e) => updateVariant(index, "sku", e.target.value)}
                                                    placeholder="SKU (optional)"
                                                    className="px-3 py-2 bg-white border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submit Button */}
                        <div className="flex gap-3 pt-4 border-t border-[var(--card-border)]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !formData.name || formData.price <= 0}
                                className="flex-1 px-6 py-3 bg-[var(--foreground)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        {mode === "add" ? <Plus className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                                        {mode === "add" ? "Add Product" : "Save Changes"}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
