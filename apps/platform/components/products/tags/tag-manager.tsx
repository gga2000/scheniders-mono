"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    Tag,
    Trash2,
    Check,
    X,
    Merge,
    AlertTriangle,
    Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// =============================================
// TYPES
// =============================================

interface TagManagerProps {}

interface ProductTag {
    id: string;
    tenant_id: string;
    name: string;
    color: string;
    created_at: string;
}

interface TagWithCount extends ProductTag {
    product_count: number;
}

// =============================================
// CONSTANTS
// =============================================

const PRESET_COLORS = [
    "#EF4444",
    "#F97316",
    "#EAB308",
    "#22C55E",
    "#06B6D4",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
];

// =============================================
// COMPONENT
// =============================================

export function TagManager({}: TagManagerProps) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [colorPickerId, setColorPickerId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [mergeSelection, setMergeSelection] = useState<string[]>([]);

    // Fetch all tags with product counts
    const { data: tags = [], isLoading } = useQuery<TagWithCount[]>({
        queryKey: ["product-tags-with-counts", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data: tagsData, error: tagsError } = await supabase
                .from("product_tags")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("name");
            if (tagsError) throw tagsError;

            const tagsList = (tagsData ?? []) as ProductTag[];

            // Fetch assignment counts
            const { data: counts, error: countsError } = await supabase
                .from("product_tag_assignments")
                .select("tag_id")
                .eq("tenant_id", tenantId);
            if (countsError) throw countsError;

            const countMap = new Map<string, number>();
            for (const row of counts ?? []) {
                countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
            }

            return tagsList.map((tag) => ({
                ...tag,
                product_count: countMap.get(tag.id) || 0,
            }));
        },
        enabled: !!tenantId,
    });

    const filteredTags = useMemo(() => {
        if (!searchQuery.trim()) return tags;
        const q = searchQuery.toLowerCase();
        return tags.filter((tag) => tag.name.toLowerCase().includes(q));
    }, [tags, searchQuery]);

    // Rename mutation
    const renameMutation = useMutation({
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            const { error } = await supabase
                .from("product_tags")
                .update({ name })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tags-with-counts", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["product-tags", tenantId] });
            setEditingId(null);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // Change color mutation
    const changeColorMutation = useMutation({
        mutationFn: async ({ id, color }: { id: string; color: string }) => {
            const { error } = await supabase
                .from("product_tags")
                .update({ color })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tags-with-counts", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["product-tags", tenantId] });
            setColorPickerId(null);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            // Delete assignments first
            const { error: assignError } = await supabase
                .from("product_tag_assignments")
                .delete()
                .eq("tag_id", id);
            if (assignError) throw assignError;
            const { error } = await supabase
                .from("product_tags")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tags-with-counts", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["product-tags", tenantId] });
            setDeleteConfirmId(null);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // Merge mutation
    const mergeMutation = useMutation({
        mutationFn: async ({
            survivorId,
            victimId,
        }: {
            survivorId: string;
            victimId: string;
        }) => {
            // Get all assignments for the victim tag
            const { data: victimAssignments, error: fetchError } = await supabase
                .from("product_tag_assignments")
                .select("product_id")
                .eq("tag_id", victimId);
            if (fetchError) throw fetchError;

            // Get existing assignments for survivor to avoid duplicates
            const { data: survivorAssignments, error: survivorFetchError } = await supabase
                .from("product_tag_assignments")
                .select("product_id")
                .eq("tag_id", survivorId);
            if (survivorFetchError) throw survivorFetchError;

            const survivorProductIds = new Set(
                (survivorAssignments ?? []).map((a) => a.product_id)
            );

            // Reassign products that aren't already assigned to survivor
            const toInsert = (victimAssignments ?? [])
                .filter((a) => !survivorProductIds.has(a.product_id))
                .map((a) => ({ product_id: a.product_id, tag_id: survivorId }));

            if (toInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from("product_tag_assignments")
                    .insert(toInsert);
                if (insertError) throw insertError;
            }

            // Delete victim assignments and tag
            await supabase
                .from("product_tag_assignments")
                .delete()
                .eq("tag_id", victimId);
            const { error: deleteError } = await supabase
                .from("product_tags")
                .delete()
                .eq("id", victimId);
            if (deleteError) throw deleteError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-tags-with-counts", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["product-tags", tenantId] });
            setMergeSelection([]);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    const toggleMergeSelection = (id: string) => {
        setMergeSelection((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 2) return [prev[1], id];
            return [...prev, id];
        });
    };

    const handleMerge = () => {
        if (mergeSelection.length === 2) {
            mergeMutation.mutate({
                survivorId: mergeSelection[0],
                victimId: mergeSelection[1],
            });
        }
    };

    const handleRenameSubmit = (id: string) => {
        if (editingName.trim()) {
            renameMutation.mutate({ id, name: editingName.trim() });
        } else {
            setEditingId(null);
        }
    };

    const deleteTarget = tags.find((tag) => tag.id === deleteConfirmId);

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Tag className="w-5 h-5 text-muted" />
                    <h2 className="text-lg font-semibold text-foreground">
                        {t?.("Product Tags") ?? "Product Tags"}
                    </h2>
                    <span className="text-xs text-muted">({tags.length})</span>
                </div>

                {/* Merge bar */}
                <AnimatePresence>
                    {mergeSelection.length === 2 && (
                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-center gap-2"
                        >
                            <span className="text-xs text-muted">
                                {t?.("Merge selected tags") ?? "Merge selected tags"}
                            </span>
                            <button
                                type="button"
                                onClick={handleMerge}
                                disabled={mergeMutation.isPending}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                                    "bg-[var(--pastel-mint)] text-teal-700",
                                    "disabled:opacity-50 transition-colors"
                                )}
                            >
                                <Merge className="w-3.5 h-3.5" />
                                {mergeMutation.isPending
                                    ? (t?.("Merging...") ?? "Merging...")
                                    : (t?.("Merge") ?? "Merge")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setMergeSelection([])}
                                className="p-1 text-muted hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t?.("Search tags...") ?? "Search tags..."}
                    className={cn(
                        "w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)]",
                        "rounded-xl text-foreground placeholder:text-muted",
                        "focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]",
                        "text-sm"
                    )}
                />
            </div>

            {/* Tag list */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-12 rounded-xl bg-[var(--background)] animate-pulse"
                        />
                    ))}
                </div>
            ) : filteredTags.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                    {searchQuery
                        ? (t?.("No tags match your search") ?? "No tags match your search")
                        : (t?.("No tags created yet") ?? "No tags created yet")}
                </div>
            ) : (
                <div className="space-y-1">
                    <AnimatePresence initial={false}>
                        {filteredTags.map((tag) => (
                            <motion.div
                                key={tag.id}
                                layout
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group",
                                    "hover:bg-[var(--background)]",
                                    mergeSelection.includes(tag.id) && "bg-[var(--background)] ring-1 ring-[var(--pastel-yellow)]"
                                )}
                            >
                                {/* Merge checkbox */}
                                <button
                                    type="button"
                                    onClick={() => toggleMergeSelection(tag.id)}
                                    className={cn(
                                        "w-4 h-4 rounded border border-[var(--card-border)] flex items-center justify-center",
                                        "transition-colors shrink-0",
                                        mergeSelection.includes(tag.id)
                                            ? "bg-[var(--pastel-yellow)] border-transparent"
                                            : "opacity-0 group-hover:opacity-100"
                                    )}
                                >
                                    {mergeSelection.includes(tag.id) && (
                                        <Check className="w-3 h-3 text-yellow-800" />
                                    )}
                                </button>

                                {/* Color dot (clickable) */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setColorPickerId(
                                                colorPickerId === tag.id ? null : tag.id
                                            )
                                        }
                                        className="w-4 h-4 rounded-full shrink-0 hover:scale-125 transition-transform"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    {/* Inline color picker */}
                                    <AnimatePresence>
                                        {colorPickerId === tag.id && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className={cn(
                                                    "absolute left-0 top-7 z-50 p-2 flex gap-1.5",
                                                    "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                                    "rounded-lg shadow-lg"
                                                )}
                                            >
                                                {PRESET_COLORS.map((color) => (
                                                    <button
                                                        key={color}
                                                        type="button"
                                                        onClick={() =>
                                                            changeColorMutation.mutate({
                                                                id: tag.id,
                                                                color,
                                                            })
                                                        }
                                                        className={cn(
                                                            "w-5 h-5 rounded-full transition-all flex items-center justify-center",
                                                            tag.color === color
                                                                ? "ring-2 ring-offset-1 ring-offset-[var(--card-bg)]"
                                                                : "hover:scale-110"
                                                        )}
                                                        style={{
                                                            backgroundColor: color,
                                                        }}
                                                    >
                                                        {tag.color === color && (
                                                            <Check className="w-2.5 h-2.5 text-white" />
                                                        )}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Name (inline editable) */}
                                <div className="flex-1 min-w-0">
                                    {editingId === tag.id ? (
                                        <input
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleRenameSubmit(tag.id);
                                                if (e.key === "Escape") setEditingId(null);
                                            }}
                                            onBlur={() => handleRenameSubmit(tag.id)}
                                            autoFocus
                                            className={cn(
                                                "w-full px-2 py-0.5 bg-[var(--background)] border border-[var(--card-border)]",
                                                "rounded-lg text-sm text-foreground",
                                                "focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                            )}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingId(tag.id);
                                                setEditingName(tag.name);
                                            }}
                                            className="text-sm text-foreground hover:underline truncate block text-left"
                                        >
                                            {tag.name}
                                        </button>
                                    )}
                                </div>

                                {/* Product count */}
                                <span className="text-xs text-muted shrink-0 tabular-nums">
                                    {tag.product_count} {t?.("products") ?? "products"}
                                </span>

                                {/* Delete */}
                                <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(tag.id)}
                                    className={cn(
                                        "p-1 text-muted hover:text-red-500 transition-colors shrink-0",
                                        "opacity-0 group-hover:opacity-100"
                                    )}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Delete confirmation modal */}
            <AnimatePresence>
                {deleteConfirmId && deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                        onClick={() => setDeleteConfirmId(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                "rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
                            )}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        {t?.("Delete tag?") ?? "Delete tag?"}
                                    </h3>
                                    <p className="text-xs text-muted mt-0.5">
                                        {deleteTarget.product_count}{" "}
                                        {t?.("products will be untagged") ?? "products will be untagged"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(null)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium",
                                        "bg-[var(--background)] text-foreground",
                                        "hover:bg-[var(--card-border)] transition-colors"
                                    )}
                                >
                                    {t?.("Cancel") ?? "Cancel"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteMutation.mutate(deleteConfirmId)}
                                    disabled={deleteMutation.isPending}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium",
                                        "bg-red-500 text-white",
                                        "hover:bg-red-600 transition-colors",
                                        "disabled:opacity-50"
                                    )}
                                >
                                    {deleteMutation.isPending
                                        ? (t?.("Deleting...") ?? "Deleting...")
                                        : (t?.("Delete") ?? "Delete")}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
