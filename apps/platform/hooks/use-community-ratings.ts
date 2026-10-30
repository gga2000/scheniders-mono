"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CommunityRating } from "@/types/customer";

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
        onSuccess: () => {
            // The rating rescores trust, which the list, profile and breakdown show.
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
            queryClient.invalidateQueries({ queryKey: ["customer-trust-breakdown"] });
            queryClient.invalidateQueries({ queryKey: ["customer-dialog"] });
        },
    });
}
