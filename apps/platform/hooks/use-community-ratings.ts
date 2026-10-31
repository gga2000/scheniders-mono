"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
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

/** The rating was not deleted: it is someone else's (only its author can remove it). */
export class RatingNotDeletedError extends Error {
    constructor() {
        super("Only the author of a rating can delete it");
    }
}

export function useDeleteCommunityRating() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!tenantId) throw new Error("No active tenant");
            // RLS filters out a rating the caller did not write instead of
            // raising, so an empty result means nothing was removed.
            const { data, error } = await supabase
                .from("community_ratings")
                .delete()
                .eq("tenant_id", tenantId)
                .eq("id", id)
                .select("id");
            if (error) throw error;
            if (!data || data.length === 0) throw new RatingNotDeletedError();
            return id;
        },
        onSuccess: () => {
            // Removing a rating rescores trust everywhere it is shown.
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
            queryClient.invalidateQueries({ queryKey: ["customer-trust-breakdown"] });
            queryClient.invalidateQueries({ queryKey: ["customer-dialog"] });
        },
    });
}
