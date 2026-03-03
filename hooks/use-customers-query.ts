"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customerRepository } from "@/lib/repositories/customer-repository";
import { CustomerTag, CustomerNote, CustomerMetadata, CustomerTagAssignment, CustomerStatus } from "@/types/customer";
import { CACHE_PRESETS } from '@/lib/query-config';

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
            return customerRepository.findAllTags();
        },
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
    });
}

export function useAllTagAssignmentsQuery() {
    return useQuery({
        queryKey: customerKeys.assignments.all(),
        queryFn: async () => {
            return customerRepository.findAllTagAssignments();
        },
        staleTime: CACHE_PRESETS.STANDARD.staleTime * 2, // 10 mins
        gcTime: CACHE_PRESETS.STANDARD.gcTime * 2,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

export function useCustomerAssignmentsQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.assignments.byPhone(phone),
        queryFn: async () => {
            return customerRepository.findTagAssignmentsByPhone(phone);
        },
        enabled: !!phone,
    });
}

export function useAllMetadataQuery() {
    return useQuery({
        queryKey: customerKeys.metadata.all(),
        queryFn: async () => {
            return customerRepository.findAllMetadata();
        },
        staleTime: CACHE_PRESETS.STANDARD.staleTime * 2, // 10 mins
        gcTime: CACHE_PRESETS.STANDARD.gcTime * 2,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

export function useCustomerMetadataQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.metadata.byPhone(phone),
        queryFn: async () => {
            return customerRepository.findMetadataByPhone(phone);
        },
        enabled: !!phone,
    });
}

export function useCustomerNotesQuery(phone: string) {
    return useQuery({
        queryKey: customerKeys.notes(phone),
        queryFn: async () => {
            return customerRepository.findNotesByPhone(phone);
        },
        enabled: !!phone,
    });
}

export function useBlacklistQuery() {
    return useQuery({
        queryKey: customerKeys.blacklist(),
        queryFn: async () => {
            return customerRepository.findBlacklistedPhones();
        },
        staleTime: CACHE_PRESETS.STATIC.staleTime,
    });
}

/**
 * Prefetch all customer-related queries for instant navigation
 */
export function usePrefetchCustomers() {
    const queryClient = useQueryClient();

    return () => {
        queryClient.prefetchQuery({
            queryKey: customerKeys.assignments.all(),
            queryFn: async () => {
                return customerRepository.findAllTagAssignments();
            },
            staleTime: CACHE_PRESETS.STANDARD.staleTime,
        });

        queryClient.prefetchQuery({
            queryKey: customerKeys.metadata.all(),
            queryFn: async () => {
                return customerRepository.findAllMetadata();
            },
            staleTime: CACHE_PRESETS.STANDARD.staleTime,
        });

        queryClient.prefetchQuery({
            queryKey: customerKeys.blacklist(),
            queryFn: async () => {
                return customerRepository.findBlacklistedPhones();
            },
            staleTime: CACHE_PRESETS.STATIC.staleTime,
        });
    };
}

// =============================================
// MUTATIONS
// =============================================

// Tags
export function useCreateTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ name, color }: { name: string; color: string }) => {
            return customerRepository.createTag(name, color);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: customerKeys.tags() })
    });
}

export function useDeleteTagMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await customerRepository.deleteTag(id);
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
            await customerRepository.assignTag(phone, tagId);
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
            await customerRepository.removeTag(phone, tagId);
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
            await customerRepository.upsertMetadata(phone, updates);
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
            return customerRepository.createNote(phone, note);
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
            await customerRepository.updateNote(id, note);
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
            await customerRepository.deleteNote(id);
            return id;
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(vars.phone) });
        }
    });
}
