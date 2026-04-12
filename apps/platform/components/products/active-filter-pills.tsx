"use client";

import { X } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import type { FilterValues } from "./advanced-filters";

interface ActiveFilterPillsProps {
    filters: FilterValues | null;
    onChange: (next: FilterValues | null) => void;
}

type PillKey = keyof FilterValues;

export function ActiveFilterPills({ filters, onChange }: ActiveFilterPillsProps) {
    const { t } = useLanguage();
    const { data: categories } = useCategoriesQuery();

    if (!filters) return null;

    const remove = (keys: PillKey[], defaults: Partial<FilterValues>) => {
        const next: FilterValues = { ...filters, ...defaults };
        // If no filters remain, null the whole thing
        const anyActive =
            next.priceMin !== null ||
            next.priceMax !== null ||
            next.salesMin !== null ||
            next.salesMax !== null ||
            next.revenueMin !== null ||
            next.revenueMax !== null ||
            next.stockStatus !== "all" ||
            next.showArchived ||
            next.categoryId !== null ||
            next.visibility !== "all" ||
            next.productType !== null ||
            next.hasVariants !== "all";
        onChange(anyActive ? next : null);
    };

    const pills: { key: string; label: string; onRemove: () => void }[] = [];

    if (filters.priceMin !== null || filters.priceMax !== null) {
        const min = filters.priceMin !== null ? formatIQD(filters.priceMin) : "*";
        const max = filters.priceMax !== null ? formatIQD(filters.priceMax) : "*";
        pills.push({
            key: "price",
            label: `${t("products.filters.priceRange")}: ${min}–${max}`,
            onRemove: () => remove(["priceMin", "priceMax"], { priceMin: null, priceMax: null }),
        });
    }
    if (filters.salesMin !== null || filters.salesMax !== null) {
        pills.push({
            key: "sales",
            label: `${t("products.filters.salesCount")}: ${filters.salesMin ?? "*"}–${filters.salesMax ?? "*"}`,
            onRemove: () => remove(["salesMin", "salesMax"], { salesMin: null, salesMax: null }),
        });
    }
    if (filters.revenueMin !== null || filters.revenueMax !== null) {
        pills.push({
            key: "revenue",
            label: `Revenue: ${filters.revenueMin ?? "*"}–${filters.revenueMax ?? "*"}`,
            onRemove: () => remove(["revenueMin", "revenueMax"], { revenueMin: null, revenueMax: null }),
        });
    }
    if (filters.stockStatus !== "all") {
        pills.push({
            key: "stockStatus",
            label: `${t("products.filters.stockStatus")}: ${t(`products.stock.${filters.stockStatus === "in_stock" ? "inStock" : filters.stockStatus === "low_stock" ? "lowStock" : "outOfStock"}`)}`,
            onRemove: () => remove(["stockStatus"], { stockStatus: "all" }),
        });
    }
    if (filters.showArchived) {
        pills.push({
            key: "showArchived",
            label: t("products.filters.showArchived"),
            onRemove: () => remove(["showArchived"], { showArchived: false }),
        });
    }
    if (filters.categoryId) {
        const cat = categories?.find((c) => c.id === filters.categoryId);
        pills.push({
            key: "categoryId",
            label: `${t("products.filters.category")}: ${cat?.name ?? filters.categoryId}`,
            onRemove: () => remove(["categoryId"], { categoryId: null }),
        });
    }
    if (filters.visibility !== "all") {
        pills.push({
            key: "visibility",
            label: `${t("products.filters.visibility")}: ${t(`products.filters.${filters.visibility === "visible" ? "visibleOnly" : "hiddenOnly"}`)}`,
            onRemove: () => remove(["visibility"], { visibility: "all" }),
        });
    }
    if (filters.productType) {
        pills.push({
            key: "productType",
            label: `${t("products.filters.productType")}: ${filters.productType}`,
            onRemove: () => remove(["productType"], { productType: null }),
        });
    }
    if (filters.hasVariants !== "all") {
        pills.push({
            key: "hasVariants",
            label: `${t("products.filters.hasVariants")}: ${filters.hasVariants}`,
            onRemove: () => remove(["hasVariants"], { hasVariants: "all" }),
        });
    }

    if (pills.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-medium text-muted">
                {pills.length} {t("products.filters.active")}:
            </span>
            {pills.map((pill) => (
                <button
                    key={pill.key}
                    onClick={pill.onRemove}
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[var(--pastel-yellow)] text-amber-900 rounded-lg border border-amber-200 hover:opacity-90 transition-opacity"
                >
                    <span>{pill.label}</span>
                    <X className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                </button>
            ))}
            <button
                onClick={() => onChange(null)}
                className="text-xs text-muted hover:text-foreground underline ml-1"
            >
                {t("products.filters.clearAll")}
            </button>
        </div>
    );
}
