"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { Product, getStockStatus, supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import {
    Search,
    Package,
    Grid3X3,
    List,
    ChevronDown,
    Plus,
    CheckSquare,
    Square,
    Filter,
    Layers,
    Columns3,
    BarChart3,
    ShoppingCart,
} from "lucide-react";
import { DensityToggle } from "@/components/products/density-toggle";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Import components
import { ProductFormModal, ProductFormData } from "@/components/products/product-form-modal";
import { ProductDetailModal } from "@/components/products/product-detail-modal";
import { LowStockAlert } from "@/components/products/low-stock-alert";
import { TimePeriodFilter, TimePeriod, filterByTimePeriod } from "@/components/products/time-period-filter";
import { AdvancedFilters, FilterValues } from "@/components/products/advanced-filters";
import { ActiveFilterPills } from "@/components/products/active-filter-pills";
import { FilterBottomSheet } from "@/components/products/filter-bottom-sheet";
import { BulkActionsBar } from "@/components/products/bulk-actions-bar";
import { ExportMenu } from "@/components/products/export-menu";
import { AbcTierProvider } from "@/components/products/abc-tier-context";
import { exportToCSV, exportToExcel, printProductReport } from "@/lib/export-utils";
import { QCQuarantineTab } from "@/components/products/qc-quarantine-tab";
import { SuppliesTab } from "@/components/products/supplies-tab";
import { CategoriesTab } from "@/components/products/categories-tab";
import { CategoriesTabV2 } from "@/components/categories/v2/categories-tab-v2";

const CATEGORIES_V2_ENABLED = process.env.NEXT_PUBLIC_CATEGORIES_V2 !== "0";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useAuth } from "@/components/auth/auth-provider";

// Virtualized views
import { VirtualizedProductGrid } from "@/components/products/virtualized-product-grid";
import { VirtualizedProductList } from "@/components/products/virtualized-product-list";

// New view modes
import { CategoryGroupedView } from "@/components/products/views/category-grouped-view";
import { KanbanStockBoard } from "@/components/products/views/kanban-stock-board";
import { MarginHeatmapView } from "@/components/products/views/margin-heatmap-view";

// Analytics
import { ForecastingCards } from "@/components/products/forecasting-cards";

// Store
import { useProductStore } from "@/store/use-product-store";

export default function ProductsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">Loading modules...</p>
                </div>
            </div>
        }>
            <ProductsContent />
        </Suspense>
    );
}

// Memoized IQD formatter cache
const iqdCache = new Map<number, string>();
function formatIQDCached(amount: number): string {
    const cached = iqdCache.get(amount);
    if (cached) return cached;
    const formatted = formatIQD(amount);
    // Keep cache size reasonable
    if (iqdCache.size > 5000) iqdCache.clear();
    iqdCache.set(amount, formatted);
    return formatted;
}

