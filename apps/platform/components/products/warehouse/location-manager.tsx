"use client";

import { useState, useMemo, useCallback } from "react";
import {
    Warehouse,
    MapPin,
    LayoutGrid,
    Layers,
    Box,
    Plus,
    Pencil,
    Trash2,
    Check,
    X,
    ChevronRight,
    ChevronDown,
    AlertTriangle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

type LocationType = "warehouse" | "zone" | "aisle" | "shelf" | "bin";

interface StorageLocation {
    id: string;
    tenant_id: string;
    name: string;
    code: string;
    type: LocationType;
    parent_id: string | null;
    description: string | null;
    capacity: number | null;
    created_at: string;
}

interface ProductStorageCount {
    location_id: string;
    quantity: number;
}

const typeIcons: Record<LocationType, React.ElementType> = {
    warehouse: Warehouse,
    zone: MapPin,
    aisle: LayoutGrid,
    shelf: Layers,
    bin: Box,
};

const typeLabels: Record<LocationType, { en: string; ar: string }> = {
    warehouse: { en: "Warehouse", ar: "مستودع" },
    zone: { en: "Zone", ar: "منطقة" },
    aisle: { en: "Aisle", ar: "ممر" },
    shelf: { en: "Shelf", ar: "رف" },
    bin: { en: "Bin", ar: "حاوية" },
};

const typeOptions: LocationType[] = ["warehouse", "zone", "aisle", "shelf", "bin"];

interface TreeNode extends StorageLocation {
    children: TreeNode[];
    productCount: number;
}

function buildTree(locations: StorageLocation[], counts: Record<string, number>): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();

    for (const loc of locations) {
        nodeMap.set(loc.id, {
            ...loc,
            children: [],
            productCount: counts[loc.id] || 0,
        });
    }

    const roots: TreeNode[] = [];
    for (const node of nodeMap.values()) {
        if (node.parent_id && nodeMap.has(node.parent_id)) {
            nodeMap.get(node.parent_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

interface InlineFormData {
    name: string;
    code: string;
    type: LocationType;
    parent_id: string | null;
    capacity: string;
    description: string;
}

const emptyForm: InlineFormData = {
    name: "",
    code: "",
    type: "warehouse",
    parent_id: null,
    capacity: "",
    description: "",
};

export function LocationManager() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<InlineFormData>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<{ name: string; code: string; capacity: string }>({
        name: "",
        code: "",
        capacity: "",
    });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // Fetch locations
    const { data: locations = [], isLoading } = useQuery({
        queryKey: ["storage-locations", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("storage_locations")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("name");
            if (error) throw error;
            return data as StorageLocation[];
        },
        enabled: !!tenantId,
    });

    // Fetch product counts per location
    const { data: productCounts = {} } = useQuery({
        queryKey: ["product-storage-counts", tenantId],
        queryFn: async () => {
            if (!tenantId) return {};
            const { data, error } = await supabase
                .from("product_storage")
                .select("location_id, quantity")
                .eq("tenant_id", tenantId);
            if (error) throw error;

            const counts: Record<string, number> = {};
            for (const row of (data as ProductStorageCount[])) {
                counts[row.location_id] = (counts[row.location_id] || 0) + 1;
            }
            return counts;
        },
        enabled: !!tenantId,
    });

    const tree = useMemo(() => buildTree(locations, productCounts), [locations, productCounts]);

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: InlineFormData) => {
            const { error } = await supabase.from("storage_locations").insert({
                tenant_id: tenantId,
                name: data.name.trim(),
                code: data.code.trim(),
                type: data.type,
                parent_id: data.parent_id || null,
                description: data.description.trim() || null,
                capacity: data.capacity ? parseInt(data.capacity) : null,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["storage-locations", tenantId] });
            setShowAddForm(false);
            setFormData(emptyForm);
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<StorageLocation> }) => {
            const { error } = await supabase
                .from("storage_locations")
                .update(updates)
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["storage-locations", tenantId] });
            setEditingId(null);
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("storage_locations")
                .delete()
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["storage-locations", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["product-storage-counts", tenantId] });
            setDeleteConfirmId(null);
        },
    });

    const toggleNode = useCallback((id: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const startEditing = useCallback((node: TreeNode) => {
        setEditingId(node.id);
        setEditData({
            name: node.name,
            code: node.code,
            capacity: node.capacity?.toString() || "",
        });
    }, []);

    const saveEdit = useCallback(
        (id: string) => {
            updateMutation.mutate({
                id,
                updates: {
                    name: editData.name.trim(),
                    code: editData.code.trim(),
                    capacity: editData.capacity ? parseInt(editData.capacity) : null,
                },
            });
        },
        [editData, updateMutation]
    );

    const handleAddSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (!formData.name.trim() || !formData.code.trim()) return;
            createMutation.mutate(formData);
        },
        [formData, createMutation]
    );

    // Recursive tree node renderer
    const renderNode = (node: TreeNode, level: number) => {
        const Icon = typeIcons[node.type] || Box;
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children.length > 0;
        const isEditing = editingId === node.id;
        const isConfirmingDelete = deleteConfirmId === node.id;
        const hasProducts = node.productCount > 0;

        return (
            <div key={node.id}>
                <div
                    className={cn(
                        "flex items-center gap-2 py-2.5 px-3 rounded-xl hover:bg-[var(--background)] transition-colors group",
                        isEditing && "bg-[var(--background)]"
                    )}
                    style={{ paddingLeft: `${level * 24 + 12}px` }}
                >
                    {/* Expand toggle */}
                    <button
                        type="button"
                        onClick={() => hasChildren && toggleNode(node.id)}
                        className={cn(
                            "w-5 h-5 flex items-center justify-center shrink-0",
                            hasChildren ? "text-muted hover:text-foreground cursor-pointer" : "invisible"
                        )}
                    >
                        {hasChildren &&
                            (isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            ))}
                    </button>

                    {/* Type icon */}
                    <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-muted" />
                    </div>

                    {/* Content */}
                    {isEditing ? (
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                            <input
                                type="text"
                                value={editData.name}
                                onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                                className="flex-1 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                placeholder={t("products.location.name") || "Name"}
                            />
                            <input
                                type="text"
                                value={editData.code}
                                onChange={(e) => setEditData((d) => ({ ...d, code: e.target.value }))}
                                className="w-20 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                placeholder={t("products.location.code") || "Code"}
                            />
                            <input
                                type="number"
                                value={editData.capacity}
                                onChange={(e) => setEditData((d) => ({ ...d, capacity: e.target.value }))}
                                className="w-20 px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                placeholder={t("products.location.Cap.") || "Cap."}
                                min={0}
                            />
                            <button
                                type="button"
                                onClick={() => saveEdit(node.id)}
                                disabled={updateMutation.isPending}
                                className="p-1.5 text-green-600 hover:text-green-800 transition-colors"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="p-1.5 text-muted hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">
                                        {node.name}
                                    </span>
                                    <span className="text-xs text-muted font-mono bg-[var(--card-border)] px-1.5 py-0.5 rounded">
                                        {node.code}
                                    </span>
                                    <span className="text-xs text-muted">
                                        {typeLabels[node.type].en}
                                    </span>
                                </div>
                            </div>

                            {/* Meta */}
                            <div className="flex items-center gap-3 shrink-0">
                                {node.capacity !== null && (
                                    <span className="text-xs text-muted">
                                        {t("products.location.Cap") || "Cap"}: {node.capacity}
                                    </span>
                                )}
                                {node.productCount > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 bg-[var(--pastel-blue)] text-blue-700 rounded-full">
                                        {node.productCount} {t("products.location.products") || "products"}
                                    </span>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={() => startEditing(node)}
                                        className="p-1.5 text-muted hover:text-foreground transition-colors rounded-lg hover:bg-[var(--card-border)]"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>

                                    {isConfirmingDelete ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => deleteMutation.mutate(node.id)}
                                                disabled={deleteMutation.isPending}
                                                className="p-1.5 text-rose-600 hover:text-rose-800 transition-colors"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteConfirmId(null)}
                                                className="p-1.5 text-muted hover:text-foreground transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (hasProducts) return;
                                                setDeleteConfirmId(node.id);
                                            }}
                                            disabled={hasProducts}
                                            className={cn(
                                                "p-1.5 transition-colors rounded-lg hover:bg-[var(--card-border)]",
                                                hasProducts
                                                    ? "text-muted/30 cursor-not-allowed"
                                                    : "text-muted hover:text-rose-600"
                                            )}
                                            title={
                                                hasProducts
                                                    ? "Cannot delete — products assigned"
                                                    : undefined
                                            }
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Border-left connector for children */}
                {hasChildren && isExpanded && (
                    <div
                        className="border-l border-[var(--card-border)]"
                        style={{ marginLeft: `${level * 24 + 30}px` }}
                    >
                        {node.children.map((child) => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Warehouse className="w-4 h-4" />
                    {t("products.location.title") || "Storage Locations"}
                </h2>
                <button
                    type="button"
                    onClick={() => {
                        setShowAddForm(true);
                        setFormData(emptyForm);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.location.addLocation") || "Add Location"}
                </button>
            </div>

            {/* Add form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.form
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                        onSubmit={handleAddSubmit}
                    >
                        <div className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Name */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.name") || "Name"} <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData((d) => ({ ...d, name: e.target.value }))
                                        }
                                        placeholder={t("products.location.e.g. Main Warehouse") || "e.g. Main Warehouse"}
                                        required
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                {/* Code */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.code") || "Code"} <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onChange={(e) =>
                                            setFormData((d) => ({ ...d, code: e.target.value.toUpperCase() }))
                                        }
                                        placeholder={t("products.location.e.g. WH-1") || "e.g. WH-1"}
                                        required
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                {/* Type */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.type") || "Type"}
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) =>
                                            setFormData((d) => ({
                                                ...d,
                                                type: e.target.value as LocationType,
                                            }))
                                        }
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    >
                                        {typeOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {typeLabels[opt].en}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Parent */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.Parent Location") || "Parent Location"}
                                    </label>
                                    <select
                                        value={formData.parent_id || ""}
                                        onChange={(e) =>
                                            setFormData((d) => ({
                                                ...d,
                                                parent_id: e.target.value || null,
                                            }))
                                        }
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    >
                                        <option value="">{t("products.location.None (top-level)") || "None (top-level)"}</option>
                                        {locations.map((loc) => (
                                            <option key={loc.id} value={loc.id}>
                                                {loc.name} ({loc.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Capacity */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.capacity") || "Capacity"}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.capacity}
                                        onChange={(e) =>
                                            setFormData((d) => ({ ...d, capacity: e.target.value }))
                                        }
                                        placeholder={t("products.location.Optional") || "Optional"}
                                        min={0}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("products.location.Description") || "Description"}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData((d) => ({ ...d, description: e.target.value }))
                                        }
                                        placeholder={t("products.location.Optional") || "Optional"}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Form actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                                >
                                    {t("products.location.Cancel") || "Cancel"}
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isPending || !formData.name.trim() || !formData.code.trim()}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors",
                                        (createMutation.isPending || !formData.name.trim() || !formData.code.trim()) &&
                                            "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {createMutation.isPending ? (
                                        <span className="w-4 h-4 border-2 border-teal-700/30 border-t-teal-700 rounded-full animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4" />
                                    )}
                                    {t("products.location.addLocation") || "Add Location"}
                                </button>
                            </div>

                            {createMutation.isError && (
                                <div className="flex items-center gap-2 text-sm text-rose-600">
                                    <AlertTriangle className="w-4 h-4" />
                                    {t("products.location.Failed to create location. Please try again.") || "Failed to create location. Please try again."}
                                </div>
                            )}
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Tree view */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <span className="w-6 h-6 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                </div>
            ) : locations.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Warehouse className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {"No storage locations yet. Add your first warehouse or zone to get started."}
                    </p>
                </div>
            ) : (
                <div className="space-y-0.5">
                    {tree.map((node) => renderNode(node, 0))}
                </div>
            )}

            {deleteMutation.isError && (
                <div className="flex items-center gap-2 text-sm text-rose-600">
                    <AlertTriangle className="w-4 h-4" />
                    {"Failed to delete location. It may have child locations or assigned products."}
                </div>
            )}
        </div>
    );
}
