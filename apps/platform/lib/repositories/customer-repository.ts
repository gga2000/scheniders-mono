import { supabase } from "@/lib/supabase";
import { withRetry } from "./with-retry";
import type {
    CustomerTag,
    CustomerTagAssignment,
    CustomerMetadata,
    CustomerNote,
    CustomerStatus,
} from "@/types/customer";

/**
 * CustomerRepository — Centralized data access for customer-related tables.
 */
export const customerRepository = {
    // =============================================
    // TAGS
    // =============================================

    async findAllTags(): Promise<CustomerTag[]> {
        return withRetry('customerRepository.findAllTags', async () => {
            const { data, error } = await supabase
                .from("customer_tags")
                .select("*")
                .order("name");

            if (error) throw error;
            return data as CustomerTag[];
        });
    },

    async createTag(name: string, color: string): Promise<CustomerTag> {
        return withRetry('customerRepository.createTag', async () => {
            const { data, error } = await supabase
                .from("customer_tags")
                .insert([{ name, color }])
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

    async findAllTagAssignments(): Promise<CustomerTagAssignment[]> {
        return withRetry('customerRepository.findAllTagAssignments', async () => {
            const { data, error } = await supabase
                .from("customer_tag_assignments")
                .select(`*, tag:customer_tags(*)`);

            if (error) throw error;
            return data as CustomerTagAssignment[];
        });
    },

    async findTagAssignmentsByPhone(phone: string): Promise<CustomerTagAssignment[]> {
        return withRetry('customerRepository.findTagAssignmentsByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_tag_assignments")
                .select(`*, tag:customer_tags(*)`)
                .eq("customer_phone", phone);

            if (error) throw error;
            return data as CustomerTagAssignment[];
        });
    },

    async assignTag(phone: string, tagId: string): Promise<void> {
        return withRetry('customerRepository.assignTag', async () => {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .insert([{ customer_phone: phone, tag_id: tagId }]);

            if (error) throw error;
        });
    },

    async removeTag(phone: string, tagId: string): Promise<void> {
        return withRetry('customerRepository.removeTag', async () => {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .delete()
                .eq("customer_phone", phone)
                .eq("tag_id", tagId);

            if (error) throw error;
        });
    },

    // =============================================
    // METADATA
    // =============================================

    async findAllMetadata(): Promise<CustomerMetadata[]> {
        return withRetry('customerRepository.findAllMetadata', async () => {
            const { data, error } = await supabase
                .from("customer_metadata")
                .select("*");

            if (error) throw error;
            return data as CustomerMetadata[];
        });
    },

    async findMetadataByPhone(phone: string): Promise<CustomerMetadata | null> {
        return withRetry('customerRepository.findMetadataByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_metadata")
                .select("*")
                .eq("customer_phone", phone)
                .single();

            if (error && error.code !== "PGRST116") throw error;
            return data as CustomerMetadata | null;
        });
    },

    async upsertMetadata(
        phone: string,
        updates: { birthday?: string; manual_status?: CustomerStatus }
    ): Promise<void> {
        return withRetry('customerRepository.upsertMetadata', async () => {
            const { error } = await supabase
                .from("customer_metadata")
                .upsert(
                    { customer_phone: phone, ...updates },
                    { onConflict: "customer_phone" }
                );

            if (error) throw error;
        });
    },

    // =============================================
    // NOTES
    // =============================================

    async findNotesByPhone(phone: string): Promise<CustomerNote[]> {
        return withRetry('customerRepository.findNotesByPhone', async () => {
            const { data, error } = await supabase
                .from("customer_notes")
                .select("*")
                .eq("customer_phone", phone)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as CustomerNote[];
        });
    },

    async createNote(phone: string, note: string): Promise<CustomerNote> {
        return withRetry('customerRepository.createNote', async () => {
            const { data, error } = await supabase
                .from("customer_notes")
                .insert([{ customer_phone: phone, note }])
                .select()
                .single();

            if (error) throw error;
            return data;
        });
    },

    async updateNote(id: string, note: string): Promise<void> {
        return withRetry('customerRepository.updateNote', async () => {
            const { error } = await supabase
                .from("customer_notes")
                .update({ note })
                .eq("id", id);

            if (error) throw error;
        });
    },

    async deleteNote(id: string): Promise<void> {
        return withRetry('customerRepository.deleteNote', async () => {
            const { error } = await supabase
                .from("customer_notes")
                .delete()
                .eq("id", id);

            if (error) throw error;
        });
    },

    // =============================================
    // BLACKLIST
    // =============================================

    async findBlacklistedPhones(): Promise<{ phone: string }[]> {
        return withRetry('customerRepository.findBlacklistedPhones', async () => {
            const { data, error } = await supabase
                .from("blacklist")
                .select("phone");

            if (error) throw error;
            return data as { phone: string }[];
        });
    },

    // =============================================
    // WHITELIST
    // =============================================

    async findWhitelistedPhones(): Promise<{ phone: string }[]> {
        return withRetry('customerRepository.findWhitelistedPhones', async () => {
            const { data, error } = await supabase
                .from("customer_whitelist")
                .select("phone");

            if (error) throw error;
            return data as { phone: string }[];
        });
    },

    async addToWhitelist(phone: string, reason?: string): Promise<void> {
        return withRetry('customerRepository.addToWhitelist', async () => {
            const { error } = await supabase
                .from("customer_whitelist")
                .upsert([{ phone, reason }]);

            if (error) throw error;
        });
    },

    async removeFromWhitelist(phone: string): Promise<void> {
        return withRetry('customerRepository.removeFromWhitelist', async () => {
            const { error } = await supabase
                .from("customer_whitelist")
                .delete()
                .eq("phone", phone);

            if (error) throw error;
        });
    },
};
