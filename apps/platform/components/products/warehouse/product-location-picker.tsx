"use client";

import { useState, useCallback } from "react";
import {
    Warehouse,
    MapPin,
    LayoutGrid,
    Layers,
    Box,
    Plus,
    Trash2,
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

interface ProductStorage {
    id: string;
    product_id: string;
    variant_id: string | null;
    location_id: string;
    quantity: number;
    tenant_id: string;
    updated_at: string;
    storage_locations: StorageLocation;
}

interface ProductLocationPickerProps {
    productId: string;
    variantId?: string;
    disabled?: boolean;
}

const typeIcons: Record<LocationType, React.ElementType> = {
    warehouse: Warehouse,
    zone: MapPin,
    aisle: LayoutGrid,
    shelf: Layers,
    bin: Box,
};

export function ProductLocationPicker({
    productId,
    variantId,
    disabled = false,
}: ProductLocationPickerProps) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [newLocationId, setNewLocationId] = useState("");
    const [newQuantity, setNewQuantity] = useState("");

    // Fetch all storage locations
    const { data: allLocations = [] } = useQuery({
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

    // Fetch product's assigned locations
    const { data: assignedLocations = [], isLoading } = useQuery({
        queryKey: ["product-storage", productId, variantId],
        queryFn: async () => {
            if (!productId) return [];
            let query = supabase
                .from("product_storage")
                .select("*, storage_locations(*)")
                .eq("product_id", productId);

            if (variantId) {
                query = query.eq("variant_id", variantId);
            } else {
                query = query.is("variant_id", null);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as ProductStorage[];
        },
        enabled: !!productId,
    });

    // Assign / upsert mutation
    const assignMutation = useMutation({
        mutationFn: async ({ locationId, quantity }: { locationId: string; quantity: number }) => {
            const { error } = await supabase.from("product_storage").upsert(
                {
                    product_id: productId,
                    variant_id: variantId || null,
                    location_id: locationId,
                    quantity,
                    tenant_id: tenantId,
                },
                { onConflict: "product_id,variant_id,location_id" }
            );
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-storage", productId, variantId] });
            queryClient.invalidateQueries({ queryKey: ["product-storage-counts", tenantId] });
            setNewLocationId("");
            setNewQuantity("");
        },
    });

    // Remove mutation
    const removeMutation = useMutation({
        mutationFn: async (locationId: string) => {
            let query = supabase
                .from("product_storage")
                .delete()
                .eq("product_id", productId)
                .eq("location_id", locationId);

            if (variantId) {
                query = query.eq("variant_id", variantId);
            } else {
                query = query.is("variant_id", null);
            }

            const { error } = await query;
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-storage", productId, variantId] });
            queryClient.invalidateQueries({ queryKey: ["product-storage-counts", tenantId] });
        },
    });

    // Update quantity mutation
    const updateQuantityMutation = useMutation({
        mutationFn: async ({ locationId, quantity }: { locationId: string; quantity: number }) => {
            let query = supabase
                .from("product_storage")
                .update({ quantity })
                .eq("product_id", productId)
                .eq("location_id", locationId);

            if (variantId) {
                query = query.eq("variant_id", variantId);
            } else {
                query = query.is("variant_id", null);
            }

            const { error } = await query;
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-storage", productId, variantId] });
        },
    });

    const handleAdd = useCallback(() => {
        if (!newLocationId || !newQuantity) return;
        const qty = parseInt(newQuantity);
        if (qty <= 0) return;
        assignMutation.mutate({ locationId: newLocationId, quantity: qty });
    }, [newLocationId, newQuantity, assignMutation]);

    // Filter out already assigned locations from dropdown
    const assignedLocationIds = new Set(assignedLocations.map((al) => al.location_id));
    const availableLocations = allLocations.filter((loc) => !assignedLocationIds.has(loc.id));

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {"Storage Locations"}
            </h3>

            {/* Assigned locations list */}
            {isLoading ? (
                <div className="flex items-center justify-center py-6">
                    <span className="w-5 h-5 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                </div>
            ) : (
                <AnimatePresence mode="popLayout">
                    {assignedLocations.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="p-4 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center"
                        >
                            <p className="text-muted text-sm">
                                {"No locations assigned. Add a storage location below."}
                            </p>
                        </motion.div>
                    )}

                    {assignedLocations.map((assignment) => {
                        const loc = assignment.storage_locations;
                        if (!loc) return null;
                        const Icon = typeIcons[loc.type] || Box;

                        return (
                            <motion.div
                                key={assignment.id}
                                layout
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]"
                            >
                                {/* Location info */}
                                <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4 text-muted" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {loc.name}
                                        </span>
                                        <span className="text-xs font-mono text-muted bg-[var(--card-border)] px-1.5 py-0.5 rounded">
                                            {loc.code}
                                        </span>
                                    </div>
                                </div>

                                {/* Quantity input */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <label className="text-xs text-muted">
                                        {"Qty"}
                                    </label>
                                    <input
                                        type="number"
                                        defaultValue={assignment.quantity}
                                        onBlur={(e) => {
                                            const qty = parseInt(e.target.value) || 0;
                                            if (qty >= 0) {
                                                updateQuantityMutation.mutate({
                                                    locationId: assignment.location_id,
                                                    quantity: qty,
                                                });
                                            }
                                        }}
                                        min={0}
                                        disabled={disabled}
                                        className={cn(
                                            "w-20 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all",
                                            disabled && "opacity-50 cursor-not-allowed"
                                        )}
                                    />
                                </div>

                                {/* Remove button */}
                                <button
                                    type="button"
                                    onClick={() => removeMutation.mutate(assignment.location_id)}
                                    disabled={disabled || removeMutation.isPending}
                                    className={cn(
                                        "p-1.5 text-muted hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50",
                                        disabled && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            )}

            {/* Add location row */}
            {!disabled && (
                <div className="flex items-center gap-2 p-3 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)]">
                    <select
                        value={newLocationId}
                        onChange={(e) => setNewLocationId(e.target.value)}
                        className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                    >
                        <option value="">
                            {"Select location..."}
                        </option>
                        {availableLocations.map((loc) => {
                            const Icon = typeIcons[loc.type];
                            return (
                                <option key={loc.id} value={loc.id}>
                                    {loc.name} ({loc.code})
                                </option>
                            );
                        })}
                    </select>

                    <input
                        type="number"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        placeholder={"Qty"}
                        min={1}
                        className="w-24 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                    />

                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!newLocationId || !newQuantity || assignMutation.isPending}
                        className={cn(
                            "flex items-center gap-2 px-4 py-3 bg-[var(--pastel-mint)] text-teal-700 rounded-xl text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors shrink-0",
                            (!newLocationId || !newQuantity || assignMutation.isPending) &&
                                "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {assignMutation.isPending ? (
                            <span className="w-4 h-4 border-2 border-teal-700/30 border-t-teal-700 rounded-full animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        {"Add"}
                    </button>
                </div>
            )}

            {/* Error display */}
            {(assignMutation.isError || removeMutation.isError) && (
                <div className="flex items-center gap-2 text-sm text-rose-600">
                    <AlertTriangle className="w-4 h-4" />
                    {"Failed to update storage locations. Please try again."}
                </div>
            )}
        </div>
    );
}
