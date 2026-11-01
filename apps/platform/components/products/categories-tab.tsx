"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Layers,
    Plus,
    Search,
    Eye,
    EyeOff,
    Pencil,
    Trash2,
    ChevronRight,
    Package,
} from "lucide-react";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { CategoryFormModal, CategoryFormData } from "@/components/categories/category-form-modal";
import {
    useCategoriesQuery,
    useAddCategoryMutation,
    useUpdateCategoryMutation,
    useDeleteCategoryMutation,
} from "@/hooks/use-categories-query";
import { useProductsCrud } from "@/hooks/use-products-crud";
import type { Category, CategoryScope } from "@/types/product";
import { CategoryScopeControl } from "@/components/products/category-scope-control";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { productWriteErrorKey } from "@/lib/product-write-error";

export function CategoriesTab() {
    const { data: categories = [], isLoading } = useCategoriesQuery();
    const { products } = useProductsCrud();
    const addMutation = useAddCategoryMutation();
    const updateMutation = useUpdateCategoryMutation();
    const deleteMutation = useDeleteCategoryMutation();
    const { t } = useLanguage();
    const { can } = usePermission();
    const canDeleteCategories = can(PERMISSIONS.MANAGE_PRODUCTS);

    const [searchQuery, setSearchQuery] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"add" | "edit">("add");
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Count products per category
    const productCountMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of products) {
            if (p.category_id) {
                map.set(p.category_id, (map.get(p.category_id) || 0) + 1);
            }
        }
        return map;
    }, [products]);

    // Build tree structure
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        const q = searchQuery.toLowerCase();
        return categories.filter(
            (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
        );
    }, [categories, searchQuery]);

    const topLevel = useMemo(
        () => filteredCategories.filter((c) => !c.parent_id),
        [filteredCategories]
    );

    const childrenOf = (parentId: string) =>
        filteredCategories.filter((c) => c.parent_id === parentId);

    const handleAdd = () => {
        setSelectedCategory(null);
        setModalMode("add");
        setIsModalOpen(true);
    };

    const handleEdit = (cat: Category) => {
        setSelectedCategory(cat);
        setModalMode("edit");
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: CategoryFormData) => {
        if (modalMode === "add") {
            await addMutation.mutateAsync(data);
        } else if (selectedCategory) {
            await updateMutation.mutateAsync({ id: selectedCategory.id, data });
        }
    };

    // Scope is a single-field write, so it saves on click rather than making the
    // merchant open the edit modal to change one setting.
    const handleScopeChange = async (id: string, scope: CategoryScope) => {
        await updateMutation.mutateAsync({ id, data: { scope } });
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
        } catch (err) {
            toast.error(t(productWriteErrorKey(err)));
        }
        setDeleteConfirmId(null);
    };

    const totalProducts = products.length;
    const categorizedCount = products.filter((p) => p.category_id).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                        <Layers className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">{t("products.cats.title")}</h2>
                        <p className="text-sm text-muted">
                            {t("products.cats.summary", { n: categories.length, done: categorizedCount, total: totalProducts })}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.cats.add")}
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("products.cats.searchPh")}
                    className="w-full pl-12 pr-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                />
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-3 border-[var(--pastel-yellow)] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-yellow)] flex items-center justify-center mb-4">
                        <Layers className="w-8 h-8 text-amber-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t("products.cats.none")}</h3>
                    <p className="text-muted text-sm mb-6 max-w-sm">
                        {t("products.cats.noneHint")}
                    </p>
                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-2 px-5 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        {t("products.cats.createFirst")}
                    </button>
                </div>
            ) : filteredCategories.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    No categories match &ldquo;{searchQuery}&rdquo;
                </div>
            ) : (
                <StaggerContainer>
                    <div className="space-y-3">
                        {topLevel.map((cat) => (
                            <CategoryRow
                                key={cat.id}
                                category={cat}
                                children={childrenOf(cat.id)}
                                childrenOf={childrenOf}
                                productCount={productCountMap.get(cat.id) || 0}
                                productCountMap={productCountMap}
                                onEdit={handleEdit}
                                onDelete={canDeleteCategories ? (id) => setDeleteConfirmId(id) : undefined}
                                deleteConfirmId={deleteConfirmId}
                                onConfirmDelete={handleDelete}
                                onCancelDelete={() => setDeleteConfirmId(null)}
                                onScopeChange={handleScopeChange}
                                depth={0}
                            />
                        ))}
                    </div>
                </StaggerContainer>
            )}

            <CategoryFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                category={selectedCategory}
                categories={categories}
                mode={modalMode}
            />
        </div>
    );
}

