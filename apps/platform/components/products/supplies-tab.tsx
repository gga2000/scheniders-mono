import { useProductsCrud } from "@/hooks/use-products-crud";
import { useSupplierLinks } from "@/hooks/use-supplier-links";
import { useQueryClient } from "@tanstack/react-query";
import { productKeys } from "@/hooks/use-products-query";
import { productRepository } from "@/lib/repositories/product-repository";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { productWriteErrorKey } from "@/lib/product-write-error";
import {
    Box,
    Plus,
    Search,
    ArrowUpDown,
    ChevronDown,
    ChevronUp,
    LayoutGrid,
    List as ListIcon,
    Package,
    ShoppingCart,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { LowStockAlert } from "@/components/products/low-stock-alert";
import { SuppliesKpiStrip } from "@/components/products/supplies/supplies-kpi-strip";
import { SupplyCard } from "@/components/products/supplies/supply-card";
import { SupplyListRow } from "@/components/products/supplies/supply-list-row";
import { ReorderDrawer } from "@/components/products/supplies/reorder-drawer";
import { SuppliersGrid } from "@/components/products/supplies/suppliers-grid";
import { SupplierDetailDrawer } from "@/components/products/supplies/supplier-detail-drawer";
import { SupplyDetailDrawer } from "@/components/products/supplies/supply-detail-drawer";
import { ActionsFeed } from "@/components/products/supplies/actions-feed";
import { SuppliesBulkActionsBar } from "@/components/products/supplies/supplies-bulk-actions-bar";
import { useOpenPosBySupply } from "@/hooks/use-open-pos-by-supply";
import { useSupplierPos } from "@/hooks/use-supplier-pos";
import { useTenantSupplyHistory } from "@/hooks/use-tenant-supply-history";
import { aggregateSuppliers } from "@/lib/utils/suppliers-aggregate";
import { Users } from "lucide-react";
import { Product } from "@/lib/supabase";

interface SuppliesTabProps {
    onEdit?: (product: Product) => void;
    onAdd?: () => void;
}

type SortKey =
    | "name_asc"
    | "name_desc"
    | "stock_asc"
    | "stock_desc"
    | "cost_asc"
    | "cost_desc"
    | "updated_desc";

type ViewMode = "grid" | "list";
type Section = "supplies" | "suppliers";

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
    { value: "updated_desc", labelKey: "supplies.sort.updated" },
    { value: "name_asc", labelKey: "supplies.sort.nameAsc" },
    { value: "name_desc", labelKey: "supplies.sort.nameDesc" },
    { value: "stock_asc", labelKey: "supplies.sort.stockAsc" },
    { value: "stock_desc", labelKey: "supplies.sort.stockDesc" },
    { value: "cost_asc", labelKey: "supplies.sort.costAsc" },
    { value: "cost_desc", labelKey: "supplies.sort.costDesc" },
];

const DASHBOARD_COLLAPSE_KEY = "supplies.dashboard.collapsed";
const VIEW_MODE_KEY = "supplies.viewMode";
const SECTION_KEY = "supplies.section";

