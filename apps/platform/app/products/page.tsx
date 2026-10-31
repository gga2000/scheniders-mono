"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useRecomputeInventoryMutation, usePriceHistoryQuery } from "@/hooks/use-products-query";
import { StockCountDialog } from "@/components/products/stock-count-dialog";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { productWriteErrorKey } from "@/lib/product-write-error";
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
    ChevronLeft,
    Plus,
    RefreshCw,
    ClipboardList,
    CheckSquare,
    Square,
    Filter,
    Layers,
    Columns3,
    BarChart3,
    ShoppingCart,
    DollarSign,
    TrendingUp,
} from "lucide-react";
import { DensityToggle } from "@/components/products/density-toggle";
import { formatIQD, maskIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { RevealToggle } from "@/components/ui/reveal-toggle";

// Import components
import { ProductDetailModal } from "@/components/products/product-detail-modal";
import { LowStockAlert } from "@/components/products/low-stock-alert";
import { AdvancedFilters, FilterValues } from "@/components/products/advanced-filters";
import { ActiveFilterPills } from "@/components/products/active-filter-pills";
import { FilterBottomSheet } from "@/components/products/filter-bottom-sheet";
import { BulkActionsBar } from "@/components/products/bulk-actions-bar";
import { ExportMenu } from "@/components/products/export-menu";
import { AbcTierProvider } from "@/components/products/abc-tier-context";
import { exportToCSV, exportToExcel, printProductReport } from "@/lib/export-utils";
import { PageSkeleton, TableSkeleton } from "@scheniders/ui/skeletons";

// Tabs and views other than the default grid load on first use, so opening
// /products does not parse their code (supplies, QC, categories, attributes,
// grouped/kanban/heatmap views: tens of thousands of lines).
const tabFallback = () => <TableSkeleton rows={6} cols={4} />;
const QCQuarantineTab = dynamic(() => import("@/components/products/qc-quarantine-tab").then((m) => m.QCQuarantineTab), { loading: tabFallback });
const SuppliesTab = dynamic(() => import("@/components/products/supplies-tab").then((m) => m.SuppliesTab), { loading: tabFallback });
const CategoriesTab = dynamic(() => import("@/components/products/categories-tab").then((m) => m.CategoriesTab), { loading: tabFallback });
const AttributesTab = dynamic(() => import("@/components/products/attributes-tab").then((m) => m.AttributesTab), { loading: tabFallback });
const CategoriesTabV2 = dynamic(() => import("@/components/categories/v2/categories-tab-v2").then((m) => m.CategoriesTabV2), { loading: tabFallback });

const CATEGORIES_V2_ENABLED = process.env.NEXT_PUBLIC_CATEGORIES_V2 !== "0";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useAuth } from "@/components/auth/auth-provider";

// Virtualized views
import { VirtualizedProductGrid } from "@/components/products/virtualized-product-grid";
import { VirtualizedProductList } from "@/components/products/virtualized-product-list";

// New view modes
import { applyFillerVisibility, countFiller } from "@/lib/product-filler";
const CategoryGroupedView = dynamic(() => import("@/components/products/views/category-grouped-view").then((m) => m.CategoryGroupedView), { loading: tabFallback });
const KanbanStockBoard = dynamic(() => import("@/components/products/views/kanban-stock-board").then((m) => m.KanbanStockBoard), { loading: tabFallback });
const MarginHeatmapView = dynamic(() => import("@/components/products/views/margin-heatmap-view").then((m) => m.MarginHeatmapView), { loading: tabFallback });

// Analytics
import { ForecastingCards } from "@/components/products/forecasting-cards";

// Store
import { uniqueCopyValue } from "@/lib/unique-copy-value";
import { normalizeArabicText } from "@/lib/order-filter-utils";
import { useProductStore, type ViewMode } from "@/store/use-product-store";

