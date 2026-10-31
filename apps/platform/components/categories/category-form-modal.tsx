"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Layers, Eye, EyeOff } from "lucide-react";
import type { Category } from "@/types/product";
import { slugify } from "@scheniders/shared";
import { toast } from "@/hooks/use-toast";
import { categoryWriteErrorKey } from "@/lib/product-write-error";
import { useLanguage } from "@/hooks/use-language";

interface CategoryFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CategoryFormData) => Promise<void>;
    category?: Category | null;
    categories: Category[];
    mode: "add" | "edit";
}

export interface CategoryFormData {
    name: string;
    slug: string;
    description: string;
    image_url: string;
    parent_id: string | null;
    display_order: number;
    is_visible: boolean;
}

function getDescendantIds(categoryId: string, allCategories: Category[]): Set<string> {
    const ids = new Set<string>();
    function collect(parentId: string) {
        for (const cat of allCategories) {
            if (cat.parent_id === parentId && !ids.has(cat.id)) {
                ids.add(cat.id);
                collect(cat.id);
            }
        }
    }
    collect(categoryId);
    return ids;
}

export function CategoryFormModal({
    isOpen,
    onClose,
    onSubmit,
    category,
    categories,
    mode,
}: CategoryFormModalProps) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<CategoryFormData>({
        name: "",
        slug: "",
        description: "",
        image_url: "",
        parent_id: null,
        display_order: 0,
        is_visible: true,
    });

    useEffect(() => {
        if (category && mode === "edit") {
            setFormData({
                name: category.name,
                slug: category.slug,
                description: category.description || "",
                image_url: category.image_url || "",
                parent_id: category.parent_id ?? null,
                display_order: category.display_order,
                is_visible: category.is_visible,
            });
        } else {
            setFormData({
                name: "",
                slug: "",
                description: "",
                image_url: "",
                parent_id: null,
                display_order: 0,
                is_visible: true,
            });
        }
    }, [category, mode, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            // Keep the form open with what was typed, and say why it failed.
            toast.error(t(categoryWriteErrorKey(error)));
        } finally {
            setLoading(false);
        }
    };

    // Exclude self + descendants from parent dropdown
    const excludedIds = category
        ? new Set([category.id, ...getDescendantIds(category.id, categories)])
        : new Set<string>();

    const parentOptions = categories.filter((c) => !excludedIds.has(c.id));

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    {/* Header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                                <Layers className="w-5 h-5 text-amber-700" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">
                                {mode === "add" ? t("categories.form.addTitle") : t("categories.form.editTitle")}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                        >
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("categories.form.name")} *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder={t("categories.form.namePlaceholder")}
                                required
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("categories.form.slug")} *
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
                                    placeholder={t("categories.form.slugPlaceholder")}
                                    required
                                    className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (formData.name) setFormData((prev) => ({ ...prev, slug: slugify(formData.name) }));
                                    }}
                                    disabled={!formData.name}
                                    className="px-4 py-3 bg-[var(--pastel-yellow)] text-amber-900 rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {t("categories.form.autoSlug")}
                                </button>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("categories.form.description")}
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                placeholder={t("categories.form.descriptionPlaceholder")}
                                rows={2}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                            />
                        </div>

                        {/* Image URL */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("categories.form.imageUrl")}
                            </label>
                            <input
                                type="url"
                                value={formData.image_url}
                                onChange={(e) => setFormData((prev) => ({ ...prev, image_url: e.target.value }))}
                                placeholder="https://..."
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>

                        {/* Parent Category */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                {t("categories.form.parent")}
                            </label>
                            <select
                                value={formData.parent_id ?? ""}
                                onChange={(e) => setFormData((prev) => ({ ...prev, parent_id: e.target.value || null }))}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            >
                                <option value="">{t("categories.form.parentNone")}</option>
                                {parentOptions.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Display Order & Visibility */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    {t("categories.form.displayOrder")}
                                </label>
                                <input
                                    type="number"
                                    value={formData.display_order}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    {t("categories.form.visibility")}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, is_visible: !prev.is_visible }))}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                                        formData.is_visible
                                            ? "bg-[var(--pastel-mint)] text-teal-700"
                                            : "bg-[var(--background)] text-muted border border-[var(--card-border)]"
                                    }`}
                                >
                                    {formData.is_visible ? (
                                        <><Eye className="w-4 h-4" /> {t("categories.form.visible")}</>
                                    ) : (
                                        <><EyeOff className="w-4 h-4" /> {t("categories.form.hidden")}</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <div className="flex gap-3 pt-4 border-t border-[var(--card-border)]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !formData.name || !formData.slug}
                                className="flex-1 px-6 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        {t("common.saving")}
                                    </>
                                ) : (
                                    <>
                                        {mode === "add" ? <Plus className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                                        {mode === "add" ? t("categories.form.addTitle") : t("categories.form.saveChanges")}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
