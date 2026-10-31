"use client";

import {
    useCustomerTagsQuery,
    useCreateTagMutation,
    useDeleteTagMutation,
    useCustomerAssignmentsQuery,
    useAssignTagMutation,
    useRemoveTagMutation,
    useCustomerMetadataQuery,
    useUpdateMetadataMutation
} from "@/hooks/use-customers-query";
import { CustomerTag, CustomerStatus, TagColor } from "@/types/customer";

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
