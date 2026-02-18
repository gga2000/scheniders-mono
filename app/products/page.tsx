"use client";

import { useState, useMemo, useCallback } from "react";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { Product, getStockStatus } from "@/lib/supabase";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Search,
    Package,
    Grid3X3,
    List,
    TrendingUp,
    DollarSign,
    ShoppingCart,
    Award,
    ChevronDown,
    Plus,
    CheckSquare,
    Square,
} from "lucide-react";
import { formatIQD, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Import new components
import { ProductFormModal, ProductFormData } from "@/components/products/product-form-modal";
import { ProductDetailModal } from "@/components/products/product-detail-modal";
import { StockIndicator } from "@/components/products/stock-indicator";
import { QuickActionsMenu } from "@/components/products/quick-actions-menu";
import { LowStockAlert } from "@/components/products/low-stock-alert";
import { TimePeriodFilter, TimePeriod, filterByTimePeriod } from "@/components/products/time-period-filter";
import { AdvancedFilters, FilterValues } from "@/components/products/advanced-filters";
import { BulkActionsBar } from "@/components/products/bulk-actions-bar";
import { ExportMenu } from "@/components/products/export-menu";
import { exportToCSV, exportToExcel, printProductReport } from "@/lib/export-utils";

export default function ProductsPage() {
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
        addVariant,
        updateVariant,
        deleteVariant,
        getPriceHistory,
    } = useProductsCrud();

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [sortBy, setSortBy] = useState<"sales" | "revenue" | "price" | "stock">("sales");
    const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
    const [advancedFilters, setAdvancedFilters] = useState<FilterValues | null>(null);

    // Modal State
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [formModalMode, setFormModalMode] = useState<"add" | "edit">("add");
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [priceHistory, setPriceHistory] = useState<any[]>([]);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showLowStockAlert, setShowLowStockAlert] = useState(true);

    // Filter and sort products
    const filteredProducts = useMemo(() => {
        let result = products;

        // Text search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((product) =>
                product.name.toLowerCase().includes(query) ||
                (product.description?.toLowerCase().includes(query))
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
        } else {
            // Default: hide archived
            result = result.filter((p) => !p.is_archived);
        }

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case "revenue":
                    return (b.total_revenue || 0) - (a.total_revenue || 0);
                case "price":
                    return b.price - a.price;
                case "stock":
                    return b.stock_quantity - a.stock_quantity;
                default:
                    return (b.times_sold || 0) - (a.times_sold || 0);
            }
        });

        return result;
    }, [products, searchQuery, sortBy, advancedFilters]);

    // Calculate stats
    const stats = useMemo(() => {
        const activeProducts = products.filter((p) => !p.is_archived);
        const totalProducts = activeProducts.length;
        const totalSold = activeProducts.reduce((sum, p) => sum + (p.times_sold || 0), 0);
        const totalRevenue = activeProducts.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
        const averageOrderValue = totalSold > 0 ? totalRevenue / totalSold : 0;
        const bestSeller = activeProducts.sort((a, b) => (b.times_sold || 0) - (a.times_sold || 0))[0] || null;

        return { totalProducts, totalSold, totalRevenue, averageOrderValue, bestSeller };
    }, [products]);

    // Handlers
    const handleAddProduct = () => {
        setSelectedProduct(null);
        setFormModalMode("add");
        setIsFormModalOpen(true);
    };

    const handleEditProduct = (product: Product) => {
        setSelectedProduct(product);
        setFormModalMode("edit");
        setIsFormModalOpen(true);
    };

    const handleViewDetails = async (product: Product) => {
        setSelectedProduct(product);
        const history = await getPriceHistory(product.id);
        setPriceHistory(history);
        setIsDetailModalOpen(true);
    };

    const handleFormSubmit = async (data: ProductFormData) => {
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
            });

            // Add variants if any
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
            });

            // Handle variant updates (simplified - in production you'd want more sophisticated handling)
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
    };

    // Selection handlers
    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    // Bulk action handlers
    const handleBulkUpdatePrice = async (newPrice: number) => {
        await bulkUpdatePrices(Array.from(selectedIds), newPrice);
        clearSelection();
    };

    const handleBulkArchive = async () => {
        await bulkArchive(Array.from(selectedIds));
        clearSelection();
    };

    const handleBulkExport = () => {
        const selectedProducts = products.filter((p) => selectedIds.has(p.id));
        exportToCSV(selectedProducts, "selected-products");
        clearSelection();
    };

    // Export handlers
    const handleExportCSV = () => {
        exportToCSV(filteredProducts, "products");
    };

    const handleExportExcel = () => {
        exportToExcel(filteredProducts, "products");
    };

    const handlePrintReport = () => {
        printProductReport(filteredProducts);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">Loading products...</p>
                </div>
            </div>
        );
    }

    const { t } = useLanguage();

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
                        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
                    >
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                <Package className="w-8 h-8" />
                                {t("products.title")}
                            </h1>
                            <p className="text-muted mt-2 text-lg">
                                {stats.totalProducts} products • {stats.totalSold} units sold
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
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
                                Add Product
                            </button>
                        </div>
                    </motion.div>

                    {/* Low Stock Alert */}
                    {showLowStockAlert && (
                        <LowStockAlert
                            products={products}
                            onDismiss={() => setShowLowStockAlert(false)}
                            onViewProduct={handleViewDetails}
                        />
                    )}

                    {/* Stats Cards */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="grid grid-cols-2 md:grid-cols-5 gap-4"
                    >
                        <div className="pastel-card pastel-card-yellow p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-amber-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-amber-900">{stats.totalProducts}</p>
                                    <p className="text-xs text-amber-700">{t("products.title")}</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-green p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <ShoppingCart className="w-5 h-5 text-green-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-green-900">{stats.totalSold}</p>
                                    <p className="text-xs text-green-700">{t("products.unitsSold")}</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-mint p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <DollarSign className="w-5 h-5 text-teal-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-teal-900">{formatIQD(stats.totalRevenue)}</p>
                                    <p className="text-xs text-teal-700">{t("products.totalRevenue")}</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-blue p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-blue-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-900">{formatIQD(stats.averageOrderValue)}</p>
                                    <p className="text-xs text-blue-700">{t("products.avgOrderValue")}</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-pink p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <Award className="w-5 h-5 text-rose-700" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-rose-900 truncate">{stats.bestSeller?.name || "-"}</p>
                                    <p className="text-xs text-rose-700">{t("products.bestSeller")}</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Filters & Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="pastel-card p-6"
                    >
                        <div className="flex flex-col lg:flex-row gap-4">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground-subtle)]" />
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Time Period Filter */}
                                <TimePeriodFilter value={timePeriod} onChange={setTimePeriod} />

                                {/* Advanced Filters */}
                                <AdvancedFilters
                                    onApply={setAdvancedFilters}
                                    onReset={() => setAdvancedFilters(null)}
                                />

                                {/* View Toggle */}
                                <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                                    <button
                                        onClick={() => setViewMode("grid")}
                                        className={cn(
                                            "p-2 rounded-lg transition-all",
                                            viewMode === "grid"
                                                ? "bg-[var(--ink)] text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        <Grid3X3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode("list")}
                                        className={cn(
                                            "p-2 rounded-lg transition-all",
                                            viewMode === "list"
                                                ? "bg-[var(--ink)] text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Sort Dropdown */}
                                <div className="relative">
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                        className="appearance-none px-4 py-3 pr-10 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all cursor-pointer"
                                    >
                                        <option value="sales">Best Selling</option>
                                        <option value="revenue">Highest Revenue</option>
                                        <option value="price">Highest Price</option>
                                        <option value="stock">Highest Stock</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* Bulk Selection Controls */}
                        {filteredProducts.length > 0 && (
                            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--card-border)]">
                                <button
                                    onClick={selectedIds.size === filteredProducts.length ? clearSelection : selectAll}
                                    className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
                                >
                                    {selectedIds.size === filteredProducts.length ? (
                                        <CheckSquare className="w-4 h-4" />
                                    ) : (
                                        <Square className="w-4 h-4" />
                                    )}
                                    {selectedIds.size === filteredProducts.length ? "Deselect All" : "Select All"}
                                </button>
                                {selectedIds.size > 0 && (
                                    <span className="text-sm text-muted">
                                        {selectedIds.size} of {filteredProducts.length} selected
                                    </span>
                                )}
                            </div>
                        )}
                    </motion.div>

                    {/* Products Grid/List */}
                    {filteredProducts.length === 0 ? (
                        <div className="pastel-card p-12 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                <Package className="h-8 w-8 text-[var(--foreground-subtle)]" />
                            </div>
                            <p className="text-lg font-medium text-foreground mb-1">No products found</p>
                            <p className="text-sm text-muted mb-4">
                                {products.length === 0
                                    ? "Add your first product to get started"
                                    : "Try adjusting your search or filters"}
                            </p>
                            {products.length === 0 && (
                                <button
                                    onClick={handleAddProduct}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ink)] text-white rounded-lg font-medium hover:opacity-90 transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Product
                                </button>
                            )}
                        </div>
                    ) : viewMode === "grid" ? (
                        <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {filteredProducts.map((product, index) => (
                                <StaggerItem key={product.id}>
                                    <motion.div
                                        className={cn(
                                            "bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all group relative",
                                            selectedIds.has(product.id) && "ring-2 ring-[var(--foreground)]"
                                        )}
                                    >
                                        {/* Selection Checkbox */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSelection(product.id);
                                            }}
                                            className="absolute top-3 left-3 z-10 p-1 bg-white/80 backdrop-blur-sm rounded-lg hover:bg-white transition-colors"
                                        >
                                            {selectedIds.has(product.id) ? (
                                                <CheckSquare className="w-4 h-4 text-[var(--foreground)]" />
                                            ) : (
                                                <Square className="w-4 h-4 text-muted" />
                                            )}
                                        </button>

                                        {/* Quick Actions */}
                                        <div className="absolute top-3 right-3 z-10">
                                            <QuickActionsMenu
                                                product={product}
                                                onEdit={() => handleEditProduct(product)}
                                                onArchive={() => archiveProduct(product.id)}
                                                onRestore={() => restoreProduct(product.id)}
                                                onViewDetails={() => handleViewDetails(product)}
                                                onViewOrders={() => { }}
                                            />
                                        </div>

                                        {/* Product Image */}
                                        <div
                                            onClick={() => handleViewDetails(product)}
                                            className="aspect-square bg-gradient-to-br from-[var(--background)] to-[var(--card-border)] flex items-center justify-center relative cursor-pointer"
                                        >
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Package className="w-12 h-12 text-muted" />
                                            )}
                                            {index === 0 && (
                                                <div className="absolute bottom-3 right-3 px-2 py-1 bg-[var(--pastel-yellow)] rounded-lg">
                                                    <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                                                        <Award className="w-3 h-3" /> #1
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Info */}
                                        <div className="p-4 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="font-bold text-foreground truncate flex-1">
                                                    {product.name}
                                                </h3>
                                            </div>
                                            <p className="text-lg font-bold text-foreground">
                                                {formatIQD(product.price)}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <StockIndicator
                                                    status={getStockStatus(product)}
                                                    quantity={product.stock_quantity}
                                                    size="sm"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--card-border)]">
                                                <span className="text-muted flex items-center gap-1">
                                                    <ShoppingCart className="w-3 h-3" />
                                                    {product.times_sold || 0} sold
                                                </span>
                                                <span className="text-[var(--pastel-green)] font-semibold flex items-center gap-1">
                                                    <TrendingUp className="w-3 h-3" />
                                                    {formatIQD(product.total_revenue || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </StaggerItem>
                            ))}
                        </StaggerContainer>
                    ) : (
                        <StaggerContainer className="space-y-3">
                            {filteredProducts.map((product, index) => (
                                <StaggerItem key={product.id}>
                                    <motion.div
                                        className={cn(
                                            "bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all",
                                            selectedIds.has(product.id) && "ring-2 ring-[var(--foreground)]"
                                        )}
                                    >
                                        <div className="flex items-center p-4 gap-4">
                                            {/* Selection Checkbox */}
                                            <button
                                                onClick={() => toggleSelection(product.id)}
                                                className="p-1 hover:bg-[var(--background)] rounded-lg transition-colors"
                                            >
                                                {selectedIds.has(product.id) ? (
                                                    <CheckSquare className="w-5 h-5 text-[var(--foreground)]" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-muted" />
                                                )}
                                            </button>

                                            {/* Rank Badge */}
                                            <div
                                                className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold",
                                                    index === 0
                                                        ? "bg-[var(--pastel-yellow)] text-amber-900"
                                                        : index === 1
                                                            ? "bg-[var(--pastel-mint)] text-teal-900"
                                                            : index === 2
                                                                ? "bg-[var(--pastel-pink)] text-rose-900"
                                                                : "bg-[var(--background)] text-muted"
                                                )}
                                            >
                                                #{index + 1}
                                            </div>

                                            {/* Product Image */}
                                            <div
                                                onClick={() => handleViewDetails(product)}
                                                className="w-14 h-14 rounded-xl bg-[var(--background)] flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                                            >
                                                {product.image_url ? (
                                                    <img
                                                        src={product.image_url}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Package className="w-6 h-6 text-muted" />
                                                )}
                                            </div>

                                            {/* Product Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-foreground">{product.name}</h3>
                                                    <StockIndicator
                                                        status={getStockStatus(product)}
                                                        size="sm"
                                                        showLabel={false}
                                                    />
                                                </div>
                                                <p className="text-sm text-muted">
                                                    Stock: {product.stock_quantity} units
                                                </p>
                                            </div>

                                            {/* Stats */}
                                            <div className="hidden md:flex items-center gap-8">
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-foreground">
                                                        {formatIQD(product.price)}
                                                    </p>
                                                    <p className="text-xs text-muted">Price</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-foreground">
                                                        {product.times_sold || 0}
                                                    </p>
                                                    <p className="text-xs text-muted">Sold</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-green-700">
                                                        {formatIQD(product.total_revenue || 0)}
                                                    </p>
                                                    <p className="text-xs text-muted">Revenue</p>
                                                </div>
                                            </div>

                                            {/* Quick Actions */}
                                            <QuickActionsMenu
                                                product={product}
                                                onEdit={() => handleEditProduct(product)}
                                                onArchive={() => archiveProduct(product.id)}
                                                onRestore={() => restoreProduct(product.id)}
                                                onViewDetails={() => handleViewDetails(product)}
                                                onViewOrders={() => { }}
                                            />
                                        </div>
                                    </motion.div>
                                </StaggerItem>
                            ))}
                        </StaggerContainer>
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
            <BulkActionsBar
                selectedCount={selectedIds.size}
                onUpdatePrice={handleBulkUpdatePrice}
                onArchive={handleBulkArchive}
                onExport={handleBulkExport}
                onClearSelection={clearSelection}
            />
        </PageTransition>
    );
}
