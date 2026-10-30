"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customerRepository } from "@/lib/repositories/customer-repository";
import { CustomerTag, CustomerNote, CustomerMetadata, CustomerTagAssignment, CustomerStatus } from "@/types/customer";
import { CACHE_PRESETS } from '@/lib/query-config';
import { useAuth } from "@/components/auth/auth-provider";

// Query Keys. Every key carries the active store, so switching stores never
// shows the other store's tags, notes or metadata from cache.
export const customerKeys = {
    all: (tenantId: string | null) => ["customers", "store", tenantId] as const,
    tags: (tenantId: string | null) => [...customerKeys.all(tenantId), "tags"] as const,
    notes: (tenantId: string | null, phone: string) => [...customerKeys.all(tenantId), "notes", phone] as const,
    metadata: (tenantId: string | null, phone: string) => [...customerKeys.all(tenantId), "metadata", phone] as const,
    assignments: (tenantId: string | null, phone: string) => [...customerKeys.all(tenantId), "assignments", phone] as const,
};

// =============================================
// QUERIES
// =============================================

// Queries only run once a store is active (`enabled`), so this never throws in
// practice; it keeps every read filtered by the store it is cached under.
function requireStore(tenantId: string | null): string {
    if (!tenantId) throw new Error("No active store");
    return tenantId;
}

export function useCustomerTagsQuery() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: customerKeys.tags(tenantId),
        queryFn: () => customerRepository.findAllTags(requireStore(tenantId)),
        enabled: !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
    });
}

export function useCustomerAssignmentsQuery(phone: string) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: customerKeys.assignments(tenantId, phone),
        queryFn: () => customerRepository.findTagAssignmentsByPhone(requireStore(tenantId), phone),
        enabled: !!tenantId && !!phone,
    });
}

export function useCustomerMetadataQuery(phone: string) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: customerKeys.metadata(tenantId, phone),
        queryFn: () => customerRepository.findMetadataByPhone(requireStore(tenantId), phone),
        enabled: !!tenantId && !!phone,
    });
}

export function useCustomerNotesQuery(phone: string) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: customerKeys.notes(tenantId, phone),
        queryFn: () => customerRepository.findNotesByPhone(requireStore(tenantId), phone),
        enabled: !!tenantId && !!phone,
    });
}

// =============================================
// MUTATIONS
// =============================================

// Tags
export function useCreateTagMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const key = customerKeys.tags(tenantId);
    return useMutation({
        mutationFn: async ({ name, color }: { name: string; color: CustomerTag["color"] }) => {
            return customerRepository.createTag(name, color, tenantId);
        },
        onMutate: async ({ name, color }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previousTags = queryClient.getQueryData<CustomerTag[]>(key);
            queryClient.setQueryData<CustomerTag[]>(key, (old) => [
                ...(old || []),
                { id: `temp-${Date.now()}`, name, color, created_at: new Date().toISOString() },
            ]);
            return { previousTags };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousTags) queryClient.setQueryData(key, context.previousTags);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
}

export function useDeleteTagMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const key = customerKeys.tags(tenantId);
    return useMutation({
        mutationFn: async (id: string) => {
            await customerRepository.deleteTag(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previousTags = queryClient.getQueryData<CustomerTag[]>(key);
            queryClient.setQueryData<CustomerTag[]>(key, (old) => old?.filter(tag => tag.id !== id) || []);
            return { previousTags };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousTags) queryClient.setQueryData(key, context.previousTags);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
}

// Assignments
export function useAssignTagMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, tagId }: { phone: string; tagId: string }) => {
            await customerRepository.assignTag(phone, tagId, tenantId);
            return { phone, tagId };
        },
        onMutate: async ({ phone, tagId }) => {
            const key = customerKeys.assignments(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<CustomerTagAssignment[]>(key);
            const tag = queryClient.getQueryData<CustomerTag[]>(customerKeys.tags(tenantId))?.find(t => t.id === tagId);
            if (tag) {
                const optimistic: CustomerTagAssignment = {
                    id: `temp-${Date.now()}`,
                    customer_phone: phone,
                    tag_id: tagId,
                    created_at: new Date().toISOString(),
                    tag,
                };
                queryClient.setQueryData<CustomerTagAssignment[]>(key, (old) => [...(old || []), optimistic]);
            }
            return { previous, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(customerKeys.assignments(tenantId, context.phone), context.previous);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments(tenantId, vars.phone) });
        },
    });
}

export function useRemoveTagMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, tagId }: { phone: string; tagId: string }) => {
            await customerRepository.removeTag(phone, tagId);
            return { phone, tagId };
        },
        onMutate: async ({ phone, tagId }) => {
            const key = customerKeys.assignments(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<CustomerTagAssignment[]>(key);
            queryClient.setQueryData<CustomerTagAssignment[]>(key, (old) => old?.filter(a => a.tag_id !== tagId) || []);
            return { previous, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(customerKeys.assignments(tenantId, context.phone), context.previous);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.assignments(tenantId, vars.phone) });
        },
    });
}

// Metadata
export function useUpdateMetadataMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, updates }: { phone: string; updates: { birthday?: string; manual_status?: CustomerStatus } }) => {
            await customerRepository.upsertMetadata(phone, updates, tenantId);
            return { phone, updates };
        },
        onMutate: async ({ phone, updates }) => {
            const key = customerKeys.metadata(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<CustomerMetadata | null>(key);
            queryClient.setQueryData<CustomerMetadata>(key, {
                ...previous,
                customer_phone: phone,
                ...updates,
                updated_at: new Date().toISOString(),
                created_at: previous?.created_at || new Date().toISOString(),
            });
            return { previous, phone };
        },
        onError: (_err, _vars, context) => {
            if (context) queryClient.setQueryData(customerKeys.metadata(tenantId, context.phone), context.previous);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.metadata(tenantId, vars.phone) });
        },
    });
}

// Notes
export function useAddNoteMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, note }: { phone: string; note: string }) => {
            return customerRepository.createNote(phone, note, tenantId);
        },
        onMutate: async ({ phone, note }) => {
            const key = customerKeys.notes(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(key);
            const tempNote: CustomerNote = {
                id: `temp-${Date.now()}`,
                customer_phone: phone,
                note,
                created_at: new Date().toISOString(),
            };
            queryClient.setQueryData<CustomerNote[]>(key, (old) => [tempNote, ...(old || [])]);
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) queryClient.setQueryData(customerKeys.notes(tenantId, context.phone), context.previousNotes);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(tenantId, vars.phone) });
        },
    });
}

export function useUpdateNoteMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ id, note }: { id: string; note: string; phone: string }) => {
            await customerRepository.updateNote(id, note);
            return id;
        },
        onMutate: async ({ id, note, phone }) => {
            const key = customerKeys.notes(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(key);
            queryClient.setQueryData<CustomerNote[]>(key, (old) => old?.map(n => n.id === id ? { ...n, note } : n) || []);
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) queryClient.setQueryData(customerKeys.notes(tenantId, context.phone), context.previousNotes);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(tenantId, vars.phone) });
        },
    });
}

export function useDeleteNoteMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ id }: { id: string; phone: string }) => {
            await customerRepository.deleteNote(id);
            return id;
        },
        onMutate: async ({ id, phone }) => {
            const key = customerKeys.notes(tenantId, phone);
            await queryClient.cancelQueries({ queryKey: key });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(key);
            queryClient.setQueryData<CustomerNote[]>(key, (old) => old?.filter(n => n.id !== id) || []);
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) queryClient.setQueryData(customerKeys.notes(tenantId, context.phone), context.previousNotes);
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(tenantId, vars.phone) });
        },
    });
}
