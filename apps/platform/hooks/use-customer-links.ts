"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CustomerLink } from "@/types/customer";

export function useCustomerLinks(phone: string | undefined) {
    return useQuery({
        queryKey: ["customer-links", phone],
        queryFn: async () => {
            if (!phone) return [];
            const { data, error } = await supabase
                .from("customer_links")
                .select("*")
                .or(`phone_a.eq.${phone},phone_b.eq.${phone}`)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as CustomerLink[];
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}

export function useLinkCustomers() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phoneA, phoneB, relationshipType, similarityHint, linkedBy }: {
            phoneA: string;
            phoneB: string;
            relationshipType: 'same_address' | 'family' | 'coworker' | 'duplicate';
            similarityHint?: string;
            linkedBy?: string;
        }) => {
            // Ensure consistent ordering
            const [a, b] = [phoneA, phoneB].sort();
            const { data, error } = await supabase
                .from("customer_links")
                .insert([{
                    phone_a: a,
                    phone_b: b,
                    relationship_type: relationshipType,
                    similarity_hint: similarityHint,
                    linked_by: linkedBy,
                }])
                .select()
                .single();
            if (error) throw error;
            return data as CustomerLink;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["customer-links", data.phone_a] });
            queryClient.invalidateQueries({ queryKey: ["customer-links", data.phone_b] });
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
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["customer-links", data.phoneA] });
            queryClient.invalidateQueries({ queryKey: ["customer-links", data.phoneB] });
        },
    });
}

export function useSearchSimilarCustomers(phone: string | undefined) {
    return useQuery({
        queryKey: ["similar-customers", phone],
        queryFn: async () => {
            if (!phone) return [];
            // Find customers with shared addresses or similar phones
            const { data, error } = await supabase
                .from("mv_customer_aggregates")
                .select("customer_phone, latest_name, latest_city, total_orders, latest_address_details")
                .neq("customer_phone", phone)
                .limit(20);
            if (error) throw error;
            return (data || []).map((r: any) => ({
                phone: r.customer_phone,
                name: r.latest_name,
                city: r.latest_city,
                totalOrders: r.total_orders,
                addressDetails: r.latest_address_details,
            }));
        },
        enabled: false, // Only run when explicitly triggered
    });
}
