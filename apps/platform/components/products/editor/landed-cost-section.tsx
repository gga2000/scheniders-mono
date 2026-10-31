"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, Calculator, TrendingUp, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

export interface CostBreakdown {
    supplier_cost: number;
    shipping: number;
    customs: number;
    handling: number;
    other: number;
}

interface LandedCostSectionProps {
    costBreakdown: CostBreakdown | null;
    onCostBreakdownChange: (breakdown: CostBreakdown) => void;
    onCostChange: (totalCost: number) => void;
    price: number;
    disabled?: boolean;
}

const defaultBreakdown: CostBreakdown = {
    supplier_cost: 0,
    shipping: 0,
    customs: 0,
    handling: 0,
    other: 0,
};

const breakdownFields: { key: keyof CostBreakdown; i18nKey: string; fallback: string }[] = [
    { key: "supplier_cost", i18nKey: "products.cost.supplierCost", fallback: "Supplier Cost" },
    { key: "shipping", i18nKey: "products.cost.shipping", fallback: "Shipping" },
    { key: "customs", i18nKey: "products.cost.customs", fallback: "Customs / Import" },
    { key: "handling", i18nKey: "products.cost.handling", fallback: "Handling" },
    { key: "other", i18nKey: "products.cost.other", fallback: "Other" },
];

export function LandedCostSection({
    costBreakdown,
    onCostBreakdownChange,
    onCostChange,
    price,
    disabled = false,
}: LandedCostSectionProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    const breakdown = costBreakdown ?? defaultBreakdown;

    const landedCost = useMemo(() => {
        return (
            (breakdown.supplier_cost || 0) +
            (breakdown.shipping || 0) +
            (breakdown.customs || 0) +
            (breakdown.handling || 0) +
            (breakdown.other || 0)
        );
    }, [breakdown]);

    const trueMargin = useMemo(() => {
        if (!price || price <= 0) return null;
        const margin = ((price - landedCost) / price) * 100;
        const profit = price - landedCost;
        return { margin, profit };
    }, [price, landedCost]);

    const marginColor = useMemo(() => {
        if (!trueMargin) return "";
        if (trueMargin.margin >= 30) return "text-green-700 bg-[var(--pastel-green)]";
        if (trueMargin.margin >= 15) return "text-amber-700 bg-amber-100";
        return "text-rose-700 bg-rose-100";
    }, [trueMargin]);

    const handleFieldChange = useCallback(
        (key: keyof CostBreakdown, value: number) => {
            const updated = { ...breakdown, [key]: value };
            onCostBreakdownChange(updated);

            const total =
                (updated.supplier_cost || 0) +
                (updated.shipping || 0) +
                (updated.customs || 0) +
                (updated.handling || 0) +
                (updated.other || 0);
            onCostChange(total);
        },
        [breakdown, onCostBreakdownChange, onCostChange]
    );

    const hasBreakdown = costBreakdown !== null;

    if (!hasBreakdown && !isOpen) {
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => {
                        onCostBreakdownChange({ ...defaultBreakdown });
                        setIsOpen(true);
                    }}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Plus className="w-4 h-4" />
                    {t("products.cost.addBreakdown") || "Add cost breakdown"}
                </button>
            </div>
        );
    }

    return (
        <div className="mt-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[var(--background)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-muted" />
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        {t("products.cost.breakdown") || "Cost Breakdown"}
                    </h3>
                    {landedCost > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[var(--card-border)] text-muted font-medium">
                            {formatIQD(landedCost)}
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-muted transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-6 pt-2 space-y-4">
                            <div className="space-y-3">
                                {breakdownFields.map((field, index) => {
                                    const isLast = index === breakdownFields.length - 1;
                                    return (
                                        <div key={field.key} className="flex items-center gap-3">
                                            <div className="w-4 flex flex-col items-center shrink-0">
                                                <span className="text-muted text-xs leading-none">
                                                    {isLast ? "\u2514" : "\u251C"}
                                                </span>
                                            </div>

                                            <label className="text-sm text-foreground w-36 shrink-0">
                                                {t(field.i18nKey) || field.fallback}
                                            </label>

                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={breakdown[field.key] || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        handleFieldChange(
                                                            field.key,
                                                            val === "" ? 0 : parseFloat(val) || 0
                                                        );
                                                    }}
                                                    placeholder="0"
                                                    min={0}
                                                    disabled={disabled}
                                                    className={cn(
                                                        "w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all",
                                                        disabled && "opacity-50 cursor-not-allowed"
                                                    )}
                                                />
                                                <span className="text-xs text-muted shrink-0 w-8">IQD</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-3 pt-3 border-t border-[var(--card-border)]">
                                <div className="w-4 shrink-0" />
                                <span className="text-sm font-semibold text-foreground w-36 shrink-0">
                                    {t("products.cost.landedCost") || "Landed Cost"}
                                </span>
                                <div className="flex-1">
                                    <span className="text-base font-bold text-foreground">
                                        {formatIQD(landedCost)}
                                    </span>
                                </div>
                            </div>

                            {trueMargin !== null && landedCost > 0 && (
                                <div className={cn("inline-flex items-center gap-2 px-3 py-2 rounded-xl", marginColor)}>
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    <span className="text-sm font-bold">
                                        {t("products.cost.trueMargin") || "True Margin"}:{" "}
                                        {trueMargin.margin.toFixed(1)}%
                                    </span>
                                    <span className="text-xs opacity-80">
                                        ({formatIQD(trueMargin.profit)} / unit)
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
