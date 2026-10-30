"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export function useAddCustomerNote(phone: string) {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (note: string) => {
            const trimmed = note.trim();
            if (!trimmed) throw new Error("Note cannot be empty");
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase
                .from("customer_notes")
                .insert({ customer_phone: phone, note: trimmed, tenant_id: tenantId })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["customer-profile"] });
        },
    });
}

export function useDeleteCustomerNote(phone: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("customer_notes").delete().eq("id", id);
            if (error) throw error;
            return id;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["customer-profile"] });
        },
    });
}