export default function ProductsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[var(--background)]"><PageSkeleton /></div>}>
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
        pending,
        error,
        addProduct,
        updateProduct,
        archiveProduct,
        restoreProduct,
        bulkUpdatePrices,
        bulkArchive,
        bulkRestore,
        bulkDelete,
        bulkUpdateVisibility,
        deleteProduct,
        reorderProducts,
    } = useProductsCrud({ withSales: true });
    const recomputeInventory = useRecomputeInventoryMutation();
    const [isStockCountOpen, setIsStockCountOpen] = useState(false);
    // The database enforces these (RLS + RPC checks); the UI only hides what
    // the role can't do so nobody taps a button that is bound to fail.
    const { can } = usePermission();
    const canEditProducts = can(PERMISSIONS.EDIT_PRODUCTS);
    const canManageProducts = can(PERMISSIONS.MANAGE_PRODUCTS);
    // Members without cost access get no cost on a copy, as in the editor save path.
    const canSeeCost = canManageProducts || can(PERMISSIONS.VIEW_FINANCIALS);
    const { revealed: showFinancials } = useFinancialVisibility();

    const { data: categories } = useCategoriesQuery();
    const categoriesMap = useMemo(() => {
        if (!categories) return new Map<string, string>();
        return new Map(categories.map((c) => [c.id, c.name]));
    }, [categories]);

    // Store state
    const storedViewMode = useProductStore((s) => s.viewMode);
    // The margin heatmap is built from cost, which only admins see.
    const viewMode = storedViewMode === "heatmap" && !canManageProducts ? "grid" : storedViewMode;
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
    const activeTab = (searchParams?.get("tab") as "products" | "categories" | "attributes" | "quarantine" | "supplies") || "products";
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
        const validViews: readonly ViewMode[] = ["grid", "list", "category", "kanban", "heatmap"];
        const requestedView = validViews.find((view) => view === viewParam);
        if (requestedView) setViewMode(requestedView);
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
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const { data: priceHistory = [] } = usePriceHistoryQuery(isDetailModalOpen && selectedProduct ? selectedProduct.id : "");

    // Filter and sort products — memoized with stable deps
    // Filler products are catalogue depth, not shelf stock. They stay out of the
    // main list the way supplies do — but behind a toggle rather than for good,
    // and a search always reaches them so looking one up by name still works.
    const [showFiller, setShowFiller] = useState(false);

    const fillerCount = useMemo(() => countFiller(products), [products]);

    const filteredProducts = useMemo(() => {
        let result = products;

        // Text search
        if (searchQuery) {
            const query = normalizeArabicText(searchQuery);
            const matches = (value: string | null | undefined) => !!value && normalizeArabicText(value).includes(query);
            // Every name a product goes by (same set as the top-bar search):
            // order cards show the short name or the imported alias, and that
            // is what gets typed. Description is left out: long marketing
            // text matched generic words like عطر on every product.
            result = result.filter((product) =>
                matches(product.name) ||
                matches(product.short_name) ||
                matches(product.sku) ||
                matches(product.barcode) ||
                !!product.lightfunnels_aliases?.some(matches)
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
            const { revenueMin, revenueMax } = advancedFilters;
            if (revenueMin !== null) {
                result = result.filter((p) => (p.total_revenue || 0) >= revenueMin);
            }
            if (revenueMax !== null) {
                result = result.filter((p) => (p.total_revenue || 0) <= revenueMax);
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
                result = result.filter((p) => p.product_type === advancedFilters.productType);
            }
            if (advancedFilters.hasVariants === "yes") {
                result = result.filter((p) => !!p.variants?.length);
            } else if (advancedFilters.hasVariants === "no") {
                result = result.filter((p) => !p.variants?.length);
            }
            if (advancedFilters.tagId && tagMemberIds) {
                result = result.filter((p) => tagMemberIds.has(p.id));
            }
        } else {
            result = result.filter((p) => !p.is_archived);
        }

        // Hide supplies from the main products view
        result = result.filter((p) => !p.is_supply);

        // Collapse filler unless asked for — or unless a search is running, in
        // which case hiding a name the user just typed would be a lie.
        result = applyFillerVisibility(result, { showFiller, searching: !!searchQuery });

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
    }, [products, searchQuery, sortBy, advancedFilters, tagMemberIds, showFiller]);

    // A selection never outlives what is on screen: bulk price, archive and
    // delete act on the selected ids, so one hidden by a search or filter
    // would be changed without being seen.
    useEffect(() => {
        if (selectedIds.size === 0) return;
        const visible = new Set(filteredProducts.map((p) => p.id));
        const kept = Array.from(selectedIds).filter((id) => visible.has(id));
        if (kept.length !== selectedIds.size) selectAll(kept);
    }, [filteredProducts, selectedIds, selectAll]);

    // Calculate stats — separate memo from filtering
    const stats = useMemo(() => {
        const activeProducts = products.filter((p) => !p.is_archived && !p.is_supply);
        const totalProducts = activeProducts.length;
        const totalSold = activeProducts.reduce((sum, p) => sum + (p.times_sold || 0), 0);
        const totalRevenue = activeProducts.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
        // Revenue per unit: per-product order counts overlap (one order, several
        // products), so a store-wide per-order average cannot be summed from them.
        const avgUnitPrice = totalSold > 0 ? Math.round(totalRevenue / totalSold) : 0;
        const bestSeller = [...activeProducts].sort((a, b) => (b.times_sold || 0) - (a.times_sold || 0))[0] || null;

        return { totalProducts, totalSold, totalRevenue, avgUnitPrice, bestSeller };
    }, [products]);

    // Stable callback refs for child components
    const handleAddProduct = useCallback(() => {
        router.push("/products/new");
    }, [router]);

    const handleAddSupply = useCallback(() => {
        router.push("/products/new?supply=1");
    }, [router]);

    const handleEditProduct = useCallback((product: Product) => {
        router.push(`/products/${product.id}/edit`);
    }, [router]);

    // Opens at once; the price history loads inside the modal.
    const handleViewDetails = useCallback((product: Product) => {
        setSelectedProduct(product);
        setIsDetailModalOpen(true);
    }, []);

    const reportWriteError = useCallback((err: unknown) => {
        toast.error(t(productWriteErrorKey(err)));
    }, [t]);

    const handleDuplicateProduct = useCallback(async (product: Product) => {
        let newProduct: Product;
        const takenSkus = new Set(products.flatMap((p) => (p.sku ? [p.sku] : [])));
        const takenSlugs = new Set(products.flatMap((p) => (p.slug ? [p.slug] : [])));
        try {
        newProduct = await addProduct({
            name: t("products.ed.copyOf", { name: product.name }),
            sku: product.sku ? uniqueCopyValue(product.sku, takenSkus) : undefined,
            description: product.description,
            price: product.price,
            compare_at_price: product.compare_at_price || undefined,
            ...(canSeeCost && { cost: product.cost }),
            stock_quantity: 0,
            low_stock_threshold: product.low_stock_threshold,
            image_url: product.image_url,
            tag_color: product.tag_color,
            is_supply: product.is_supply,
            slug: product.slug ? uniqueCopyValue(product.slug, takenSlugs) : undefined,
            is_visible: false,
            display_order: product.display_order,
            category_id: product.category_id,
            website_price: product.website_price,
            short_description: product.short_description || undefined,
        });
        } catch (err) {
            reportWriteError(err);
            return;
        }
        router.push(`/products/${newProduct.id}/edit`);
    }, [addProduct, products, router, reportWriteError, t, canSeeCost]);

    const handleDeleteProduct = useCallback(async (product: Product) => {
        try {
            await deleteProduct(product.id);
            toast.success(t("products.deleted"));
        } catch (err) {
            reportWriteError(err);
        }
    }, [deleteProduct, reportWriteError, t]);

    const handleRestore = useCallback(async (id: string) => {
        try {
            await restoreProduct(id);
        } catch (err) {
            reportWriteError(err);
        }
    }, [restoreProduct, reportWriteError]);

    // Archive (card menu or a swipe on mobile) hides the product from the
    // store at once, so it always says so and offers the way back.
    const handleArchive = useCallback(async (id: string) => {
        try {
            await archiveProduct(id);
        } catch (err) {
            reportWriteError(err);
            return;
        }
        toast({
            title: t("products.archived"),
            variant: "success",
            duration: 8000,
            action: {
                label: t("products.bulk.undo"),
                onClick: () => { void handleRestore(id); },
            },
        });
    }, [archiveProduct, reportWriteError, handleRestore, t]);

    const handleReorder = useCallback(async (updates: { id: string; display_order: number }[]) => {
        try {
            await reorderProducts(updates);
            toast.success(t("products.reorderSuccess"));
        } catch (err) {
            reportWriteError(err);
        }
    }, [reorderProducts, reportWriteError, t]);

    const handleVisibilityToggle = useCallback(async (product: Product) => {
        try {
            await updateProduct(product.id, { is_visible: !product.is_visible });
        } catch (err) {
            reportWriteError(err);
        }
    }, [updateProduct, reportWriteError]);

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

    // Bulk action handlers. BulkActionsBar reports success (with its own undo
    // countdown for archive) or the failure, so these only do the work and let
    // a failed write reject.
    const handleBulkUpdatePrice = useCallback(async (newPrice: number) => {
        await bulkUpdatePrices(Array.from(selectedIds), newPrice);
        clearSelection();
    }, [selectedIds, bulkUpdatePrices, clearSelection]);

    // The one bulk action the Undo toast reverses: archive, show or hide.
    const lastUndoableRef = useRef<
        | { kind: "archive"; ids: string[] }
        | { kind: "visibility"; previous: { id: string; was_visible: boolean }[] }
        | null
    >(null);

    const handleBulkArchiveUndo = useCallback(async () => {
        const last = lastUndoableRef.current;
        if (!last) return;
        if (last.kind === "archive") {
            if (last.ids.length > 0) await bulkRestore(last.ids);
        } else {
            // Restore each product's own earlier visibility, not one blanket value.
            const wasVisible = last.previous.filter((p) => p.was_visible).map((p) => p.id);
            const wasHidden = last.previous.filter((p) => !p.was_visible).map((p) => p.id);
            if (wasVisible.length > 0) await bulkUpdateVisibility(wasVisible, true);
            if (wasHidden.length > 0) await bulkUpdateVisibility(wasHidden, false);
        }
        lastUndoableRef.current = null;
    }, [bulkRestore, bulkUpdateVisibility]);

    const handleBulkArchive = useCallback(async () => {
        const ids = Array.from(selectedIds);
        await bulkArchive(ids);
        lastUndoableRef.current = { kind: "archive", ids };
        clearSelection();
    }, [selectedIds, bulkArchive, clearSelection]);

    const handleBulkDelete = useCallback(async () => {
        await bulkDelete(Array.from(selectedIds));
        clearSelection();
    }, [selectedIds, bulkDelete, clearSelection]);

    const handleBulkShow = useCallback(async () => {
        const ids = Array.from(selectedIds);
        const previous = products
            .filter((p) => selectedIds.has(p.id))
            .map((p) => ({ id: p.id, was_visible: p.is_visible !== false }));
        await bulkUpdateVisibility(ids, true);
        lastUndoableRef.current = { kind: "visibility", previous };
        clearSelection();
    }, [selectedIds, products, bulkUpdateVisibility, clearSelection]);

    const handleBulkHide = useCallback(async () => {
        const ids = Array.from(selectedIds);
        const previous = products
            .filter((p) => selectedIds.has(p.id))
            .map((p) => ({ id: p.id, was_visible: p.is_visible !== false }));
        await bulkUpdateVisibility(ids, false);
        lastUndoableRef.current = { kind: "visibility", previous };
        clearSelection();
    }, [selectedIds, products, bulkUpdateVisibility, clearSelection]);

    const handleBulkExport = useCallback(() => {
        const selectedProducts = products.filter((p) => selectedIds.has(p.id));
        exportToCSV(selectedProducts, "selected-products", canSeeCost);
        clearSelection();
    }, [products, selectedIds, clearSelection, canSeeCost]);

    // Export handlers
    const handleExportCSV = useCallback(() => {
        exportToCSV(filteredProducts, "products", canSeeCost);
    }, [filteredProducts, canSeeCost]);

    const handleExportExcel = useCallback(() => {
        exportToExcel(filteredProducts, "products", canSeeCost);
    }, [filteredProducts, canSeeCost]);

    const handlePrintReport = useCallback(() => {
        printProductReport(filteredProducts, canSeeCost);
    }, [filteredProducts, canSeeCost]);

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

    if (loading || (pending && !error)) {
        return (
            <div className="min-h-screen bg-[var(--background)]" aria-busy="true" aria-label={t("products.loading")}>
                <PageSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="pastel-card pastel-card-pink p-8 text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("products.errorTitle")}</h2>
                    <p className="text-rose-700 mb-4">{t("products.editor.loadFailedHint")}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        {t("products.editor.retry")}
                    </button>
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

                                {/* Total revenue pill (masked via RevealToggle) */}
                                <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                    <div className="p-2 rounded-full bg-gradient-to-tr from-teal-400 to-cyan-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-teal-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                        <DollarSign className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-foreground dark:text-white leading-none">
                                            {maskIQD(stats.totalRevenue, showFinancials)}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                            {t("products.totalRevenue")}
                                        </span>
                                        <RevealToggle className="text-muted-foreground hover:text-foreground" />
                                    </div>
                                </div>

                                {/* Avg price per unit sold (masked via RevealToggle) */}
                                <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                    <div className="p-2 rounded-full bg-gradient-to-tr from-sky-400 to-blue-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-sky-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-foreground dark:text-white leading-none">
                                            {maskIQD(stats.avgUnitPrice, showFinancials)}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                            {t("products.avgUnitPrice")}
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
                                            <span className="text-xs font-medium opacity-80">{t("products.selection.selected")}</span>
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
                            {canManageProducts && (
                            <button
                                onClick={() => recomputeInventory.mutate(undefined, {
                                    onSuccess: () => toast.success(t("products.tools.recalculateDone")),
                                    onError: reportWriteError,
                                })}
                                disabled={recomputeInventory.isPending}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl font-medium border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all",
                                    recomputeInventory.isPending && "opacity-50 cursor-not-allowed"
                                )}
                                title={t("products.tools.recalculateHint")}
                            >
                                <RefreshCw className={cn("w-4 h-4", recomputeInventory.isPending && "animate-spin")} />
                                {t("products.tools.recalculate")}
                            </button>
                            )}
                            {canEditProducts && (
                            <button
                                onClick={() => setIsStockCountOpen(true)}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all"
                                title={t("products.count.description")}
                            >
                                <ClipboardList className="w-4 h-4" />
                                {t("products.tools.count")}
                            </button>
                            )}
                            {canEditProducts && (
                            <button
                                onClick={handleAddProduct}
                                className="flex items-center gap-2 px-5 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all shadow-lg"
                            >
                                <Plus className="w-5 h-5" />
                                {t("products.addProduct")}
                            </button>
                            )}
                        </div>
                    </motion.div>

                    {/* Mobile Tabs */}
                    <div className="md:hidden flex bg-[var(--background)] p-1 rounded-2xl border border-[var(--card-border)] w-fit max-w-full overflow-x-auto scrollbar-hide">
                        {(["products", "categories", "attributes", "quarantine", "supplies"] as const).map((tab) => (
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
                    {activeTab === "attributes" && <AttributesTab />}
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
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden />
                                        <input
                                            type="text"
                                            placeholder={t("products.searchPlaceholder")}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-12 pr-4 py-2 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
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
                                            ]).filter(({ mode }) => mode !== "heatmap" || canManageProducts).map(({ mode, icon: Icon, label }) => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setViewMode(mode)}
                                                    className={cn(
                                                        "relative p-2 rounded-lg transition-all before:absolute before:-inset-1.5 before:content-['']",
                                                        viewMode === mode
                                                            ? "bg-[var(--ink)] text-white"
                                                            : "text-muted hover:text-foreground"
                                                    )}
                                                    title={t(label)}
                                                    aria-label={t(label)}
                                                    aria-pressed={viewMode === mode}
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
                                                        "relative p-2 rounded-xl border transition-all before:absolute before:-inset-1.5 before:content-['']",
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

                            {/* Filler group — one control for every view mode */}
                            {fillerCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowFiller(!showFiller)}
                                    disabled={!!searchQuery}
                                    aria-expanded={showFiller || !!searchQuery}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors text-right",
                                        "bg-[var(--background)] border-[var(--card-border)]",
                                        searchQuery ? "opacity-60 cursor-default" : "hover:bg-[var(--card-bg)]"
                                    )}
                                >
                                    {showFiller || searchQuery
                                        ? <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                                        : <ChevronLeft className="w-4 h-4 text-muted shrink-0" />}
                                    <Layers className="w-4 h-4 text-muted shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-foreground truncate">
                                            {t("products.filler.group")} ({fillerCount})
                                        </span>
                                        <span className="block text-[11px] text-muted truncate">
                                            {searchQuery ? t("products.filler.shownBySearch") : t("products.filler.hint")}
                                        </span>
                                    </span>
                                    {!searchQuery && (
                                        <span className="text-xs font-semibold text-muted shrink-0">
                                            {showFiller ? t("products.filler.hide") : t("products.filler.show")}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Products Grid/List — Virtualized */}
                            {filteredProducts.length === 0 ? (
                                <div className="pastel-card p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                        <Package className="h-8 w-8 text-muted" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">{t("products.emptyState.title")}</p>
                                    <p className="text-sm text-muted mb-4">
                                        {products.length === 0
                                            ? t("products.emptyState.descNew")
                                            : t("products.emptyState.descFilter")}
                                    </p>
                                    {products.length === 0 && canEditProducts && (
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
                                    onDelete={canManageProducts ? handleDeleteProduct : undefined}
                                    onVisibilityToggle={handleVisibilityToggle}
                                    onReorder={sortBy === "displayOrder" && canEditProducts ? handleReorder : undefined}
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
                                    onDelete={canManageProducts ? handleDeleteProduct : undefined}
                                    onVisibilityToggle={handleVisibilityToggle}
                                    onReorder={sortBy === "displayOrder" && canEditProducts ? handleReorder : undefined}
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
                                    onDelete={canManageProducts ? handleDeleteProduct : undefined}
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

            <StockCountDialog
                open={isStockCountOpen}
                onOpenChange={setIsStockCountOpen}
                products={products}
            />

            {/* Bulk Actions Bar */}
            {activeTab === "products" && canEditProducts && (
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    totalCount={filteredProducts.length}
                    selectedProductNames={products
                        .filter((p) => selectedIds.has(p.id))
                        .map((p) => p.name)}
                    onUpdatePrice={canManageProducts ? handleBulkUpdatePrice : undefined}
                    onArchive={handleBulkArchive}
                    onExport={handleBulkExport}
                    onShowOnStore={handleBulkShow}
                    onHideFromStore={handleBulkHide}
                    onClearSelection={clearSelection}
                    onUndo={handleBulkArchiveUndo}
                    onDelete={canManageProducts ? handleBulkDelete : undefined}
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
