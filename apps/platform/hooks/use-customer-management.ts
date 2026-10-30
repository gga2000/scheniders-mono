"use client";

import {
    useCustomerNotesQuery,
    useAddNoteMutation,
    useUpdateNoteMutation,
    useDeleteNoteMutation,
    useCustomerTagsQuery,
    useCreateTagMutation,
    useDeleteTagMutation,
    useCustomerAssignmentsQuery,
    useAssignTagMutation,
    useRemoveTagMutation,
    useCustomerMetadataQuery,
    useUpdateMetadataMutation
} from "@/hooks/use-customers-query";
import { CustomerTag, CustomerNote, CustomerMetadata, CustomerTagAssignment, CustomerStatus, TagColor } from "@/types/customer";

// =============================================
// CUSTOMER NOTES HOOK
// =============================================
export function useCustomerNotes(customerPhone: string) {
    const { data: notes, isLoading: loading, refetch } = useCustomerNotesQuery(customerPhone);

    const addNoteMutation = useAddNoteMutation();
    const updateNoteMutation = useUpdateNoteMutation();
    const deleteNoteMutation = useDeleteNoteMutation();

    const addNote = async (note: string): Promise<CustomerNote | null> => {
        try {
            const data = await addNoteMutation.mutateAsync({ phone: customerPhone, note });
            return data as CustomerNote;
        } catch (err) {
            console.error("Error adding note:", err);
            return null;
        }
    };

    const updateNote = async (id: string, note: string): Promise<boolean> => {
        try {
            await updateNoteMutation.mutateAsync({ id, note, phone: customerPhone });
            return true;
        } catch (err) {
            console.error("Error updating note:", err);
            return false;
        }
    };

    const deleteNote = async (id: string): Promise<boolean> => {
        try {
            await deleteNoteMutation.mutateAsync({ id, phone: customerPhone });
            return true;
        } catch (err) {
            console.error("Error deleting note:", err);
            return false;
        }
    };

    return { notes: notes || [], loading, addNote, updateNote, deleteNote, refetch };
}

// =============================================
// CUSTOMER TAGS HOOK
// =============================================
export function useCustomerTags() {
    const { data: tags, isLoading: loading, refetch } = useCustomerTagsQuery();

    const createTagMutation = useCreateTagMutation();
    const deleteTagMutation = useDeleteTagMutation();

    const createTag = async (name: string, color: TagColor): Promise<CustomerTag | null> => {
        try {
            const data = await createTagMutation.mutateAsync({ name, color });
            return data as CustomerTag;
        } catch (err) {
            console.error("Error creating tag:", err);
            return null;
        }
    };

    const deleteTag = async (id: string): Promise<boolean> => {
        try {
            await deleteTagMutation.mutateAsync(id);
            return true;
        } catch (err) {
            console.error("Error deleting tag:", err);
            return false;
        }
    };

    return { tags: tags || [], loading, createTag, deleteTag, refetch };
}

// =============================================
// CUSTOMER TAG ASSIGNMENTS HOOK
// =============================================
export function useCustomerTagAssignments(customerPhone: string) {
    const { data: assignments, isLoading: loading, refetch } = useCustomerAssignmentsQuery(customerPhone);

    const assignTagMutation = useAssignTagMutation();
    const removeTagMutation = useRemoveTagMutation();

    const assignTag = async (tagId: string): Promise<boolean> => {
        try {
            await assignTagMutation.mutateAsync({ phone: customerPhone, tagId });
            return true;
        } catch (err) {
            console.error("Error assigning tag:", err);
            return false;
        }
    };

    const removeTag = async (tagId: string): Promise<boolean> => {
        try {
            await removeTagMutation.mutateAsync({ phone: customerPhone, tagId });
            return true;
        } catch (err) {
            console.error("Error removing tag:", err);
            return false;
        }
    };

    return { assignments: assignments || [], loading, assignTag, removeTag, refetch };
}

// =============================================
// CUSTOMER METADATA HOOK
// =============================================
export function useCustomerMetadata(customerPhone: string) {
    const { data: metadata, isLoading: loading, refetch } = useCustomerMetadataQuery(customerPhone);

    const updateMetadataMutation = useUpdateMetadataMutation();

    const updateMetadata = async (updates: { birthday?: string; manual_status?: CustomerStatus }): Promise<boolean> => {
        try {
            await updateMetadataMutation.mutateAsync({ phone: customerPhone, updates });
            return true;
        } catch (err) {
            console.error("Error updating metadata:", err);
            return false;
        }
    };

    return { metadata, loading, updateMetadata, refetch };
}
