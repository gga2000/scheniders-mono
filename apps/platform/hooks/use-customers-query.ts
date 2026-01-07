"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CustomerTag, CustomerNote, CustomerMetadata, CustomerTagAssignment, CustomerStatus } from "@/lib/customer-types";

// Query Keys
export const customerKeys = {
    all: ["customers"] as const,
    tags: () => [...customerKeys.all, "tags"] as const,
    notes: (phone: string) => [...customerKeys.all, "notes", phone] as const,
    metadata: {
        all: () => [...customerKeys.all, "metadata"] as const,
        byPhone: (phone: string) => [...customerKeys.metadata.all(), phone] as const,
    },
    assignments: {
        all: () => [...customerKeys.all, "assignments"] as const,
        byPhone: (phone: string) => [...customerKeys.assignments.all(), phone] as const,
    },
    blacklist: () => [...customerKeys.all, "blacklist"] as const,
};

// =============================================
// QUERIES
// =============================================

export function useCustomerTagsQuery() {
    return useQuery({
        queryKey: customerKeys.tags(),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_tags").select("*").order("name");
            if (error) throw error;
            return data as CustomerTag[];
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function useAllTagAssignmentsQuery() {
    return useQuery({
        queryKey: customerKeys.assignments.all(),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_tag_assignments").select(`*, tag:customer_tags(*)`);
            if (error) throw error;
            return data;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function useCustomerAssignmentsQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.assignments.byPhone(phone),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_tag_assignments").select(`*, tag:customer_tags(*)`).eq("customer_phone", phone);
            if (error) throw error;
            return data as CustomerTagAssignment[];
        },
        enabled: !!phone,
    });
}

export function useAllMetadataQuery() {
    return useQuery({
        queryKey: customerKeys.metadata.all(),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_metadata").select("*");
            if (error) throw error;
            return data as CustomerMetadata[];
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function useCustomerMetadataQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.metadata.byPhone(phone),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_metadata").select("*").eq("customer_phone", phone).single();
            if (error && error.code !== "PGRST116") throw error;
            return data as CustomerMetadata | null;
        },
        enabled: !!phone,
    });
}

export function useCustomerNotesQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.notes(phone),
        queryFn: async () => {
            const { data, error } = await supabase.from("customer_notes").select("*").eq("customer_phone", phone).order("created_at", { ascending: false });
            if (error) throw error;
            return data as CustomerNote[];
        },
        enabled: !!phone,
    });
}

export function useBlacklistQuery() {
    return useQuery({
        queryKey: customerKeys.blacklist(),
        queryFn: async () => {
            const { data, error } = await supabase.from("blacklist").select("phone");
            if (error) throw error;
            return data as { phone: string }[];
        },
        staleTime: 30 * 60 * 1000,
    });
}

// =============================================
// MUTATIONS
// =============================================

// Tags
export function useCreateTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ name, color }: { name: string; color: string }) => {
            const { data, error } = await supabase.from("customer_tags").insert([{ name, color }]).select().single();
            if (error) throw error;
            return data;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: customerKeys.tags() })
    });
}

export function useDeleteTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("customer_tags").delete().eq("id", id);
            if (error) throw error;
            return id;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: customerKeys.tags() })
    });
}

// Assignments
export function useAssignTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phone, tagId }: { phone: string; tagId: string }) => {
            const { error } = await supabase.from("customer_tag_assignments").insert([{ customer_phone: phone, tag_id: tagId }]);
            if (error) throw error;
            return { phone, tagId };
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments.byPhone(vars.phone) });
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments.all() });
        }
    });
}

export function useRemoveTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phone, tagId }: { phone: string; tagId: string }) => {
            const { error } = await supabase.from("customer_tag_assignments").delete().eq("customer_phone", phone).eq("tag_id", tagId);
            if (error) throw error;
            return { phone, tagId };
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments.byPhone(vars.phone) });
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments.all() });
        }
    });
}

// Metadata
export function useUpdateMetadataMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phone, updates }: { phone: string; updates: { birthday?: string; manual_status?: CustomerStatus } }) => {
            const { error } = await supabase.from("customer_metadata").upsert({ customer_phone: phone, ...updates }, { onConflict: "customer_phone" });
            if (error) throw error;
            return { phone, updates };
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.metadata.byPhone(vars.phone) });
            queryClient.invalidateQueries({ queryKey: customerKeys.metadata.all() });
        }
    });
}

// Notes
export function useAddNoteMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phone, note }: { phone: string; note: string }) => {
            const { data, error } = await supabase.from("customer_notes").insert([{ customer_phone: phone, note }]).select().single();
            if (error) throw error;
            return data;
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(vars.phone) });
        }
    });
}

export function useUpdateNoteMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, note, phone }: { id: string; note: string; phone: string }) => {
            const { error } = await supabase.from("customer_notes").update({ note }).eq("id", id);
            if (error) throw error;
            return id;
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(vars.phone) });
        }
    });
}

export function useDeleteNoteMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, phone }: { id: string; phone: string }) => {
            const { error } = await supabase.from("customer_notes").delete().eq("id", id);
            if (error) throw error;
            return id;
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(vars.phone) });
        }
    });
}
