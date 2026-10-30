"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { CustomerLink } from "@/types/customer";

export function useCustomerLinks(phone: string | undefined) {
    // Links belong to a store: a phone linked in two stores shows only this one's.
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-links", tenantId, phone],
        queryFn: async () => {
            if (!phone || !tenantId) return [];
            const { data, error } = await supabase
                .from("customer_links")
                .select("*")
                .eq("tenant_id", tenantId)
                .or(`phone_a.eq.${phone},phone_b.eq.${phone}`)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as CustomerLink[];
        },
        enabled: !!phone && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useLinkCustomers() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phoneA, phoneB, relationshipType, similarityHint }: {
            phoneA: string;
            phoneB: string;
            relationshipType: 'same_address' | 'family' | 'coworker' | 'duplicate';
            similarityHint?: string;
        }) => {
            // The database normalizes and orders the phones and fills in the
            // store and who linked them.
            const { data, error } = await supabase
                .from("customer_links")
                .insert([{
                    phone_a: phoneA,
                    phone_b: phoneB,
                    relationship_type: relationshipType,
                    similarity_hint: similarityHint,
                }])
                .select()
                .single();
            if (error) throw error;
            return data as CustomerLink;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-links"] });
        },
    });
}

export function useUnlinkCustomers() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ linkId, phoneA, phoneB }: {
            linkId: string;
            phoneA: string;
            phoneB: string;
        }) => {
            const { error } = await supabase
                .from("customer_links")
                .delete()
                .eq("id", linkId);
            if (error) throw error;
            return { phoneA, phoneB };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-links"] });
        },
    });
}
