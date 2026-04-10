"use client";

import { Eye, EyeOff, Tag } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { ProductPerformanceCard } from "./product-performance-card";

interface ProductEditorSidebarProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    mode: "create" | "edit";
    timesSold?: number;
    totalRevenue?: number;
    profitMargin?: number | null;
    averageOrderValue?: number;
}

const TAG_COLORS = [
    { color: '#22c55e', name: 'Green' },
    { color: '#f97316', name: 'Orange' },
    { color: '#3b82f6', name: 'Blue' },
    { color: '#a855f7', name: 'Purple' },
    { color: '#ec4899', name: 'Pink' },
    { color: '#14b8a6', name: 'Teal' },
    { color: '#eab308', name: 'Yellow' },
    { color: '#ef4444', name: 'Red' },
];

export function ProductEditorSidebar({ formData, updateField, mode, timesSold, totalRevenue, profitMargin, averageOrderValue }: ProductEditorSidebarProps) {
    const { data: categories = [] } = useCategoriesQuery();

    return (
        <div className="space-y-6">
            {/* Status */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                    Status
                </h3>
                <select
                    value={formData.status}
                    onChange={(e) => updateField("status", e.target.value as 'draft' | 'active' | 'archived')}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                </select>

                {/* Supply toggle */}
                <div className="p-3 bg-[var(--background)] rounded-xl">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.is_supply}
                            onChange={(e) => updateField("is_supply", e.target.checked)}
                            className="w-4 h-4 rounded border-2 border-[var(--muted)] text-[var(--pastel-yellow)] focus:ring-[var(--pastel-yellow)] focus:ring-offset-0 bg-transparent cursor-pointer"
                        />
                        <div>
                            <p className="text-sm font-medium text-foreground">Internal Supply</p>
                            <p className="text-xs text-muted">Track for packaging/internal use</p>
                        </div>
                    </label>
                </div>
            </div>

            {/* Visibility (non-supply only) */}
            {!formData.is_supply && (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Visibility
                    </h3>
                    <button
                        type="button"
                        onClick={() => updateField("is_visible", !formData.is_visible)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                            formData.is_visible
                                ? "bg-[var(--pastel-mint)] text-teal-700"
                                : "bg-[var(--background)] text-muted"
                        }`}
                    >
                        {formData.is_visible ? (
                            <>
                                <Eye className="w-4 h-4" />
                                Visible on store
                            </>
                        ) : (
                            <>
                                <EyeOff className="w-4 h-4" />
                                Hidden from store
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Organization (non-supply only) */}
            {!formData.is_supply && (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Organization
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Category
                        </label>
                        <select
                            value={formData.category_id ?? ""}
                            onChange={(e) => updateField("category_id", e.target.value || null)}
                            className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                        >
                            <option value="">-- Uncategorized --</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Display Order
                            <span className="text-xs text-muted ml-1">(lower = first)</span>
                        </label>
                        <input
                            type="number"
                            value={formData.display_order}
                            onChange={(e) => updateField("display_order", parseInt(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                        />
                    </div>

                    {/* Tag Color */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            <Tag className="w-3.5 h-3.5 inline mr-1" />
                            Tag Color
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TAG_COLORS.map((preset) => (
                                <button
                                    key={preset.color}
                                    type="button"
                                    onClick={() => updateField("tag_color", preset.color)}
                                    className={`w-8 h-8 rounded-lg border-2 transition-all ${
                                        formData.tag_color === preset.color
                                            ? "border-foreground scale-110 shadow-lg"
                                            : "border-transparent hover:scale-105"
                                    }`}
                                    style={{ backgroundColor: preset.color }}
                                    title={preset.name}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Performance (edit mode only) */}
            {mode === "edit" && (
                <ProductPerformanceCard
                    timesSold={timesSold}
                    totalRevenue={totalRevenue}
                    profitMargin={profitMargin}
                    averageOrderValue={averageOrderValue}
                />
            )}
        </div>
    );
}
