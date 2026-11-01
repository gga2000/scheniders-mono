"use client";

import { motion } from "framer-motion";
import { Search, LayoutGrid, List, ChevronDown, X, Tag } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface CustomerToolbarProps {
    search: string;
    onSearch: (v: string) => void;
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSort: (sortBy: string, order: "asc" | "desc") => void;
    view: "grid" | "list";
    onView: (v: "grid" | "list") => void;
    tags: { id: string; name: string }[];
    tagId: string;
    onTag: (tagId: string) => void;
}

/**
 * The toolbar is one row of a fixed height, so the table header can stick
 * right under it. Keep the two values in step.
 */
export const TOOLBAR_STICKY_TOP = "top-[68px]";

export function CustomerToolbar({ search, onSearch, sortBy, sortOrder, onSort, tags, tagId, onTag, view, onView }: CustomerToolbarProps) {
    const { t } = useLanguage();

    const sortLabels: Record<string, string> = {
        trust_score: t("customers.sort.trustScore"),
        last_order_date: t("customers.lastOrder"),
        total_spent: t("customers.spentOnItems"),
        total_orders: t("customers.orders"),
        name: t("customers.table.customer", "Name"),
    };
    const currentSort = `${sortBy}:${sortOrder}`;

    return (
        <div className="sm:sticky sm:top-0 z-40 -mx-1 px-1 h-[68px] flex items-center">
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="w-full rounded-2xl border border-(--card-border) bg-(--card-bg)/85 backdrop-blur-md p-2 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.04)]"
            >
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => onSearch(e.target.value)}
                            placeholder={t("customers.search")}
                            aria-label={t("customers.search")}
                            className="w-full h-10 pl-10 pr-10 rounded-xl bg-background border border-(--card-border) text-sm outline-none focus:ring-2 focus:ring-foreground/10 transition-all placeholder:text-muted-foreground"
                        />
                        {search && (
                            <button
                                onClick={() => onSearch("")}
                                aria-label={t("customers.search.clear")}
                                className="absolute right-0 top-0 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-foreground/5 text-muted-foreground"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Right cluster: tag, sort, view toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                        {tags.length > 0 && (
                            <div className="relative h-10 px-3 rounded-xl flex items-center gap-2 text-sm font-semibold bg-(--card-bg) border border-(--card-border) cursor-pointer">
                                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="max-w-28 truncate">
                                    {tags.find((x) => x.id === tagId)?.name ?? t("customers.filter.tagAll", "All tags")}
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                <select
                                    value={tagId}
                                    onChange={(e) => onTag(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label={t("customers.filter.tag", "Filter by tag")}
                                >
                                    <option value="">{t("customers.filter.tagAll", "All tags")}</option>
                                    {tags.map((x) => (
                                        <option key={x.id} value={x.id}>{x.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="relative h-10 px-3 rounded-xl flex items-center gap-2 text-sm font-semibold bg-(--card-bg) border border-(--card-border) cursor-pointer">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t("customers.sort.label")}
                            </span>
                            <span className="whitespace-nowrap">{sortLabels[sortBy] || sortBy} {sortOrder === "asc" ? "↑" : "↓"}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            <select
                                value={currentSort}
                                onChange={(e) => {
                                    const [field, order] = e.target.value.split(":");
                                    onSort(field, order as "asc" | "desc");
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label={t("customers.sort.label")}
                            >
                                <option value="trust_score:desc">{sortLabels.trust_score ?? "trust_score"} ↓</option>
                                <option value="trust_score:asc">{sortLabels.trust_score ?? "trust_score"} ↑</option>
                                <option value="last_order_date:desc">{sortLabels.last_order_date ?? "last_order_date"} ↓</option>
                                <option value="last_order_date:asc">{sortLabels.last_order_date ?? "last_order_date"} ↑</option>
                                <option value="total_spent:desc">{sortLabels.total_spent ?? "total_spent"} ↓</option>
                                <option value="total_spent:asc">{sortLabels.total_spent ?? "total_spent"} ↑</option>
                                <option value="total_orders:desc">{sortLabels.total_orders ?? "total_orders"} ↓</option>
                                <option value="total_orders:asc">{sortLabels.total_orders ?? "total_orders"} ↑</option>
                                <option value="name:desc">{sortLabels.name ?? "name"} ↓</option>
                                <option value="name:asc">{sortLabels.name ?? "name"} ↑</option>
                            </select>
                        </div>

                        <div className="relative flex bg-background rounded-xl p-1 border border-(--card-border) h-10">
                            {(["grid", "list"] as const).map((mode) => {
                                const isActive = view === mode;
                                const Icon = mode === "grid" ? LayoutGrid : List;
                                return (
                                    <button
                                        key={mode}
                                        onClick={() => onView(mode)}
                                        className="relative min-w-10 px-2.5 rounded-lg flex items-center justify-center"
                                        aria-label={mode === "grid" ? t("customers.view.grid") : t("customers.view.list")}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="customer-view-thumb"
                                                className="absolute inset-0 rounded-lg bg-foreground"
                                                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                                            />
                                        )}
                                        <Icon className={`relative w-4 h-4 ${isActive ? "text-background" : "text-muted-foreground"}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
