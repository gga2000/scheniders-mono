"use client";

import { cn } from "@/lib/utils";

import { Eye, EyeOff, Tag } from "lucide-react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { CategoryCombobox } from "@/components/products/category-combobox";
import { ProductPerformanceCard } from "./product-performance-card";
import { useLanguage } from "@/hooks/use-language";

interface ProductEditorSidebarProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    mode: "create" | "edit";
    /** Only cost viewers may tick or untick "supply" on an existing product. */
    canReclassifySupply: boolean;
    /** Recipe rows that use this supply; while any do it cannot stop being a supply. */
    recipeUses?: number;
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

export function ProductEditorSidebar({ formData, updateField, mode, canReclassifySupply, recipeUses = 0, timesSold, totalRevenue, profitMargin, averageOrderValue }: ProductEditorSidebarProps) {
    const { t } = useLanguage();
    const lockedByRecipes = formData.is_supply && recipeUses > 0;
    const canToggleSupply = canReclassifySupply && !lockedByRecipes;
    return (
        <div className="space-y-6">
            {/* Status */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                    {t("products.ed.statusLabel")}
                </h3>
                <select
                    value={formData.status}
                    onChange={(e) => updateField("status", e.target.value as 'draft' | 'active' | 'archived')}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                >
                    <option value="draft">{t("products.ed.status.draft")}</option>
                    <option value="active">{t("products.ed.status.active")}</option>
                    <option value="archived">{t("products.ed.status.archived")}</option>
                </select>

                {/* Supply toggle */}
                <div className="p-3 bg-[var(--background)] rounded-xl">
                    <label className={cn("flex items-center gap-3", canToggleSupply ? "cursor-pointer" : "cursor-not-allowed opacity-70")}>
                        <input
                            type="checkbox"
                            checked={formData.is_supply}
                            disabled={!canToggleSupply}
                            onChange={(e) => updateField("is_supply", e.target.checked)}
                            className="w-4 h-4 rounded border-2 border-[var(--muted)] text-[var(--pastel-yellow)] focus:ring-[var(--pastel-yellow)] focus:ring-offset-0 bg-transparent cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div>
                            <p className="text-sm font-medium text-foreground">{t("products.ed.supply")}</p>
                            <p className="text-xs text-muted">
                                {!canReclassifySupply
                                    ? t("products.ed.supplyLocked")
                                    : lockedByRecipes
                                    ? t("products.ed.supplyInRecipes", { count: recipeUses })
                                    : t("products.ed.supplyHint")}
                            </p>
                        </div>
                    </label>
                </div>

                {/* Filler toggle — meaningless for a supply, which is never sellable. */}
                {!formData.is_supply && (
                    <div className="p-3 bg-[var(--background)] rounded-xl">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_filler}
                                onChange={(e) => updateField("is_filler", e.target.checked)}
                                className="w-4 h-4 rounded border-2 border-[var(--muted)] text-[var(--pastel-yellow)] focus:ring-[var(--pastel-yellow)] focus:ring-offset-0 bg-transparent cursor-pointer"
                            />
                            <div>
                                <p className="text-sm font-medium text-foreground">{t("products.ed.filler")}</p>
                                <p className="text-xs text-muted">{t("products.ed.fillerHint")}</p>
                            </div>
                        </label>
                    </div>
                )}
            </div>

            {/* Visibility (non-supply only) */}
            {!formData.is_supply && (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        {t("products.ed.visibility")}
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
                                {t("products.ed.visible")}
                            </>
                        ) : (
                            <>
                                <EyeOff className="w-4 h-4" />
                                {t("products.ed.hidden")}
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Organization (non-supply only) */}
            {!formData.is_supply && (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        {t("products.ed.organization")}
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            {t("products.ed.category")}
                        </label>
                        <CategoryCombobox
                            value={formData.category_id ?? null}
                            onChange={(id) => updateField("category_id", id)}
                            allowUncategorized
                            allowCreate
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            {t("products.ed.displayOrder")}
                            {/* A real space: a margin sits on the wrong side once Arabic text is reordered. */}
                            {" "}
                            <span className="text-xs text-muted">{t("products.ed.displayOrderHint")}</span>
                        </label>
                        <input
                            type="number"
                            value={formData.display_order}
                            onChange={(e) => updateField("display_order", parseInt(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                        />
                    </div>

                    {/* Tag Color */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            <Tag className="w-3.5 h-3.5 inline me-1" />
                            {t("products.ed.tagColor")}
                        </label>
                        {/* Eight swatches on one row: the sidebar is too narrow for 8 x 32px plus gaps. */}
                        <div className="grid grid-cols-8 gap-1.5">
                            {TAG_COLORS.map((preset) => (
                                <button
                                    key={preset.color}
                                    type="button"
                                    onClick={() => updateField("tag_color", preset.color)}
                                    className={`aspect-square w-full rounded-lg border-2 transition-all ${
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