export function SuppliesTab({ onEdit, onAdd }: SuppliesTabProps) {
    const { products, loading, updateProduct } = useProductsCrud({ withSales: true });
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const { data: categories = [] } = useCategoriesQuery();
    const { data: openPoBySupply } = useOpenPosBySupply();
    const { data: supplierPos = [] } = useSupplierPos();
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [dashboardCollapsed, setDashboardCollapsed] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [reorderOpen, setReorderOpen] = useState(false);
    const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
    const [section, setSection] = useState<Section>("supplies");
    const [selectedSupplierKey, setSelectedSupplierKey] = useState<string | null>(null);
    const [selectedSupplyId, setSelectedSupplyId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try {
            if (localStorage.getItem(DASHBOARD_COLLAPSE_KEY) === "1") setDashboardCollapsed(true);
            const mode = localStorage.getItem(VIEW_MODE_KEY);
            if (mode === "list" || mode === "grid") setViewMode(mode);
            const stored = localStorage.getItem(SECTION_KEY);
            if (stored === "suppliers" || stored === "supplies") setSection(stored);
        } catch {}
    }, []);

    const changeSection = (next: Section) => {
        setSection(next);
        try {
            localStorage.setItem(SECTION_KEY, next);
        } catch {}
    };

    const toggleDashboard = () => {
        setDashboardCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(DASHBOARD_COLLAPSE_KEY, next ? "1" : "0");
            } catch {}
            return next;
        });
    };

    const changeViewMode = (mode: ViewMode) => {
        setViewMode(mode);
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {}
    };

    const { data: supplierLinks, isError: supplierLinksFailed } = useSupplierLinks();
    // Until the links are in, every supply would read as "no supplier" with default lead time.
    const supplierLinksReady = supplierLinks !== undefined && !supplierLinksFailed;
    const supplies = useMemo(
        () =>
            products
                .filter((p) => p.is_supply && !p.is_archived)
                .map((p) => ({ ...p, suppliers: supplierLinks?.get(p.id) ?? [] })),
        [products, supplierLinks]
    );

    const supplyIds = useMemo(() => supplies.map((s) => s.id), [supplies]);
    const { data: historyBySupply } = useTenantSupplyHistory(supplyIds);
    const historyForSelected = useMemo(() => {
        if (!historyBySupply || !selectedSupplyId) return undefined;
        return historyBySupply.get(selectedSupplyId);
    }, [historyBySupply, selectedSupplyId]);

    const categoryNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of categories) map.set(c.id, c.name);
        return map;
    }, [categories]);

    const supplyCategories = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of supplies) {
            if (s.category_id) counts.set(s.category_id, (counts.get(s.category_id) ?? 0) + 1);
        }
        const uncategorizedCount = supplies.filter((s) => !s.category_id).length;
        const list = categories
            .filter((c) => counts.has(c.id))
            .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { list, uncategorizedCount };
    }, [supplies, categories]);

    const filteredSupplies = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let base = supplies;
        if (selectedCategoryId === "__uncategorized__") {
            base = base.filter((s) => !s.category_id);
        } else if (selectedCategoryId) {
            base = base.filter((s) => s.category_id === selectedCategoryId);
        }
        if (q) {
            base = base.filter(
                (item) =>
                    item.name.toLowerCase().includes(q) ||
                    (item.sku || "").toLowerCase().includes(q)
            );
        }

        const sorted = [...base];
        sorted.sort((a, b) => {
            switch (sortKey) {
                case "name_asc":
                    return a.name.localeCompare(b.name);
                case "name_desc":
                    return b.name.localeCompare(a.name);
                case "stock_asc":
                    return (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0);
                case "stock_desc":
                    return (b.stock_quantity ?? 0) - (a.stock_quantity ?? 0);
                case "cost_asc":
                    return (a.cost ?? 0) - (b.cost ?? 0);
                case "cost_desc":
                    return (b.cost ?? 0) - (a.cost ?? 0);
                case "updated_desc":
                default: {
                    const at = new Date(a.updated_at ?? 0).getTime();
                    const bt = new Date(b.updated_at ?? 0).getTime();
                    return bt - at;
                }
            }
        });
        return sorted;
    }, [supplies, searchQuery, sortKey, selectedCategoryId]);

    const toggleSelect = useCallback((supply: Product) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(supply.id)) next.delete(supply.id);
            else next.add(supply.id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    }, []);

    useEffect(() => {
        if (section !== "supplies" && selectedIds.size > 0) {
            setSelectedIds(new Set());
        }
    }, [section, selectedIds.size]);

    const reorderCandidateCount = useMemo(() => {
        let count = 0;
        for (const s of supplies) {
            const stock = (s.stock_quantity ?? 0) + (openPoBySupply?.get(s.id)?.quantity ?? 0);
            const rp = s.reorder_point ?? s.low_stock_threshold ?? 5;
            if (stock <= rp && !snoozedIds.has(s.id)) count++;
        }
        return count;
    }, [supplies, snoozedIds, openPoBySupply]);

    const supplyMeta = useMemo(() => {
        const leadMap = new Map<string, number>();
        const suppliersMap = new Map<string, string[]>();
        for (const s of supplies) {
            const suppliersRaw = (s as unknown as {
                suppliers?: Array<{
                    is_primary?: boolean;
                    lead_time_days?: number | null;
                    supplier_name?: string;
                }>;
            }).suppliers;
            const list = Array.isArray(suppliersRaw) ? suppliersRaw : [];
            const primary = list.find((x) => x?.is_primary) ?? list[0];
            const lt = primary?.lead_time_days;
            if (typeof lt === "number" && lt > 0) leadMap.set(s.id, lt);

            const names = list
                .map((x) => (x?.supplier_name ?? "").trim())
                .filter((x): x is string => !!x);
            if (names.length > 0) suppliersMap.set(s.id, names);
        }
        return { leadTimeBySupplyId: leadMap, supplierNamesBySupplyId: suppliersMap };
    }, [supplies]);
    const { leadTimeBySupplyId, supplierNamesBySupplyId } = supplyMeta;

    const handleSnooze = useCallback((id: string) => {
        setSnoozedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    const handleUnsnooze = useCallback((id: string) => {
        setSnoozedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const handleOpenReorderFor = useCallback((_: Product) => {
        setReorderOpen(true);
    }, []);

    const selectedSupply = useMemo(
        () =>
            selectedSupplyId
                ? supplies.find((s) => s.id === selectedSupplyId) ?? null
                : null,
        [selectedSupplyId, supplies]
    );

    const handleOpenDetailFor = useCallback((p: Product) => {
        setSelectedSupplyId(p.id);
    }, []);

    const handleDetailNavigate = useCallback(
        (dir: "prev" | "next") => {
            if (!selectedSupplyId) return;
            const list = filteredSupplies;
            const idx = list.findIndex((s) => s.id === selectedSupplyId);
            if (idx < 0 || list.length <= 1) return;
            const nextIdx =
                dir === "next"
                    ? (idx + 1) % list.length
                    : (idx - 1 + list.length) % list.length;
            setSelectedSupplyId(list[nextIdx].id);
        },
        [selectedSupplyId, filteredSupplies]
    );

    const aggregatedSuppliers = useMemo(
        () => aggregateSuppliers({ supplies, pos: supplierPos }),
        [supplies, supplierPos]
    );

    // Derived from the live roll-up so a send or receive shows in the open drawer.
    const selectedSupplier = useMemo(
        () => aggregatedSuppliers.find((sp) => sp.key === selectedSupplierKey) ?? null,
        [aggregatedSuppliers, selectedSupplierKey]
    );

    const selectedSupplies = useMemo(
        () => supplies.filter((s) => selectedIds.has(s.id)),
        [supplies, selectedIds]
    );

    const adjustSupplyStock = (id: string, delta: number) =>
        productRepository.adjustStock({ productId: id, delta, reason: "adjusted" });

    const handleAdjustStock = async (product: Product, delta: number) => {
        if (delta === 0) return;
        try {
            const next = await adjustSupplyStock(product.id, delta);
            await queryClient.invalidateQueries({ queryKey: productKeys.lists() });
            toast.success(`${product.name}: ${next - delta} → ${next}`);
        } catch (err) {
            toast.error(t(productWriteErrorKey(err)));
        }
    };

    if (loading) {
        return <div className="py-12 text-center text-muted">{t("supplies.loading")}</div>;
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col gap-3">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Box className="w-6 h-6 text-teal-500" />
                            {t("supplies.title")}
                        </h2>
                        <p className="text-muted text-sm mt-1">
                            {t("supplies.subtitle")}
                        </p>
                    </div>

                    {/* Section segmented toggle */}
                    <div className="inline-flex self-start items-center p-0.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                        <button
                            type="button"
                            onClick={() => changeSection("supplies")}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                section === "supplies"
                                    ? "bg-white text-teal-700 shadow-sm ring-1 ring-[var(--card-border)]"
                                    : "text-muted hover:text-foreground"
                            )}
                            aria-pressed={section === "supplies"}
                        >
                            <Box className="w-3.5 h-3.5" />
                            {t("supplies.section.supplies")}
                            <span className="text-[10px] opacity-70 tabular-nums">
                                {supplies.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => changeSection("suppliers")}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                section === "suppliers"
                                    ? "bg-white text-teal-700 shadow-sm ring-1 ring-[var(--card-border)]"
                                    : "text-muted hover:text-foreground"
                            )}
                            aria-pressed={section === "suppliers"}
                        >
                            <Users className="w-3.5 h-3.5" />
                            {t("supplies.section.suppliers")}
                            <span className="text-[10px] opacity-70 tabular-nums">
                                {aggregatedSuppliers.length}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={section === "suppliers" ? t("supplies.search.suppliers") : t("supplies.search.supplies")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                    </div>

                    {section === "supplies" && (
                        <div className="relative">
                            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as SortKey)}
                                className="appearance-none pl-9 pr-8 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] cursor-pointer"
                                aria-label={t("supplies.sort.label")}
                            >
                                {SORT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {t(o.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* View mode toggle */}
                    {section === "supplies" && (
                    <div className="hidden md:flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-0.5">
                        <button
                            type="button"
                            onClick={() => changeViewMode("grid")}
                            className={cn(
                                "p-1.5 rounded-lg transition-all",
                                viewMode === "grid"
                                    ? "bg-white shadow-sm text-teal-600 ring-1 ring-[var(--card-border)]"
                                    : "text-muted hover:text-foreground"
                            )}
                            title={t("supplies.view.grid")}
                            aria-pressed={viewMode === "grid"}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => changeViewMode("list")}
                            className={cn(
                                "p-1.5 rounded-lg transition-all",
                                viewMode === "list"
                                    ? "bg-white shadow-sm text-teal-600 ring-1 ring-[var(--card-border)]"
                                    : "text-muted hover:text-foreground"
                            )}
                            title={t("supplies.view.list")}
                            aria-pressed={viewMode === "list"}
                        >
                            <ListIcon className="w-4 h-4" />
                        </button>
                    </div>
                    )}

                    {section === "supplies" && (
                    <button
                        onClick={() => setReorderOpen(true)}
                        className={cn(
                            "inline-flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all border",
                            reorderCandidateCount > 0
                                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:text-foreground"
                        )}
                        title={t("supplies.reorder.title")}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        {t("supplies.reorder")}
                        {reorderCandidateCount > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular-nums">
                                {reorderCandidateCount}
                            </span>
                        )}
                    </button>
                    )}

                    {section === "supplies" && onAdd && (
                        <button
                            onClick={onAdd}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-white font-medium text-sm shadow-sm hover:bg-teal-600 active:scale-[0.98] transition-all"
                            title={t("supplies.add.title")}
                        >
                            <Plus className="w-4 h-4" />
                            {t("supplies.add")}
                        </button>
                    )}
                </div>
            </div>

            {section === "supplies" && (
                <>
            {/* Actions feed (intelligence layer) */}
            {supplies.length > 0 && (
                <ActionsFeed
                    supplies={supplies}
                    historyBySupply={historyBySupply ?? new Map()}
                    onOpenSupply={handleOpenDetailFor}
                    onOpenReorder={() => setReorderOpen(true)}
                />
            )}

            {/* Dashboard */}
            {supplies.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wide">
                            <LayoutGrid className="w-3.5 h-3.5" />
                            {t("supplies.overview")}
                        </div>
                        <button
                            onClick={toggleDashboard}
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                        >
                            {dashboardCollapsed ? (
                                <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    {t("supplies.dashboard.expand")}
                                </>
                            ) : (
                                <>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                    {t("supplies.dashboard.collapse")}
                                </>
                            )}
                        </button>
                    </div>

                    {!dashboardCollapsed && (
                        <>
                            <SuppliesKpiStrip supplies={supplies} />
                            <LowStockAlert products={supplies} onViewProduct={onEdit} />
                        </>
                    )}
                </div>
            )}

            {/* Category pills */}
            {supplies.length > 0 && (supplyCategories.list.length > 0 || supplyCategories.uncategorizedCount > 0) && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
                    <button
                        onClick={() => setSelectedCategoryId(null)}
                        className={cn(
                            "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                            selectedCategoryId === null
                                ? "bg-foreground text-background border-foreground"
                                : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:text-foreground hover:border-foreground/30"
                        )}
                    >
                        {t("supplies.category.all")}
                        <span className="text-[10px] opacity-70">{supplies.length}</span>
                    </button>
                    {supplyCategories.list.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCategoryId(c.id)}
                            className={cn(
                                "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                                selectedCategoryId === c.id
                                    ? "bg-teal-500 text-white border-teal-500 shadow-sm"
                                    : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:text-foreground hover:border-teal-300"
                            )}
                        >
                            {c.name}
                            <span className="text-[10px] opacity-70">{c.count}</span>
                        </button>
                    ))}
                    {supplyCategories.uncategorizedCount > 0 && (
                        <button
                            onClick={() => setSelectedCategoryId("__uncategorized__")}
                            className={cn(
                                "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                                selectedCategoryId === "__uncategorized__"
                                    ? "bg-slate-600 text-white border-slate-600"
                                    : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:text-foreground hover:border-slate-400"
                            )}
                        >
                            <Package className="w-3 h-3" />
                            {t("supplies.category.none")}
                            <span className="text-[10px] opacity-70">
                                {supplyCategories.uncategorizedCount}
                            </span>
                        </button>
                    )}
                </div>
            )}

            {/* Results count */}
            {supplies.length > 0 && (
                <p className="text-xs text-muted -mt-1">
                    {searchQuery || selectedCategoryId
                        ? `${filteredSupplies.length} of ${supplies.length} supplies`
                        : `${supplies.length} ${supplies.length === 1 ? "supply" : "supplies"}`}
                </p>
            )}

            {filteredSupplies.length === 0 ? (
                <div className="pastel-card p-12 text-center">
                    <Box className="h-12 w-12 text-muted mx-auto mb-4" />
                    <p className="text-lg font-medium">
                        {searchQuery || selectedCategoryId ? t("supplies.empty.noMatch") : t("supplies.empty.none")}
                    </p>
                    <p className="text-sm text-muted mt-1">
                        {searchQuery || selectedCategoryId
                            ? t("supplies.empty.noMatchHint")
                            : t("supplies.empty.noneHint")}
                    </p>
                    {!searchQuery && !selectedCategoryId && onAdd && (
                        <button
                            onClick={onAdd}
                            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-white font-medium text-sm shadow-sm hover:bg-teal-600 active:scale-[0.98] transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            {t("supplies.addFirst")}
                        </button>
                    )}
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredSupplies.map((supply) => (
                        <SupplyCard
                            key={supply.id}
                            supply={supply}
                            categoryName={supply.category_id ? categoryNameById.get(supply.category_id) : undefined}
                            leadTimeDays={leadTimeBySupplyId.get(supply.id)}
                            supplierNames={supplierNamesBySupplyId.get(supply.id)}
                            openPo={openPoBySupply?.get(supply.id) ?? null}
                            onEdit={onEdit}
                            onAdjustStock={handleAdjustStock}
                            onReorder={handleOpenReorderFor}
                            onMore={handleOpenDetailFor}
                            selected={selectedIds.has(supply.id)}
                            onSelectToggle={toggleSelect}
                        />
                    ))}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-[var(--background)] border-b border-[var(--card-border)] text-[11px] uppercase tracking-wide text-muted font-semibold">
                            <tr>
                                <th className="px-3 py-2 text-left w-10"></th>
                                <th className="px-3 py-2 text-left"></th>
                                <th className="px-3 py-2 text-left">{t("supplies.col.name")}</th>
                                <th className="px-3 py-2 text-left">{t("supplies.col.category")}</th>
                                <th className="px-3 py-2 text-left">{t("supplies.col.stock")}</th>
                                <th className="px-3 py-2 text-right">{t("supplies.col.reorderPoint")}</th>
                                <th className="px-3 py-2 text-left">{t("supplies.col.daysSupply")}</th>
                                <th className="px-3 py-2 text-right">{t("supplies.col.unitCost")}</th>
                                <th className="px-3 py-2 text-right">{t("supplies.col.value")}</th>
                                <th className="px-3 py-2 text-right sticky right-0 bg-[var(--background)]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSupplies.map((supply) => (
                                <SupplyListRow
                                    key={supply.id}
                                    supply={supply}
                                    categoryName={supply.category_id ? categoryNameById.get(supply.category_id) : undefined}
                                    leadTimeDays={leadTimeBySupplyId.get(supply.id)}
                                    supplierNames={supplierNamesBySupplyId.get(supply.id)}
                                    openPo={openPoBySupply?.get(supply.id) ?? null}
                                    onEdit={onEdit}
                                    onAdjustStock={handleAdjustStock}
                                    onReorder={handleOpenReorderFor}
                                    onMore={handleOpenDetailFor}
                                    selected={selectedIds.has(supply.id)}
                                    onSelectToggle={toggleSelect}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
                </>
            )}

            {section === "suppliers" && (
                <div className="space-y-3">
                    {aggregatedSuppliers.length > 0 && (
                        <p className="text-xs text-muted">
                            {searchQuery
                                ? t("supplies.suppliers.matching", { query: searchQuery, count: aggregatedSuppliers.length })
                                : aggregatedSuppliers.length === 1
                                    ? t("supplies.suppliers.countOne")
                                    : t("supplies.suppliers.count", { count: aggregatedSuppliers.length })}
                        </p>
                    )}
                    <SuppliersGrid
                        suppliers={aggregatedSuppliers}
                        searchQuery={searchQuery}
                        onSelect={(sp) => setSelectedSupplierKey(sp.key)}
                    />
                </div>
            )}

            <ReorderDrawer
                open={reorderOpen}
                onClose={() => setReorderOpen(false)}
                supplies={supplies}
                openPoBySupply={openPoBySupply}
                supplierLinksReady={supplierLinksReady}
                snoozedIds={snoozedIds}
                onSnooze={handleSnooze}
                onUnsnooze={handleUnsnooze}
            />

            <SupplierDetailDrawer
                open={selectedSupplier !== null}
                supplier={selectedSupplier}
                onClose={() => setSelectedSupplierKey(null)}
                onSelectSupply={onEdit}
            />

            <SupplyDetailDrawer
                open={selectedSupply !== null}
                supply={selectedSupply}
                openPo={selectedSupply ? openPoBySupply?.get(selectedSupply.id) ?? null : null}
                history={historyForSelected}
                onNavigate={handleDetailNavigate}
                onClose={() => setSelectedSupplyId(null)}
                onEdit={onEdit}
                onAdjustStock={handleAdjustStock}
                onReorder={handleOpenReorderFor}
            />

            {section === "supplies" && (
                <SuppliesBulkActionsBar
                    selected={selectedSupplies}
                    categories={categories}
                    onClear={clearSelection}
                    updateProduct={async (id, patch) => { await updateProduct(id, patch); }}
                    adjustStock={async (id, delta) => {
                        await adjustSupplyStock(id, delta);
                        await queryClient.invalidateQueries({ queryKey: productKeys.lists() });
                    }}
                />
            )}
        </div>
    );
}
