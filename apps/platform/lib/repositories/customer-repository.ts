import { supabase } from "@/lib/supabase";
import { withRetry } from "./with-retry";
import type {
    CustomerTag,
    CustomerTagAssignment,
    CustomerMetadata,
    CustomerStatus,
    CommunityRating,
} from "@/types/customer";
import { normalizePhoneForSearch } from "@/lib/order-utils";

/**
 * CustomerRepository — Centralized data access for customer-related tables.
 */
export const customerRepository = {
    // =============================================
    // TAGS
    // =============================================

    async findAllTags(tenantId: string): Promise<CustomerTag[]> {
        return withRetry('customerRepository.findAllTags', async () => {
            const { data, error } = await supabase
                .from("customer_tags")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("name");

            if (error) throw error;
            return data as CustomerTag[];
        });
    },

    async createTag(name: string, color: string, tenantId: string | null): Promise<CustomerTag> {
        return withRetry('customerRepository.createTag', async () => {
            const { data, error } = await supabase
                .from("customer_tags")
                .insert([{ name, color, tenant_id: tenantId }])
                .select()
                .single();

            if (error) throw error;
            return data;
        });
    },

    async deleteTag(id: string): Promise<void> {
        return withRetry('customerRepository.deleteTag', async () => {
            const { error } = await supabase
                .from("customer_tags")
                .delete()
                .eq("id", id);

            if (error) throw error;
        });
    },

    // =============================================
    // TAG ASSIGNMENTS
    // =============================================

    async findTagAssignmentsByPhone(tenantId: string, phone: string): Promise<CustomerTagAssignment[]> {
        return withRetry('customerRepository.findTagAssignmentsByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_tag_assignments")
                .select(`*, tag:customer_tags(*)`)
                .eq("tenant_id", tenantId)
                .eq("customer_phone", normalizePhoneForSearch(phone));

            if (error) throw error;
            return data as CustomerTagAssignment[];
        });
    },

    async assignTag(phone: string, tagId: string, tenantId: string | null): Promise<void> {
        return withRetry('customerRepository.assignTag', async () => {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .insert([{ customer_phone: phone, tag_id: tagId, tenant_id: tenantId }]);

            if (error) throw error;
        });
    },

    async removeTag(phone: string, tagId: string): Promise<void> {
        return withRetry('customerRepository.removeTag', async () => {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .delete()
                .eq("customer_phone", normalizePhoneForSearch(phone))
                .eq("tag_id", tagId);

            if (error) throw error;
        });
    },

    // =============================================
    // METADATA
    // =============================================

    async findMetadataByPhone(tenantId: string, phone: string): Promise<CustomerMetadata | null> {
        return withRetry('customerRepository.findMetadataByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_metadata")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("customer_phone", normalizePhoneForSearch(phone))
                .maybeSingle();

            if (error) throw error;
            return data as CustomerMetadata | null;
        });
    },

    async upsertMetadata(
        phone: string,
        updates: { birthday?: string; manual_status?: CustomerStatus },
        tenantId: string | null
    ): Promise<void> {
        return withRetry('customerRepository.upsertMetadata', async () => {
            const { error } = await supabase
                .from("customer_metadata")
                .upsert(
                    { customer_phone: normalizePhoneForSearch(phone), ...updates, tenant_id: tenantId },
                    { onConflict: "tenant_id,customer_phone" }
                );

            if (error) throw error;
        });
    },

    // =============================================
    // TRUST
    // =============================================

    async findTrustByPhone(phone: string) {
        return withRetry('customerRepository.findTrustByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_trust")
                .select("*")
                .eq("phone", phone)
                .maybeSingle();

            if (error) throw error;
            return data;
        });
    },

    // =============================================
    // COMMUNITY RATINGS
    // =============================================

    async findRatingsByPhone(phone: string): Promise<CommunityRating[]> {
        return withRetry('customerRepository.findRatingsByPhone', async () => {
            const { data, error } = await supabase
                .from("community_ratings")
                .select("*")
                .eq("customer_phone", phone)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as CommunityRating[];
        });
    },

    async createRating(rating: Omit<CommunityRating, 'id' | 'created_at' | 'disputed' | 'dispute_reason'>): Promise<CommunityRating> {
        return withRetry('customerRepository.createRating', async () => {
            const { data, error } = await supabase
                .from("community_ratings")
                .insert([rating])
                .select()
                .single();

            if (error) throw error;
            return data as CommunityRating;
        });
    },
};
