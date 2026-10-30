"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CommunityRating } from "@/types/customer";

export function useCommunityRatings(phone: string | undefined) {
    return useQuery({
        queryKey: ["community-ratings", phone],
        queryFn: async () => {
            if (!phone) return [];
            const { data, error } = await supabase
                .from("community_ratings")
                .select("*")
                .eq("customer_phone", phone)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as CommunityRating[];
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSubmitCommunityRating() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (rating: {
            customer_phone: string;
            order_id?: string;
            trust_stars: number;
            communication_stars: number;
            behavior_stars: number;
            overall_type: 'positive' | 'neutral' | 'warning';
            comment?: string;
            quick_tags?: string[];
        }) => {
            const { data, error } = await supabase
                .from("community_ratings")
                .insert([rating])
                .select()
                .single();
            if (error) throw error;
            return data as CommunityRating;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["community-ratings", data.customer_phone] });
            queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
    });
}

export function useDisputeRating() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ratingId, reason, customerPhone }: {
            ratingId: string;
            reason: string;
            customerPhone: string;
        }) => {
            const { error } = await supabase
                .from("community_ratings")
                .update({ disputed: true, dispute_reason: reason })
                .eq("id", ratingId);
            if (error) throw error;
            return { customerPhone };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["community-ratings", data.customerPhone] });
        },
    });
}
