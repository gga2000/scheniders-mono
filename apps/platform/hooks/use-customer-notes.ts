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

/** The note was not deleted: it is someone else's and the caller is not a store admin. */
export class NoteNotDeletedError extends Error {
    constructor() {
        super("Only the note's author or a store admin can delete it");
        this.name = "NoteNotDeletedError";
    }
}

export function useDeleteCustomerNote() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!tenantId) throw new Error("No active tenant");
            // RLS filters out a note the caller may not delete instead of
            // raising, so an empty result means nothing was removed.
            const { data, error } = await supabase
                .from("customer_notes")
                .delete()
                .eq("tenant_id", tenantId)
                .eq("id", id)
                .select("id");
            if (error) throw error;
            if (!data || data.length === 0) throw new NoteNotDeletedError();
            return id;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["customer-profile"] });
        },
    });
}