function ProductsContent() {
    const {
        products,
        loading,
        error,
        addProduct,
        updateProduct,
        archiveProduct,
        restoreProduct,
        bulkUpdatePrices,
        bulkArchive,
        bulkRestore,
        bulkDelete,
        addVariant,
        updateVariant,
        deleteVariant,
        getPriceHistory,
        bulkUpdateVisibility,
        deleteProduct,
        reorderProducts,
    } = useProductsCrud();

    const { data: categories } = useCategoriesQuery();
    const categoriesMap = useMemo(() => {
        if (!categories) return new Map<string, string>();
        return new Map(categories.map((c) => [c.id, c.name]));
    }, [categories]);

    // Store state
    const viewMode = useProductStore((s) => s.viewMode);
    const setViewMode = useProductStore((s) => s.setViewMode);
    const sortBy = useProductStore((s) => s.sortBy);
    const setSortBy = useProductStore((s) => s.setSortBy);
    const gridDensity = useProductStore((s) => s.gridDensity);
    const gridGroupByCategory = useProductStore((s) => s.gridGroupByCategory);
    const setGridGroupByCategory = useProductStore((s) => s.setGridGroupByCategory);
    const selectedIds = useProductStore((s) => s.selectedIds);
    const toggleSelection = useProductStore((s) => s.toggleSelection);
    const selectAll = useProductStore((s) => s.selectAll);
    const clearSelection = useProductStore((s) => s.clearSelection);
    const selectRange = useProductStore((s) => s.selectRange);
    const lastSelectedRef = useRef<string | null>(null);

    // Local UI State (not persisted)
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const activeTab = (searchParams?.get("tab") as "products" | "categories" | "quarantine" | "supplies") || "products";
    const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
    const [advancedFilters, setAdvancedFilters] = useState<FilterValues | null>(null);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    const [isFilterStuck, setIsFilterStuck] = useState(false);
    const filterSentinelRef = useRef<HTMLDivElement>(null);
    const urlSyncInitialized = useRef(false);

    useEffect(() => {
        const el = filterSentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => setIsFilterStuck(!entry.isIntersecting),
            { threshold: 0, rootMargin: "0px 0px 0px 0px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [activeTab]);

    // Product IDs for the currently selected tag filter
    const { tenantId } = useAuth();
    const selectedTagId = advancedFilters?.tagId ?? null;
    const { data: tagMemberIds } = useQuery<Set<string>>({
        queryKey: ["product-tag-members", tenantId, selectedTagId],
        queryFn: async () => {
            if (!selectedTagId || !tenantId) return new Set<string>();
            const { data, error } = await supabase
                .from("product_tag_assignments")
                .select("product_id")
                .eq("tenant_id", tenantId)
                .eq("tag_id", selectedTagId);
            if (error) throw error;
            return new Set((data ?? []).map((r: any) => r.product_id as string));
        },
        enabled: !!selectedTagId && !!tenantId,
        staleTime: 60 * 1000,
    });

    // URL → state hydrate (once on mount): ?view=<mode> and ?filters=<base64 json>
    useEffect(() => {
        if (urlSyncInitialized.current || !searchParams) return;
        urlSyncInitialized.current = true;
        const viewParam = searchParams.get("view");
        const validViews = ["grid", "list", "category", "kanban", "heatmap"] as const;
        if (viewParam && (validViews as readonly string[]).includes(viewParam)) {
            setViewMode(viewParam as any);
        }
        const filterParam = searchParams.get("filters");
        if (filterParam) {
            try {
                const decoded = JSON.parse(atob(filterParam));
                if (decoded && typeof decoded === "object") {
                    setAdvancedFilters(decoded as FilterValues);
                }
            } catch {
                // ignore malformed filter param
            }
        }
    }, [searchParams, setViewMode]);

    // state → URL sync (viewMode + advancedFilters)
    useEffect(() => {
        if (!urlSyncInitialized.current) return;
        const currentQuery = searchParams?.toString() ?? "";
        const params = new URLSearchParams(currentQuery);
        if (viewMode && viewMode !== "grid") {
            params.set("view", viewMode);
        } else {
            params.delete("view");
        }
        if (advancedFilters) {
            params.set("filters", btoa(JSON.stringify(advancedFilters)));
        } else {
            params.delete("filters");
        }
        const targetQuery = params.toString();
        if (targetQuery === currentQuery) return;
        router.replace(targetQuery ? `?${targetQuery}` : window.location.pathname, { scroll: false });
    }, [viewMode, advancedFilters, router, searchParams]);

    // Modal State
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [formModalMode, setFormModalMode] = useState<"add" | "edit">("add");
    const [formDefaultIsSupply, setFormDefaultIsSupply] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [priceHistory, setPriceHistory] = useState<any[]>([]);

    // Filter and sort products — memoized with stable deps
    const filteredProducts = useMemo(() => {
        let result = products;

        // Text search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((product) =>
                product.name.toLowerCase().includes(query) ||
                (product.description?.toLowerCase().includes(query)) ||
                (product.sku?.toLowerCase().includes(query))
            );
        }

        // Advanced filters
        if (advancedFilters) {
            if (advancedFilters.priceMin !== null) {
                result = result.filter((p) => p.price >= advancedFilters.priceMin!);
            }
            if (advancedFilters.priceMax !== null) {
                result = result.filter((p) => p.price <= advancedFilters.priceMax!);
            }
            if (advancedFilters.salesMin !== null) {
                result = result.filter((p) => (p.times_sold || 0) >= advancedFilters.salesMin!);
            }
            if (advancedFilters.salesMax !== null) {
                result = result.filter((p) => (p.times_sold || 0) <= advancedFilters.salesMax!);
            }
            if (advancedFilters.stockStatus !== "all") {
                result = result.filter((p) => getStockStatus(p) === advancedFilters.stockStatus);
            }
            if (!advancedFilters.showArchived) {
                result = result.filter((p) => !p.is_archived);
            }
            if (advancedFilters.categoryId) {
                result = result.filter((p) => p.category_id === advancedFilters.categoryId);
            }
            if (advancedFilters.visibility === "visible") {
                result = result.filter((p) => p.is_visible);
            } else if (advancedFilters.visibility === "hidden") {
                result = result.filter((p) => !p.is_visible);
            }
            if (advancedFilters.productType) {
                result = result.filter((p) => (p as any).product_type === advancedFilters.productType);
            }
            if (advancedFilters.hasVariants === "yes") {
                result = result.filter((p) => (p as any).variants && (p as any).variants.length > 0);
            } else if (advancedFilters.hasVariants === "no") {
                result = result.filter((p) => !(p as any).variants || (p as any).variants.length === 0);
            }
            if (advancedFilters.tagId && tagMemberIds) {
                result = result.filter((p) => tagMemberIds.has(p.id));
            }
        } else {
            result = result.filter((p) => !p.is_archived);
        }

        // Hide supplies from the main products view
        result = result.filter((p) => !p.is_supply);

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case "revenue":
                    return (b.total_revenue || 0) - (a.total_revenue || 0);
                case "price":
                    return b.price - a.price;
                case "stock":
                    return b.stock_quantity - a.stock_quantity;
                case "name":
                    return a.name.localeCompare(b.name);
                case "displayOrder":
                    return (a.display_order || 0) - (b.display_order || 0);
                default: // "sales"
                    return (b.times_sold || 0) - (a.times_sold || 0);
            }
        });

        return result;
    }, [products, searchQuery, sortBy, advancedFilters, tagMemberIds]);

    // Calculate stats — separate memo from filtering
    const stats = useMemo(() => {
        const activeProducts = products.filter((p) => !p.is_archived && !p.is_supply);
        const totalProducts = activeProducts.length;
        const totalSold = activeProducts.reduce((sum, p) => sum + (p.times_sold || 0), 0);
        const totalRevenue = activeProducts.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
        const averageOrderValue = totalSold > 0 ? totalRevenue / totalSold : 0;
        const bestSeller = [...activeProducts].sort((a, b) => (b.times_sold || 0) - (a.times_sold || 0))[0] || null;

        return { totalProducts, totalSold, totalRevenue, averageOrderValue, bestSeller };
    }, [products]);

    // Stable callback refs for child components
    const handleAddProduct = useCallback(() => {
        setSelectedProduct(null);
        setFormModalMode("add");
        setFormDefaultIsSupply(false);
        setIsFormModalOpen(true);
    }, []);

    const handleAddSupply = useCallback(() => {
        setSelectedProduct(null);
        setFormModalMode("add");
        setFormDefaultIsSupply(true);
        setIsFormModalOpen(true);
    }, []);

    const handleEditProduct = useCallback((product: Product) => {
        router.push(`/products/${product.id}/edit`);
    }, [router]);

    const handleViewDetails = useCallback(async (product: Product) => {
        setSelectedProduct(product);
        const history = await getPriceHistory(product.id);
        setPriceHistory(history);
        setIsDetailModalOpen(true);
    }, [getPriceHistory]);

    const handleDuplicateProduct = useCallback(async (product: Product) => {
        const newProduct = await addProduct({
            name: `Copy of ${product.name}`,
            sku: product.sku ? `${product.sku}-copy` : undefined,
            description: product.description,
            price: product.price,
            compare_at_price: product.compare_at_price || undefined,
            cost: product.cost,
            stock_quantity: 0,
            low_stock_threshold: product.low_stock_threshold,
            image_url: product.image_url,
            tag_color: product.tag_color,
            is_supply: product.is_supply,
            slug: product.slug ? `${product.slug}-copy` : undefined,
            is_visible: false,
            display_order: product.display_order,
            category_id: product.category_id,
            website_price: product.website_price,
            short_description: product.short_description || undefined,
        });
        if (newProduct) {
            router.push(`/products/${newProduct.id}/edit`);
        }
    }, [addProduct, router]);

    const handleDeleteProduct = useCallback(async (product: Product) => {
        await deleteProduct(product.id);
    }, [deleteProduct]);

    const handleArchive = useCallback(async (id: string) => {
        await archiveProduct(id);
    }, [archiveProduct]);

    const handleRestore = useCallback(async (id: string) => {
        await restoreProduct(id);
    }, [restoreProduct]);

    const handleReorder = useCallback(async (updates: { id: string; display_order: number }[]) => {
        await reorderProducts(updates);
        toast.success(t("products.reorderSuccess"));
    }, [reorderProducts, t]);

    const handleVisibilityToggle = useCallback(async (product: Product) => {
        await updateProduct(product.id, { is_visible: !product.is_visible });
    }, [updateProduct]);

    const handleFormSubmit = useCallback(async (data: ProductFormData) => {
        if (formModalMode === "add") {
            const newProduct = await addProduct({
                name: data.name,
                description: data.description,
                sku: data.sku || undefined,
                price: data.price,
                compare_at_price: data.compare_at_price || undefined,
                cost: data.cost,
                stock_quantity: data.stock_quantity,
                low_stock_threshold: data.low_stock_threshold,
                image_url: data.image_url,
                tag_color: data.tag_color,
                is_supply: data.is_supply,
                slug: data.slug || undefined,
                is_visible: data.is_visible,
                display_order: data.display_order,
                category_id: data.category_id,
                website_price: data.website_price,
                short_description: data.short_description || undefined,
            });

            if (newProduct && data.variants.length > 0) {
                for (const variant of data.variants) {
                    await addVariant(newProduct.id, {
                        name: variant.name,
                        price: variant.price,
                        cost: variant.cost,
                        stock_quantity: variant.stock_quantity,
                        sku: variant.sku,
                    });
                }
            }
        } else if (selectedProduct) {
            await updateProduct(selectedProduct.id, {
                name: data.name,
                description: data.description,
                sku: data.sku || undefined,
                price: data.price,
                compare_at_price: data.compare_at_price || undefined,
                cost: data.cost,
                stock_quantity: data.stock_quantity,
                low_stock_threshold: data.low_stock_threshold,
                image_url: data.image_url,
                tag_color: data.tag_color,
                is_supply: data.is_supply,
                slug: data.slug || undefined,
                is_visible: data.is_visible,
                display_order: data.display_order,
                category_id: data.category_id,
                website_price: data.website_price,
                short_description: data.short_description || undefined,
            });

            for (const variant of data.variants) {
                if (variant.id) {
                    await updateVariant(variant.id, {
                        name: variant.name,
                        price: variant.price,
                        cost: variant.cost,
                        stock_quantity: variant.stock_quantity,
                        sku: variant.sku,
                    });
                } else {
                    await addVariant(selectedProduct.id, {
                        name: variant.name,
                        price: variant.price,
                        cost: variant.cost,
                        stock_quantity: variant.stock_quantity,
                        sku: variant.sku,
                    });
                }
            }
        }
    }, [formModalMode, selectedProduct, addProduct, updateProduct, addVariant, updateVariant]);

    // Shift-click range selection over the currently visible filtered list.
    const handleToggleSelection = useCallback((id: string, event?: React.MouseEvent) => {
        if (event?.shiftKey && lastSelectedRef.current && lastSelectedRef.current !== id) {
            const lastIdx = filteredProducts.findIndex((p) => p.id === lastSelectedRef.current);
            const currIdx = filteredProducts.findIndex((p) => p.id === id);
            if (lastIdx !== -1 && currIdx !== -1) {
                const [from, to] = [Math.min(lastIdx, currIdx), Math.max(lastIdx, currIdx)];
                selectRange(filteredProducts.slice(from, to + 1).map((p) => p.id));
                lastSelectedRef.current = id;
                return;
            }
        }
        toggleSelection(id);
        lastSelectedRef.current = id;
    }, [filteredProducts, selectRange, toggleSelection]);

    // Selection handlers
    const handleSelectAll = useCallback(() => {
        if (selectedIds.size === filteredProducts.length) {
            clearSelection();
        } else {
            selectAll(filteredProducts.map((p) => p.id));
        }
    }, [selectedIds.size, filteredProducts, selectAll, clearSelection]);

    // Bulk action handlers
    const handleBulkUpdatePrice = useCallback(async (newPrice: number) => {
        await bulkUpdatePrices(Array.from(selectedIds), newPrice);
        clearSelection();
    }, [selectedIds, bulkUpdatePrices, clearSelection]);

    const lastArchivedIdsRef = useRef<string[]>([]);

    const handleBulkArchiveUndo = useCallback(async () => {
        if (lastArchivedIdsRef.current.length === 0) return;
        const ids = lastArchivedIdsRef.current;
        lastArchivedIdsRef.current = [];
        await bulkRestore(ids);
        toast.success(t("products.bulk.undone"));
    }, [bulkRestore, t]);

    const handleBulkArchive = useCallback(async () => {
        const ids = Array.from(selectedIds);
        lastArchivedIdsRef.current = ids;
        await bulkArchive(ids);
        clearSelection();
        toast({
            title: t("products.bulk.archiveSuccess").replace("{count}", String(ids.length)),
            variant: "success",
            duration: 8000,
            action: {
                label: t("products.bulk.undo"),
                onClick: () => { void handleBulkArchiveUndo(); },
            },
        });
    }, [selectedIds, bulkArchive, clearSelection, t, handleBulkArchiveUndo]);

    const handleBulkDelete = useCallback(async () => {
        const ids = Array.from(selectedIds);
        await bulkDelete(ids);
        clearSelection();
        toast.success(t("products.bulk.deleteSuccess").replace("{count}", String(ids.length)));
    }, [selectedIds, bulkDelete, clearSelection, t]);

    const handleBulkShow = useCallback(async () => {
        await bulkUpdateVisibility(Array.from(selectedIds), true);
        clearSelection();
    }, [selectedIds, bulkUpdateVisibility, clearSelection]);

    const handleBulkHide = useCallback(async () => {
        await bulkUpdateVisibility(Array.from(selectedIds), false);
        clearSelection();
    }, [selectedIds, bulkUpdateVisibility, clearSelection]);

    const handleBulkExport = useCallback(() => {
        const selectedProducts = products.filter((p) => selectedIds.has(p.id));
        exportToCSV(selectedProducts, "selected-products");
        clearSelection();
    }, [products, selectedIds, clearSelection]);

    // Export handlers
    const handleExportCSV = useCallback(() => {
        exportToCSV(filteredProducts, "products");
    }, [filteredProducts]);

    const handleExportExcel = useCallback(() => {
        exportToExcel(filteredProducts, "products");
    }, [filteredProducts]);

    const handlePrintReport = useCallback(() => {
        printProductReport(filteredProducts);
    }, [filteredProducts]);

    // Keyboard chord: G then {G|L|C|K|H} to switch view mode
    useEffect(() => {
        let pendingG = false;
        let pendingGTimer: ReturnType<typeof setTimeout> | null = null;

        const resetChord = () => {
            pendingG = false;
            if (pendingGTimer) {
                clearTimeout(pendingGTimer);
                pendingGTimer = null;
            }
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;
            const key = e.key.toLowerCase();

            if (pendingG) {
                const chord: Record<string, typeof viewMode> = {
                    g: "grid",
                    l: "list",
                    c: "category",
                    k: "kanban",
                    h: "heatmap",
                };
                const next = chord[key];
                if (next) {
                    e.preventDefault();
                    setViewMode(next);
                }
                resetChord();
                return;
            }

            if (key === "g") {
                pendingG = true;
                pendingGTimer = setTimeout(resetChord, 1000);
            }
        };

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            resetChord();
        };
    }, [setViewMode, viewMode]);

    // Keyboard shortcut: Alt+Arrow to reorder selected product
    useEffect(() => {
        if (sortBy !== "displayOrder" || selectedIds.size !== 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

            e.preventDefault();
            const selectedId = Array.from(selectedIds)[0];
            const currentIndex = filteredProducts.findIndex((p) => p.id === selectedId);
            if (currentIndex === -1) return;

            const newIndex = e.key === "ArrowUp"
                ? Math.max(0, currentIndex - 1)
                : Math.min(filteredProducts.length - 1, currentIndex + 1);

            if (newIndex === currentIndex) return;

            const reordered = [...filteredProducts];
            const [moved] = reordered.splice(currentIndex, 1);
            reordered.splice(newIndex, 0, moved);

            const minIdx = Math.min(currentIndex, newIndex);
            const maxIdx = Math.max(currentIndex, newIndex);
            const updates: { id: string; display_order: number }[] = [];
            for (let i = minIdx; i <= maxIdx; i++) {
                updates.push({ id: reordered[i].id, display_order: i });
            }
            handleReorder(updates);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [sortBy, selectedIds, filteredProducts, handleReorder]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">{t("products.loading")}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="pastel-card pastel-card-pink p-8 text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("products.errorTitle")}</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen p-6 md:p-8">
                <div className="space-y-6">
                    {/* Page Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6 flex-wrap"
                    >
                        <div className="min-w-0 flex-1 space-y-3">
                            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-foreground tracking-tight flex items-center gap-3 flex-wrap">
                                <Package className="w-7 h-7 xl:w-8 xl:h-8 shrink-0" />
                                <span className="truncate">{t("products.title")}</span>
                            </h1>
                            <div className="flex items-center gap-4 flex-wrap">
                                {activeTab === "products" && filteredProducts.length > 0 && (
                                    <button
                                        onClick={handleSelectAll}
                                        className={cn(
                                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 group relative overflow-hidden",
                                            selectedIds.size === filteredProducts.length
                                                ? "border-transparent text-white"
                                                : "border-muted-foreground/30 hover:border-primary/50"
                                        )}
                                        title={
                                            selectedIds.size === filteredProducts.length
                                                ? t("products.selection.deselectAll")
                                                : t("products.selection.selectAll")
                                        }
                                    >
                                        {selectedIds.size === filteredProducts.length && (
                                            <div className="absolute inset-0 bg-gradient-to-br from-primary to-violet-600 opacity-100" />
                                        )}
                                        <CheckSquare className={cn("w-3.5 h-3.5 z-10 transition-transform duration-300", selectedIds.size > 0 ? "scale-100" : "scale-0")} />
                                    </button>
                                )}

                                {/* Count Pill — orders-style glass pill */}
                                <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                    <div className="p-2 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                        <Package className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-foreground dark:text-white leading-none">
                                            {stats.totalProducts}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                            {t("nav.products")}
                                        </span>
                                    </div>
                                </div>

                                {/* Units sold pill */}
                                <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                    <div className="p-2 rounded-full bg-gradient-to-tr from-emerald-400 to-green-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-emerald-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                        <ShoppingCart className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-foreground dark:text-white leading-none">
                                            {stats.totalSold}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                            {t("products.sold")}
                                        </span>
                                    </div>
                                </div>

                                {/* Selection Indicator */}
                                <AnimatePresence>
                                    {activeTab === "products" && selectedIds.size > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8, x: -20 }}
                                            animate={{ opacity: 1, scale: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, x: -20 }}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/25"
                                        >
                                            <span className="text-sm font-bold">{selectedIds.size}</span>
                                            <span className="text-xs font-medium opacity-80">{t("products.selection.selected") ?? "selected"}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap shrink-0">
                            <ExportMenu
                                onExportCSV={handleExportCSV}
                                onExportExcel={handleExportExcel}
                                onPrintReport={handlePrintReport}
                            />
                            <button
                                onClick={handleAddProduct}
                                className="flex items-center gap-2 px-5 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all shadow-lg"
                            >
                                <Plus className="w-5 h-5" />
                                {t("products.addProduct")}
                            </button>
                        </div>
                    </motion.div>

                    {/* Mobile Tabs */}
                    <div className="md:hidden flex bg-[var(--background)] p-1 rounded-2xl border border-[var(--card-border)] w-fit max-w-full overflow-x-auto scrollbar-hide">
                        {(["products", "categories", "quarantine", "supplies"] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => router.push(tab === "products" ? "/products" : `/products?tab=${tab}`)}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl font-medium text-sm transition-all relative flex items-center gap-2 whitespace-nowrap",
                                    activeTab === tab
                                        ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                                        : "text-muted hover:text-foreground hover:bg-[var(--card-bg)]/50"
                                )}
                            >
                                {t(`products.tabs.${tab}`)}
                            </button>
                        ))}
                    </div>

                    {activeTab === "categories" && (CATEGORIES_V2_ENABLED ? <CategoriesTabV2 /> : <CategoriesTab />)}
                    {activeTab === "quarantine" && <QCQuarantineTab />}
                    {activeTab === "supplies" && <SuppliesTab onEdit={handleEditProduct} onAdd={handleAddSupply} />}

                    {activeTab === "products" && (
                        <div className="space-y-6">
                            {/* Low Stock Alert */}
                            <LowStockAlert
                                products={products}
                                onViewProduct={handleViewDetails}
                            />

                            {/* Forecasting Cards */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.15 }}
                            >
                                <ForecastingCards
                                    products={products}
                                    onDrillDown={(target) => {
                                        const base: FilterValues = advancedFilters ?? {
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
                                        if (target === "stockout") {
                                            setAdvancedFilters({ ...base, stockStatus: "out_of_stock" });
                                        } else if (target === "lowStock") {
                                            setAdvancedFilters({ ...base, stockStatus: "low_stock" });
                                        } else if (target === "revenue") {
                                            setSortBy("revenue");
                                        }
                                    }}
                                />
                            </motion.div>

                            {/* Sentinel — flips isFilterStuck when the sticky filter reaches top */}
                            <div ref={filterSentinelRef} aria-hidden className="h-px -mb-6" />

                            {/* Filters & Search Bar — sticky primary toolbar (constant height, no layout shift) */}
                            <div className="sticky top-0 z-50 pt-3 pb-3 bg-background/85 backdrop-blur-md rounded-b-2xl">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className={cn(
                                    "pastel-card px-5 py-3 transition-shadow duration-200",
                                    isFilterStuck ? "shadow-xl" : "shadow-none"
                                )}
                            >
                                <div className="flex flex-col lg:flex-row gap-3">
                                    {/* Search */}
                                    <div className="relative flex-1">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                                        <input
                                            type="text"
                                            placeholder={t("products.searchPlaceholder")}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-12 pr-4 py-2 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        {/* Time Period Filter */}
                                        <TimePeriodFilter value={timePeriod} onChange={setTimePeriod} />

                                        {/* Advanced Filters — desktop dropdown */}
                                        <div className="hidden sm:block">
                                            <AdvancedFilters
                                                onApply={setAdvancedFilters}
                                                onReset={() => setAdvancedFilters(null)}
                                            />
                                        </div>

                                        {/* Advanced Filters — mobile bottom sheet trigger */}
                                        <button
                                            onClick={() => setIsMobileFilterOpen(true)}
                                            className="sm:hidden flex items-center gap-2 px-4 py-2 rounded-xl border bg-[var(--background)] border-[var(--card-border)] text-foreground hover:border-[var(--ink)] transition-all"
                                        >
                                            <Filter className="w-4 h-4" />
                                            <span className="font-medium">{t("products.filters.title")}</span>
                                        </button>

                                        {/* View Toggle */}
                                        <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                                            {([
                                                { mode: "grid" as const, icon: Grid3X3, label: "products.views.grid" },
                                                { mode: "list" as const, icon: List, label: "products.views.list" },
                                                { mode: "category" as const, icon: Layers, label: "products.views.category" },
                                                { mode: "kanban" as const, icon: Columns3, label: "products.views.kanban" },
                                                { mode: "heatmap" as const, icon: BarChart3, label: "products.views.heatmap" },
                                            ]).map(({ mode, icon: Icon, label }) => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setViewMode(mode)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all",
                                                        viewMode === mode
                                                            ? "bg-[var(--ink)] text-white"
                                                            : "text-muted hover:text-foreground"
                                                    )}
                                                    title={t(label)}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                </button>
                                            ))}
                                        </div>

                                        {/* Density + Group-by-category — card grid only */}
                                        {viewMode === "grid" && (
                                            <>
                                                <DensityToggle />
                                                <button
                                                    type="button"
                                                    onClick={() => setGridGroupByCategory(!gridGroupByCategory)}
                                                    aria-pressed={gridGroupByCategory}
                                                    title={t("products.groupByCategory")}
                                                    className={cn(
                                                        "p-2 rounded-xl border transition-all",
                                                        gridGroupByCategory
                                                            ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                                            : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:text-foreground"
                                                    )}
                                                >
                                                    <Layers className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}

                                        {/* Sort Dropdown */}
                                        <div className="relative">
                                            <select
                                                value={sortBy}
                                                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                                className="appearance-none px-4 py-2 pr-10 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all cursor-pointer"
                                            >
                                                <option value="sales">{t("products.bestSelling")}</option>
                                                <option value="revenue">{t("products.highestRevenue")}</option>
                                                <option value="price">{t("products.highestPrice")}</option>
                                                <option value="stock">{t("products.highestStock")}</option>
                                                <option value="displayOrder">{t("products.customOrder")}</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                            </div>

                            {/* Active filter pills — scroll naturally below sticky filter bar */}
                            {advancedFilters && (
                                <div className="-mt-3">
                                    <ActiveFilterPills filters={advancedFilters} onChange={setAdvancedFilters} />
                                </div>
                            )}

                            {/* Products Grid/List — Virtualized */}
                            {filteredProducts.length === 0 ? (
                                <div className="pastel-card p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                        <Package className="h-8 w-8 text-[var(--foreground-subtle)]" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">{t("products.emptyState.title")}</p>
                                    <p className="text-sm text-muted mb-4">
                                        {products.length === 0
                                            ? t("products.emptyState.descNew")
                                            : t("products.emptyState.descFilter")}
                                    </p>
                                    {products.length === 0 && (
                                        <button
                                            onClick={handleAddProduct}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ink)] text-white rounded-lg font-medium hover:opacity-90 transition-all"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {t("products.addProduct")}
                                        </button>
                                    )}
                                </div>
                            ) : viewMode === "grid" ? (
                                <AbcTierProvider products={products}>
                                <VirtualizedProductGrid
                                    products={filteredProducts}
                                    selectedIds={selectedIds}
                                    categoriesMap={categoriesMap}
                                    onToggleSelection={handleToggleSelection}
                                    onViewDetails={handleViewDetails}
                                    onEdit={handleEditProduct}
                                    onArchive={handleArchive}
                                    onRestore={handleRestore}
                                    onDuplicate={handleDuplicateProduct}
                                    onDelete={handleDeleteProduct}
                                    onVisibilityToggle={handleVisibilityToggle}
                                    onReorder={sortBy === "displayOrder" ? handleReorder : undefined}
                                    density={gridDensity}
                                    groupByCategory={gridGroupByCategory}
                                    categories={categories || []}
                                />
                                </AbcTierProvider>
                            ) : viewMode === "list" ? (
                                <AbcTierProvider products={products}>
                                <VirtualizedProductList
                                    products={filteredProducts}
                                    selectedIds={selectedIds}
                                    categoriesMap={categoriesMap}
                                    onToggleSelection={handleToggleSelection}
                                    onViewDetails={handleViewDetails}
                                    onEdit={handleEditProduct}
                                    onArchive={handleArchive}
                                    onRestore={handleRestore}
                                    onDuplicate={handleDuplicateProduct}
                                    onDelete={handleDeleteProduct}
                                    onVisibilityToggle={handleVisibilityToggle}
                                    onReorder={sortBy === "displayOrder" ? handleReorder : undefined}
                                />
                                </AbcTierProvider>
                            ) : viewMode === "category" ? (
                                <AbcTierProvider products={products}>
                                <CategoryGroupedView
                                    products={filteredProducts}
                                    categories={categories || []}
                                    selectedIds={selectedIds}
                                    onToggleSelection={handleToggleSelection}
                                    onViewDetails={handleViewDetails}
                                    onEdit={handleEditProduct}
                                    onArchive={handleArchive}
                                    onRestore={handleRestore}
                                    onDuplicate={handleDuplicateProduct}
                                    onDelete={handleDeleteProduct}
                                    onVisibilityToggle={handleVisibilityToggle}
                                />
                                </AbcTierProvider>
                            ) : viewMode === "kanban" ? (
                                <KanbanStockBoard
                                    products={filteredProducts}
                                    selectedIds={selectedIds}
                                    onToggleSelection={toggleSelection}
                                    onViewDetails={handleViewDetails}
                                    onEdit={handleEditProduct}
                                    onArchive={handleArchive}
                                    onRestore={handleRestore}
                                    onVisibilityToggle={handleVisibilityToggle}
                                />
                            ) : viewMode === "heatmap" ? (
                                <MarginHeatmapView
                                    products={filteredProducts}
                                    onViewDetails={handleViewDetails}
                                />
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <ProductFormModal
                isOpen={isFormModalOpen}
                onClose={() => setIsFormModalOpen(false)}
                onSubmit={handleFormSubmit}
                product={selectedProduct}
                mode={formModalMode}
                defaultIsSupply={formDefaultIsSupply}
            />

            <ProductDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                product={selectedProduct}
                priceHistory={priceHistory}
                onEdit={() => {
                    setIsDetailModalOpen(false);
                    handleEditProduct(selectedProduct!);
                }}
            />

            {/* Bulk Actions Bar */}
            {activeTab === "products" && (
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    totalCount={filteredProducts.length}
                    selectedProductNames={products
                        .filter((p) => selectedIds.has(p.id))
                        .map((p) => p.name)}
                    onUpdatePrice={handleBulkUpdatePrice}
                    onArchive={handleBulkArchive}
                    onExport={handleBulkExport}
                    onShowOnStore={handleBulkShow}
                    onHideFromStore={handleBulkHide}
                    onClearSelection={clearSelection}
                    onUndo={handleBulkArchiveUndo}
                    onDelete={handleBulkDelete}
                />
            )}

            {/* Mobile Filter Bottom Sheet */}
            <FilterBottomSheet
                isOpen={isMobileFilterOpen}
                onClose={() => setIsMobileFilterOpen(false)}
                onApply={setAdvancedFilters}
                onReset={() => setAdvancedFilters(null)}
            />
        </PageTransition>
    );
}