interface CategoryRowProps {
    category: Category;
    children: Category[];
    childrenOf: (parentId: string) => Category[];
    productCount: number;
    productCountMap: Map<string, number>;
    onEdit: (cat: Category) => void;
    /** Absent when the member may not delete categories (products.manage). */
    onDelete?: (id: string) => void;
    deleteConfirmId: string | null;
    onConfirmDelete: (id: string) => void;
    onCancelDelete: () => void;
    onScopeChange: (id: string, scope: CategoryScope) => void;
    depth: number;
}

function CategoryRow({
    category,
    children,
    childrenOf,
    productCount,
    productCountMap,
    onEdit,
    onDelete,
    deleteConfirmId,
    onConfirmDelete,
    onCancelDelete,
    onScopeChange,
    depth,
}: CategoryRowProps) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = children.length > 0;
    const isConfirming = deleteConfirmId === category.id;

    return (
        <StaggerItem>
            <div style={{ marginLeft: depth * 24 }}>
                <motion.div
                    layout
                    className={cn(
                        "group flex items-center gap-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl transition-all hover:border-[var(--pastel-yellow)]",
                        isConfirming && "border-rose-500/50"
                    )}
                >
                    {/* Expand toggle */}
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className={cn(
                            "p-1 rounded-lg transition-all",
                            hasChildren ? "hover:bg-[var(--background)] text-muted" : "invisible"
                        )}
                    >
                        <ChevronRight
                            className={cn(
                                "w-4 h-4 transition-transform",
                                expanded && "rotate-90"
                            )}
                        />
                    </button>

                    {/* Image or icon */}
                    {category.image_url ? (
                        <img
                            src={category.image_url}
                            alt={category.name}
                            className="w-10 h-10 rounded-xl object-cover border border-[var(--card-border)]"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center border border-[var(--card-border)]">
                            <Layers className="w-5 h-5 text-muted" />
                        </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{category.name}</span>
                            <span className="text-xs text-muted">/{category.slug}</span>
                        </div>
                        {category.description && (
                            <p className="text-xs text-muted truncate mt-0.5">{category.description}</p>
                        )}
                    </div>

                    {/* Product count badge */}
                    <div className="flex items-center gap-1 px-2.5 py-1 bg-[var(--background)] rounded-lg text-xs text-muted">
                        <Package className="w-3 h-3" />
                        {productCount}
                    </div>

                    {/* Order badge */}
                    <div className="px-2.5 py-1 bg-[var(--background)] rounded-lg text-xs text-muted">
                        #{category.display_order}
                    </div>

                    {/* Visibility */}
                    <div
                        className={cn(
                            "p-1.5 rounded-lg",
                            category.is_visible
                                ? "bg-[var(--pastel-mint)] text-teal-700"
                                : "bg-[var(--background)] text-muted"
                        )}
                    >
                        {category.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </div>

                    {/* Who the category is for — staff, customers, or both */}
                    <CategoryScopeControl
                        value={category.scope ?? "both"}
                        onChange={(next) => onScopeChange(category.id, next)}
                    />

                    {/* Actions */}
                    {isConfirming ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onConfirmDelete(category.id)}
                                className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-medium hover:bg-rose-600 transition-colors"
                            >
                                Delete
                            </button>
                            <button
                                onClick={onCancelDelete}
                                className="px-3 py-1.5 bg-[var(--background)] text-foreground rounded-lg text-xs font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => onEdit(category)}
                                className="p-2 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                            {onDelete && (
                                <button
                                    onClick={() => onDelete(category.id)}
                                    className="p-2 rounded-lg hover:bg-rose-50 text-muted hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )}
                </motion.div>

                {/* Children */}
                {hasChildren && expanded && (
                    <div className="mt-2 space-y-2">
                        {children.map((child) => (
                            <CategoryRow
                                key={child.id}
                                category={child}
                                children={childrenOf(child.id)}
                                childrenOf={childrenOf}
                                productCount={productCountMap.get(child.id) || 0}
                                productCountMap={productCountMap}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                deleteConfirmId={deleteConfirmId}
                                onConfirmDelete={onConfirmDelete}
                                onCancelDelete={onCancelDelete}
                                onScopeChange={onScopeChange}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        </StaggerItem>
    );
}
