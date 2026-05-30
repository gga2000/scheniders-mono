"use client";

import { motion } from "framer-motion";
import { LayoutGrid, List, ArrowUpDown, MapPin, Banknote, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface SecondaryFilterBarProps {
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: string, order: "asc" | "desc") => void;
    viewMode: "grid" | "list";
    onViewModeChange: (mode: "grid" | "list") => void;
    city: string;
    onCityChange: (city: string) => void;
}

const CITIES = [
    { value: "بغداد", key: "customers.city.baghdad" },
    { value: "البصرة", key: "customers.city.basrah" },
    { value: "نينوى", key: "customers.city.nineveh" },
    { value: "أربيل", key: "customers.city.erbil" },
    { value: "السليمانية", key: "customers.city.sulaymaniyah" },
    { value: "دهوك", key: "customers.city.dohuk" },
    { value: "كركوك", key: "customers.city.kirkuk" },
    { value: "الأنبار", key: "customers.city.anbar" },
    { value: "بابل", key: "customers.city.babylon" },
    { value: "ديالى", key: "customers.city.diyala" },
    { value: "كربلاء", key: "customers.city.karbala" },
    { value: "ميسان", key: "customers.city.maysan" },
    { value: "المثنى", key: "customers.city.muthanna" },
    { value: "النجف", key: "customers.city.najaf" },
    { value: "القادسية", key: "customers.city.qadisiyah" },
    { value: "صلاح الدين", key: "customers.city.salahAdDin" },
    { value: "ذي قار", key: "customers.city.thiQar" },
    { value: "واسط", key: "customers.city.wasit" },
];

/**
 * Compact filter chip that wraps an icon + label + native <select>.
 * The select is invisible on top of the chip — clicking opens the native picker.
 */
function FilterChip({
    icon: Icon,
    label,
    value,
    onChange,
    children,
    isDefault,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
    isDefault?: boolean;
}) {
    return (
        <motion.div
            whileHover={{ y: -1 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={`relative h-9 px-3.5 rounded-full flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                isDefault
                    ? "bg-(--card-bg) border border-(--card-border) text-foreground"
                    : "bg-foreground text-background border border-foreground"
            }`}
        >
            <Icon className={`w-3.5 h-3.5 ${isDefault ? "text-muted-foreground" : "text-background/80"}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wide ${isDefault ? "text-muted-foreground" : "text-background/70"}`}>
                {label}
            </span>
            <span>{value}</span>
            <ChevronDown className={`w-3.5 h-3.5 ${isDefault ? "text-muted-foreground" : "text-background/80"}`} />
            <select
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer appearance-none"
            >
                {children}
            </select>
        </motion.div>
    );
}

export function SecondaryFilterBar({
    sortBy,
    sortOrder,
    onSortChange,
    viewMode,
    onViewModeChange,
    city,
    onCityChange,
}: SecondaryFilterBarProps) {
    const { t } = useLanguage();

    // Compute display labels
    const sortLabels: Record<string, string> = {
        "last_order_date": t("customers.lastOrder"),
        "trust_score": t("customers.trust.score"),
        "total_spent": t("customers.totalSpent"),
        "total_orders": t("customers.orders"),
        "name": t("customers.table.customer"),
    };
    const sortLabel = `${sortLabels[sortBy] || sortBy} ${sortOrder === "desc" ? "↓" : "↑"}`;
    const isSortDefault = sortBy === "last_order_date" && sortOrder === "desc";

    const cityLabel = city ? t(`customers.city.${CITIES.find((c) => c.value === city)?.key.split(".").pop() || ""}`) || city : t("customers.filter.allCities");
    const isCityDefault = !city;

    const valueLabel = sortBy === "total_spent"
        ? (sortOrder === "desc" ? t("customers.filter.highestFirst") : t("customers.filter.lowestFirst"))
        : t("customers.filter.allValues");
    const isValueDefault = sortBy !== "total_spent";

    return (
        <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Left: chip-ified filter controls */}
            <div className="flex items-center gap-2 flex-wrap">
                <FilterChip
                    icon={ArrowUpDown}
                    label={t("customers.filter.sortBy")}
                    value={sortLabel}
                    isDefault={isSortDefault}
                    onChange={(v) => {
                        const [field, order] = v.split(":");
                        onSortChange(field, order as "asc" | "desc");
                    }}
                >
                    <option value="last_order_date:desc">{t("customers.lastOrder")} ↓</option>
                    <option value="last_order_date:asc">{t("customers.lastOrder")} ↑</option>
                    <option value="trust_score:desc">{t("customers.trust.score")} ↓</option>
                    <option value="trust_score:asc">{t("customers.trust.score")} ↑</option>
                    <option value="total_spent:desc">{t("customers.totalSpent")} ↓</option>
                    <option value="total_spent:asc">{t("customers.totalSpent")} ↑</option>
                    <option value="total_orders:desc">{t("customers.orders")} ↓</option>
                    <option value="total_orders:asc">{t("customers.orders")} ↑</option>
                    <option value="name:asc">{t("customers.table.customer")} ↑</option>
                    <option value="name:desc">{t("customers.table.customer")} ↓</option>
                </FilterChip>

                <FilterChip
                    icon={MapPin}
                    label={t("customers.filter.cityLabel")}
                    value={cityLabel}
                    isDefault={isCityDefault}
                    onChange={(v) => onCityChange(v)}
                >
                    <option value="">{t("customers.filter.allCities")}</option>
                    {CITIES.map((c) => (
                        <option key={c.value} value={c.value}>
                            {t(c.key)}
                        </option>
                    ))}
                </FilterChip>

                <FilterChip
                    icon={Banknote}
                    label={t("customers.filter.totalValueLabel")}
                    value={valueLabel}
                    isDefault={isValueDefault}
                    onChange={(v) => {
                        if (v === "all") return;
                        onSortChange("total_spent", v as "asc" | "desc");
                    }}
                >
                    <option value="all">{t("customers.filter.allValues")}</option>
                    <option value="desc">{t("customers.filter.highestFirst")}</option>
                    <option value="asc">{t("customers.filter.lowestFirst")}</option>
                </FilterChip>
            </div>

            {/* Right: view toggle with sliding thumb */}
            <div className="relative flex bg-background rounded-full p-1 border border-(--card-border) h-9">
                {(["grid", "list"] as const).map((mode) => {
                    const isActive = viewMode === mode;
                    const Icon = mode === "grid" ? LayoutGrid : List;
                    return (
                        <motion.button
                            key={mode}
                            onClick={() => onViewModeChange(mode)}
                            whileTap={{ scale: 0.94 }}
                            className="relative px-3 rounded-full flex items-center justify-center"
                            aria-label={mode}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="view-mode-thumb"
                                    className="absolute inset-0 rounded-full bg-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]"
                                    transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                                />
                            )}
                            <Icon
                                className={`relative w-4 h-4 ${isActive ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
                            />
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
