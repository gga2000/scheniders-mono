"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X, ChevronDown, ChevronUp, Bookmark, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useProductStore } from "@/store/use-product-store";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

interface AdvancedFiltersProps {
    /** The filters the page is applying now; the panel starts from (and follows) them. */
    value: FilterValues | null;
    onApply: (filters: FilterValues) => void;
    onReset: () => void;
    embedded?: boolean;
}

export interface FilterValues {
    priceMin: number | null;
    priceMax: number | null;
    salesMin: number | null;
    salesMax: number | null;
    revenueMin: number | null;
    revenueMax: number | null;
    stockStatus: "all" | "in_stock" | "low_stock" | "out_of_stock";
    showArchived: boolean;
    categoryId: string | null;
    visibility: "all" | "visible" | "hidden";
    productType: string | null;
    hasVariants: "all" | "yes" | "no";
    tagId: string | null;
}

export const EMPTY_ADVANCED_FILTERS: FilterValues = {
    priceMin: null,
    priceMax: null,
    salesMin: null,
    salesMax: null,
    revenueMin: null,
    revenueMax: null,
    stockStatus: "all",
    showArchived: false,
    categoryId: null,
    visibility: "all",
    productType: null,
    hasVariants: "all",
    tagId: null,
};

function countActiveFilters(filters: FilterValues): number {
    let count = 0;
    if (filters.priceMin !== null) count++;
    if (filters.priceMax !== null) count++;
    if (filters.salesMin !== null) count++;
    if (filters.salesMax !== null) count++;
    if (filters.revenueMin !== null) count++;
    if (filters.revenueMax !== null) count++;
    if (filters.stockStatus !== "all") count++;
    if (filters.showArchived) count++;
    if (filters.categoryId !== null) count++;
    if (filters.visibility !== "all") count++;
    if (filters.productType !== null) count++;
    if (filters.hasVariants !== "all") count++;
    if (filters.tagId !== null) count++;
    return count;
}

const inputClasses = "px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-foreground";
const labelClasses = "block text-sm font-medium text-foreground mb-2";

