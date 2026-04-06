"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customerRepository } from "@/lib/repositories/customer-repository";
import { CustomerTag, CustomerNote, CustomerMetadata, CustomerTagAssignment, CustomerStatus } from "@/types/customer";
import { CACHE_PRESETS } from '@/lib/query-config';
import { useAuth } from "@/components/auth/auth-provider";

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
    whitelist: () => [...customerKeys.all, "whitelist"] as const,
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

export function useWhitelistQuery() {
    return useQuery({
        queryKey: customerKeys.whitelist(),
        queryFn: async () => {
            return customerRepository.findWhitelistedPhones();
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

        queryClient.prefetchQuery({
            queryKey: customerKeys.whitelist(),
            queryFn: async () => {
                return customerRepository.findWhitelistedPhones();
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
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ name, color }: { name: string; color: string }) => {
            return customerRepository.createTag(name, color, tenantId);
        },
        onMutate: async ({ name, color }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.tags() });
            const previousTags = queryClient.getQueryData<CustomerTag[]>(customerKeys.tags());
            
            const tempId = `temp-${Date.now()}`;
            queryClient.setQueryData<CustomerTag[]>(customerKeys.tags(), (old) => [
                ...(old || []),
                { id: tempId, name, color: color as any, created_at: new Date().toISOString() }
            ]);
            
            return { previousTags };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousTags) {
                queryClient.setQueryData(customerKeys.tags(), context.previousTags);
            }
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
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.tags() });
            const previousTags = queryClient.getQueryData<CustomerTag[]>(customerKeys.tags());
            
            queryClient.setQueryData<CustomerTag[]>(customerKeys.tags(), (old) => 
                old?.filter(tag => tag.id !== id) || []
            );
            
            return { previousTags };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousTags) {
                queryClient.setQueryData(customerKeys.tags(), context.previousTags);
            }
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: customerKeys.tags() })
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
            await queryClient.cancelQueries({ queryKey: customerKeys.assignments.byPhone(phone) });
            await queryClient.cancelQueries({ queryKey: customerKeys.assignments.all() });
            
            const previousPhoneAssignments = queryClient.getQueryData<CustomerTagAssignment[]>(customerKeys.assignments.byPhone(phone));
            const previousAllAssignments = queryClient.getQueryData<CustomerTagAssignment[]>(customerKeys.assignments.all());
            
            const tags = queryClient.getQueryData<CustomerTag[]>(customerKeys.tags()) || [];
            const tag = tags.find(t => t.id === tagId);
            
            if (tag) {
                const newAssignment: CustomerTagAssignment = {
                    id: `temp-${Date.now()}`,
                    customer_phone: phone,
                    tag_id: tagId,
                    created_at: new Date().toISOString(),
                    tag
                };
                
                queryClient.setQueryData<CustomerTagAssignment[]>(customerKeys.assignments.byPhone(phone), (old) => [...(old || []), newAssignment]);
                queryClient.setQueryData<CustomerTagAssignment[]>(customerKeys.assignments.all(), (old) => [...(old || []), newAssignment]);
            }
            
            return { previousPhoneAssignments, previousAllAssignments, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousPhoneAssignments) {
                queryClient.setQueryData(customerKeys.assignments.byPhone(context.phone), context.previousPhoneAssignments);
            }
            if (context?.previousAllAssignments) {
                queryClient.setQueryData(customerKeys.assignments.all(), context.previousAllAssignments);
            }
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
        onMutate: async ({ phone, tagId }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.assignments.byPhone(phone) });
            await queryClient.cancelQueries({ queryKey: customerKeys.assignments.all() });
            
            const previousPhoneAssignments = queryClient.getQueryData<CustomerTagAssignment[]>(customerKeys.assignments.byPhone(phone));
            const previousAllAssignments = queryClient.getQueryData<CustomerTagAssignment[]>(customerKeys.assignments.all());
            
            queryClient.setQueryData<CustomerTagAssignment[]>(customerKeys.assignments.byPhone(phone), (old) => 
                old?.filter(a => a.tag_id !== tagId) || []
            );
            queryClient.setQueryData<CustomerTagAssignment[]>(customerKeys.assignments.all(), (old) => 
                old?.filter(a => !(a.customer_phone === phone && a.tag_id === tagId)) || []
            );
            
            return { previousPhoneAssignments, previousAllAssignments, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousPhoneAssignments) {
                queryClient.setQueryData(customerKeys.assignments.byPhone(context.phone), context.previousPhoneAssignments);
            }
            if (context?.previousAllAssignments) {
                queryClient.setQueryData(customerKeys.assignments.all(), context.previousAllAssignments);
            }
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
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, updates }: { phone: string; updates: { birthday?: string; manual_status?: CustomerStatus } }) => {
            await customerRepository.upsertMetadata(phone, updates, tenantId);
            return { phone, updates };
        },
        onMutate: async ({ phone, updates }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.metadata.byPhone(phone) });
            await queryClient.cancelQueries({ queryKey: customerKeys.metadata.all() });
            
            const previousPhoneMetadata = queryClient.getQueryData<CustomerMetadata>(customerKeys.metadata.byPhone(phone));
            const previousAllMetadata = queryClient.getQueryData<CustomerMetadata[]>(customerKeys.metadata.all());
            
            const newMetadata: CustomerMetadata = {
                ...previousPhoneMetadata,
                customer_phone: phone,
                ...updates,
                updated_at: new Date().toISOString(),
                // Fill required fields if they don't exist
                created_at: previousPhoneMetadata?.created_at || new Date().toISOString()
            };
            
            queryClient.setQueryData<CustomerMetadata>(customerKeys.metadata.byPhone(phone), newMetadata);
            queryClient.setQueryData<CustomerMetadata[]>(customerKeys.metadata.all(), (old) => {
                if (!old) return [newMetadata];
                const index = old.findIndex(m => m.customer_phone === phone);
                if (index === -1) return [...old, newMetadata];
                const copy = [...old];
                copy[index] = newMetadata;
                return copy;
            });
            
            return { previousPhoneMetadata, previousAllMetadata, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousPhoneMetadata) {
                queryClient.setQueryData(customerKeys.metadata.byPhone(context.phone), context.previousPhoneMetadata);
            }
            if (context?.previousAllMetadata) {
                queryClient.setQueryData(customerKeys.metadata.all(), context.previousAllMetadata);
            }
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
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, note }: { phone: string; note: string }) => {
            return customerRepository.createNote(phone, note, tenantId);
        },
        onMutate: async ({ phone, note }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.notes(phone) });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(customerKeys.notes(phone));
            
            const tempNote: CustomerNote = {
                id: `temp-${Date.now()}`,
                customer_phone: phone,
                note,
                created_at: new Date().toISOString()
            };
            
            queryClient.setQueryData<CustomerNote[]>(customerKeys.notes(phone), (old) => [
                tempNote,
                ...(old || [])
            ]);
            
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(customerKeys.notes(context.phone), context.previousNotes);
            }
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
        onMutate: async ({ id, note, phone }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.notes(phone) });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(customerKeys.notes(phone));
            
            queryClient.setQueryData<CustomerNote[]>(customerKeys.notes(phone), (old) => 
                old?.map(n => n.id === id ? { ...n, note } : n) || []
            );
            
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(customerKeys.notes(context.phone), context.previousNotes);
            }
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
        onMutate: async ({ id, phone }) => {
            await queryClient.cancelQueries({ queryKey: customerKeys.notes(phone) });
            const previousNotes = queryClient.getQueryData<CustomerNote[]>(customerKeys.notes(phone));
            
            queryClient.setQueryData<CustomerNote[]>(customerKeys.notes(phone), (old) => 
                old?.filter(n => n.id !== id) || []
            );
            
            return { previousNotes, phone };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(customerKeys.notes(context.phone), context.previousNotes);
            }
        },
        onSettled: (_data, _error, vars) => {
            queryClient.invalidateQueries({ queryKey: customerKeys.notes(vars.phone) });
        }
    });
}

// Whitelist
export function useAddToWhitelistMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ phone, reason }: { phone: string; reason?: string }) => {
            await customerRepository.addToWhitelist(phone, reason, tenantId);
            return phone;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: customerKeys.whitelist() });
        }
    });
}

export function useRemoveFromWhitelistMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (phone: string) => {
            await customerRepository.removeFromWhitelist(phone);
            return phone;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: customerKeys.whitelist() });
        }
    });
}
