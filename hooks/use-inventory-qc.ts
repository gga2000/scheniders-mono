"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, QCItem } from "@/lib/supabase";

export const qcKeys = {
    all: ["qc_items"] as const,
    lists: () => [...qcKeys.all, "list"] as const,
};

async function fetchQCItems(): Promise<QCItem[]> {
    const { data, error } = await supabase
        .from("qc_quarantine")
        .select(`
            *,
            product:products(*),
            order:orders(*)
        `)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data as QCItem[];
}

export function useInventoryQC() {
    const queryClient = useQueryClient();

    const { data: qcItems, isLoading, error } = useQuery({
        queryKey: qcKeys.lists(),
        queryFn: fetchQCItems,
    });

    const resolveItemMutation = useMutation({
        mutationFn: async ({ id, resolution, productId, quantity }: { id: string, resolution: 'restocked' | 'written_off', productId: string, quantity: number }) => {
            // First run the engine logic to handle physical stock 
            // (e.g. if written_off, decrement physical stock)
            const { resolveQuarantine } = await import("@/lib/inventory-engine");
            const result = await resolveQuarantine(id, resolution, productId, quantity);
            if (!result.success) throw new Error(result.error);
            return { id, resolution };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qcKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ["products"] }); // Refetch products to get latest stock
        }
    });

    return {
        qcItems: qcItems || [],
        isLoading,
        error,
        resolveItem: (id: string, resolution: 'restocked' | 'written_off', productId: string, quantity: number) =>
            resolveItemMutation.mutateAsync({ id, resolution, productId, quantity })
    };
}
