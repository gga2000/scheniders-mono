"use client";

import { LayoutGrid, List, ArrowUpDown, MapPin, Banknote } from "lucide-react";
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

    return (
        <div className="bg-(--card-bg) rounded-[3rem] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] border border-(--card-border) mb-8 flex items-center justify-between">
            {/* Left side: labeled dropdowns */}
            <div className="flex items-center gap-6">
                {/* Sort */}
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                    <span>{t("customers.filter.sortBy")}</span>
                    <select
                        value={`${sortBy}:${sortOrder}`}
                        onChange={(e) => {
                            const [field, order] = e.target.value.split(":");
                            onSortChange(field, order as "asc" | "desc");
                        }}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold p-0 cursor-pointer"
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
                    </select>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-gray-200" />

                {/* City */}
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{t("customers.filter.cityLabel")}</span>
                    <select
                        value={city}
                        onChange={(e) => onCityChange(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold p-0 cursor-pointer"
                    >
                        <option value="">{t("customers.filter.allCities")}</option>
                        {CITIES.map((c) => (
                            <option key={c.value} value={c.value}>{t(c.key)}</option>
                        ))}
                    </select>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-gray-200" />

                {/* Value */}
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Banknote className="w-4 h-4 text-muted-foreground" />
                    <span>{t("customers.filter.totalValueLabel")}</span>
                    <select
                        value={sortBy === "total_spent" ? `${sortOrder}` : "all"}
                        onChange={(e) => {
                            if (e.target.value === "all") return;
                            onSortChange("total_spent", e.target.value as "asc" | "desc");
                        }}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold p-0 cursor-pointer"
                    >
                        <option value="all">{t("customers.filter.allValues")}</option>
                        <option value="desc">{t("customers.filter.highestFirst")}</option>
                        <option value="asc">{t("customers.filter.lowestFirst")}</option>
                    </select>
                </div>
            </div>

            {/* Right side: grid/list toggle */}
            <div className="flex bg-background p-1 rounded-[2rem]">
                <button
                    onClick={() => onViewModeChange("grid")}
                    className={
                        viewMode === "grid"
                            ? "p-2 bg-(--card-bg) rounded-xl shadow-sm text-foreground"
                            : "p-2 text-gray-400 hover:text-foreground"
                    }
                >
                    <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                    onClick={() => onViewModeChange("list")}
                    className={
                        viewMode === "list"
                            ? "p-2 bg-(--card-bg) rounded-xl shadow-sm text-foreground"
                            : "p-2 text-gray-400 hover:text-foreground"
                    }
                >
                    <List className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