export function AdvancedFilters({ value, onApply, onReset, embedded = false }: AdvancedFiltersProps) {
    const [isOpen, setIsOpen] = useState(embedded);
    const [filters, setFilters] = useState<FilterValues>(value ?? EMPTY_ADVANCED_FILTERS);
    // Follow the page: a removed pill, a forecast card or the URL changes the
    // applied filters, and the draft here must not bring the old ones back.
    const [appliedValue, setAppliedValue] = useState(value);
    if (value !== appliedValue) {
        setAppliedValue(value);
        setFilters(value ?? EMPTY_ADVANCED_FILTERS);
    }
    const [showSavePreset, setShowSavePreset] = useState(false);
    const [presetName, setPresetName] = useState("");
    const { t } = useLanguage();
    const { data: categories } = useCategoriesQuery();
    const { tenantId } = useAuth();
    const { data: tags = [] } = useQuery<{ id: string; name: string; color: string }[]>({
        queryKey: ["product-tags-filter", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("product_tags")
                .select("id, name, color")
                .eq("tenant_id", tenantId)
                .order("name", { ascending: true });
            if (error) throw error;
            return (data ?? []) as { id: string; name: string; color: string }[];
        },
        enabled: !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
    const savedFilterPresets = useProductStore((s) => s.savedFilterPresets);
    const addFilterPreset = useProductStore((s) => s.addFilterPreset);
    const removeFilterPreset = useProductStore((s) => s.removeFilterPreset);

    const activeCount = countActiveFilters(filters);

    const handleReset = () => {
        setFilters(EMPTY_ADVANCED_FILTERS);
        onReset();
    };

    const handleApply = () => {
        onApply(filters);
    };

    const handleSavePreset = () => {
        if (!presetName.trim()) return;
        addFilterPreset({
            id: crypto.randomUUID(),
            name: presetName.trim(),
            createdAt: new Date().toISOString(),
            state: {
                searchQuery: "",
                advancedFilters: { ...filters },
                sortBy: "",
            },
        });
        setPresetName("");
        setShowSavePreset(false);
    };

    const handleLoadPreset = (presetFilters: Partial<FilterValues> | null) => {
        // Presets saved by older versions may miss newer fields; fill them with defaults.
        const loaded: FilterValues = { ...EMPTY_ADVANCED_FILTERS, ...(presetFilters ?? {}) };
        setFilters(loaded);
        onApply(loaded);
    };

    const updateFilter = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <div className={embedded ? "" : "relative"}>
            {/* Toggle Button (hidden when embedded) */}
            {!embedded && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                        activeCount > 0
                            ? "bg-[var(--pastel-yellow)] border-amber-200 text-amber-900"
                            : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:border-[var(--ink)]"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    <span className="font-medium">{t("products.filters.title")}</span>
                    {activeCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
                            {activeCount}
                        </span>
                    )}
                    {isOpen ? (
                        <ChevronUp className="w-4 h-4" />
                    ) : (
                        <ChevronDown className="w-4 h-4" />
                    )}
                </button>
            )}

            {/* Filter Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={embedded ? false : { opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={embedded ? undefined : { opacity: 0, y: -10 }}
                        className={cn(
                            "bg-[var(--card-bg)] overflow-hidden",
                            embedded
                                ? "w-full"
                                : "absolute right-0 top-full mt-2 z-50 w-96 rounded-2xl shadow-lg border border-[var(--card-border)]"
                        )}
                    >
                        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                            <h3 className="font-semibold text-foreground">{t("products.filters.advanced")}</h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-[var(--background)] rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-muted" />
                            </button>
                        </div>

                        {/* Saved Presets */}
                        {savedFilterPresets.length > 0 && (
                            <div className="px-4 pt-3 pb-1">
                                <p className="text-xs font-medium text-muted mb-2">{t("products.filters.savedPresets")}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {savedFilterPresets.map((preset) => (
                                        <div key={preset.id} className="flex items-center gap-1 group">
                                            <button
                                                onClick={() => handleLoadPreset(preset.state.advancedFilters as Partial<FilterValues> | null)}
                                                className="px-2.5 py-1 text-xs bg-[var(--background)] border border-[var(--card-border)] rounded-lg hover:border-[var(--ink)] transition-colors text-foreground font-medium"
                                            >
                                                {preset.name}
                                            </button>
                                            <button
                                                onClick={() => removeFilterPreset(preset.id)}
                                                className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--pastel-pink)] rounded transition-all"
                                                title={t("products.filters.deletePreset")}
                                            >
                                                <X className="w-3 h-3 text-rose-600" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            {/* Category Filter */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.category")}</label>
                                <select
                                    value={filters.categoryId ?? ""}
                                    onChange={(e) => updateFilter("categoryId", e.target.value || null)}
                                    className={cn(inputClasses, "w-full")}
                                >
                                    <option value="">{t("products.filters.allCategories")}</option>
                                    {categories?.map((cat) => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Price Range */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.priceRange")}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={filters.priceMin ?? ""}
                                        onChange={(e) => updateFilter("priceMin", e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder={t("products.filters.min")}
                                        className={inputClasses}
                                    />
                                    <input
                                        type="number"
                                        value={filters.priceMax ?? ""}
                                        onChange={(e) => updateFilter("priceMax", e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder={t("products.filters.max")}
                                        className={inputClasses}
                                    />
                                </div>
                            </div>

                            {/* Sales Range */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.salesCount")}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={filters.salesMin ?? ""}
                                        onChange={(e) => updateFilter("salesMin", e.target.value ? parseInt(e.target.value) : null)}
                                        placeholder={t("products.filters.min")}
                                        className={inputClasses}
                                    />
                                    <input
                                        type="number"
                                        value={filters.salesMax ?? ""}
                                        onChange={(e) => updateFilter("salesMax", e.target.value ? parseInt(e.target.value) : null)}
                                        placeholder={t("products.filters.max")}
                                        className={inputClasses}
                                    />
                                </div>
                            </div>

                            {/* Stock Status */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.stockStatus")}</label>
                                <select
                                    value={filters.stockStatus}
                                    onChange={(e) => updateFilter("stockStatus", e.target.value as FilterValues["stockStatus"])}
                                    className={cn(inputClasses, "w-full")}
                                >
                                    <option value="all">{t("products.filters.all")}</option>
                                    <option value="in_stock">{t("products.stock.inStock")}</option>
                                    <option value="low_stock">{t("products.stock.lowStock")}</option>
                                    <option value="out_of_stock">{t("products.stock.outOfStock")}</option>
                                </select>
                            </div>

                            {/* Visibility */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.visibility")}</label>
                                <select
                                    value={filters.visibility}
                                    onChange={(e) => updateFilter("visibility", e.target.value as FilterValues["visibility"])}
                                    className={cn(inputClasses, "w-full")}
                                >
                                    <option value="all">{t("products.filters.all")}</option>
                                    <option value="visible">{t("products.filters.visibleOnly")}</option>
                                    <option value="hidden">{t("products.filters.hiddenOnly")}</option>
                                </select>
                            </div>

                            {/* Product Type */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.productType")}</label>
                                <select
                                    value={filters.productType ?? ""}
                                    onChange={(e) => updateFilter("productType", e.target.value || null)}
                                    className={cn(inputClasses, "w-full")}
                                >
                                    <option value="">{t("products.filters.allTypes")}</option>
                                    <option value="physical">{t("products.filters.physical")}</option>
                                    <option value="digital">{t("products.filters.digital")}</option>
                                    <option value="service">{t("products.filters.service")}</option>
                                    <option value="bundle">{t("products.filters.bundle")}</option>
                                </select>
                            </div>

                            {/* Has Variants */}
                            <div>
                                <label className={labelClasses}>{t("products.filters.variants")}</label>
                                <select
                                    value={filters.hasVariants}
                                    onChange={(e) => updateFilter("hasVariants", e.target.value as FilterValues["hasVariants"])}
                                    className={cn(inputClasses, "w-full")}
                                >
                                    <option value="all">{t("products.filters.all")}</option>
                                    <option value="yes">{t("products.filters.withVariants")}</option>
                                    <option value="no">{t("products.filters.withoutVariants")}</option>
                                </select>
                            </div>

                            {/* Tag */}
                            {tags.length > 0 && (
                                <div>
                                    <label className={labelClasses}>{t("products.filters.tag")}</label>
                                    <select
                                        value={filters.tagId ?? ""}
                                        onChange={(e) => updateFilter("tagId", e.target.value || null)}
                                        className={cn(inputClasses, "w-full")}
                                    >
                                        <option value="">{t("products.filters.allTags")}</option>
                                        {tags.map((tag) => (
                                            <option key={tag.id} value={tag.id}>
                                                {tag.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Show Archived */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="showArchived"
                                    checked={filters.showArchived}
                                    onChange={(e) => updateFilter("showArchived", e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--card-border)] text-[var(--foreground)] focus:ring-[var(--pastel-yellow)]"
                                />
                                <label htmlFor="showArchived" className="text-sm text-foreground">
                                    {t("products.filters.showArchived")}
                                </label>
                            </div>
                        </div>

                        {/* Save Preset */}
                        {activeCount > 0 && (
                            <div className="px-4 pb-2">
                                {showSavePreset ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={presetName}
                                            onChange={(e) => setPresetName(e.target.value)}
                                            placeholder={t("products.filters.presetName")}
                                            className={cn(inputClasses, "flex-1")}
                                            onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSavePreset}
                                            disabled={!presetName.trim()}
                                            className="px-3 py-2 bg-[var(--ink)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
                                        >
                                            {t("products.filters.save")}
                                        </button>
                                        <button
                                            onClick={() => { setShowSavePreset(false); setPresetName(""); }}
                                            className="p-2 hover:bg-[var(--background)] rounded-lg transition-colors"
                                        >
                                            <X className="w-4 h-4 text-muted" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSavePreset(true)}
                                        className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
                                    >
                                        <Bookmark className="w-3.5 h-3.5" />
                                        {t("products.filters.saveAsPreset")}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="p-4 border-t border-[var(--card-border)] flex gap-2">
                            <button
                                onClick={handleReset}
                                className="flex-1 px-4 py-2 bg-[var(--background)] text-foreground rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                {t("products.filters.reset")}
                            </button>
                            <button
                                onClick={() => { handleApply(); setIsOpen(false); }}
                                className="flex-1 px-4 py-2 bg-[var(--ink)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
                            >
                                {t("products.filters.apply")}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
