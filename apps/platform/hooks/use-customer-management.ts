"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
    CustomerTag,
    CustomerNote,
    CustomerMetadata,
    CustomerTagAssignment,
    CustomerStatus
} from "@/lib/customer-types";

// =============================================
// CUSTOMER NOTES HOOK
// =============================================
export function useCustomerNotes(customerPhone: string) {
    const [notes, setNotes] = useState<CustomerNote[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotes = useCallback(async () => {
        if (!customerPhone) return;

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("customer_notes")
                .select("*")
                .eq("customer_phone", customerPhone)
                .order("created_at", { ascending: false });

            if (error) throw error;
            setNotes(data || []);
        } catch (err) {
            console.error("Error fetching notes:", err);
        } finally {
            setLoading(false);
        }
    }, [customerPhone]);

    const addNote = async (note: string): Promise<CustomerNote | null> => {
        try {
            const { data, error } = await supabase
                .from("customer_notes")
                .insert([{ customer_phone: customerPhone, note }])
                .select()
                .single();

            if (error) throw error;
            await fetchNotes();
            return data;
        } catch (err) {
            console.error("Error adding note:", err);
            return null;
        }
    };

    const updateNote = async (id: string, note: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_notes")
                .update({ note })
                .eq("id", id);

            if (error) throw error;
            await fetchNotes();
            return true;
        } catch (err) {
            console.error("Error updating note:", err);
            return false;
        }
    };

    const deleteNote = async (id: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_notes")
                .delete()
                .eq("id", id);

            if (error) throw error;
            await fetchNotes();
            return true;
        } catch (err) {
            console.error("Error deleting note:", err);
            return false;
        }
    };

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    return { notes, loading, addNote, updateNote, deleteNote, refetch: fetchNotes };
}

// =============================================
// CUSTOMER TAGS HOOK
// =============================================
export function useCustomerTags() {
    const [tags, setTags] = useState<CustomerTag[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTags = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("customer_tags")
                .select("*")
                .order("name");

            if (error) throw error;
            setTags(data || []);
        } catch (err) {
            console.error("Error fetching tags:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createTag = async (name: string, color: string): Promise<CustomerTag | null> => {
        try {
            const { data, error } = await supabase
                .from("customer_tags")
                .insert([{ name, color }])
                .select()
                .single();

            if (error) throw error;
            await fetchTags();
            return data;
        } catch (err) {
            console.error("Error creating tag:", err);
            return null;
        }
    };

    const deleteTag = async (id: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_tags")
                .delete()
                .eq("id", id);

            if (error) throw error;
            await fetchTags();
            return true;
        } catch (err) {
            console.error("Error deleting tag:", err);
            return false;
        }
    };

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    return { tags, loading, createTag, deleteTag, refetch: fetchTags };
}

// =============================================
// CUSTOMER TAG ASSIGNMENTS HOOK
// =============================================
export function useCustomerTagAssignments(customerPhone: string) {
    const [assignments, setAssignments] = useState<CustomerTagAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAssignments = useCallback(async () => {
        if (!customerPhone) return;

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("customer_tag_assignments")
                .select(`
                    *,
                    tag:customer_tags(*)
                `)
                .eq("customer_phone", customerPhone);

            if (error) throw error;
            setAssignments(data || []);
        } catch (err) {
            console.error("Error fetching tag assignments:", err);
        } finally {
            setLoading(false);
        }
    }, [customerPhone]);

    const assignTag = async (tagId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .insert([{ customer_phone: customerPhone, tag_id: tagId }]);

            if (error) throw error;
            await fetchAssignments();
            return true;
        } catch (err) {
            console.error("Error assigning tag:", err);
            return false;
        }
    };

    const removeTag = async (tagId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_tag_assignments")
                .delete()
                .eq("customer_phone", customerPhone)
                .eq("tag_id", tagId);

            if (error) throw error;
            await fetchAssignments();
            return true;
        } catch (err) {
            console.error("Error removing tag:", err);
            return false;
        }
    };

    useEffect(() => {
        fetchAssignments();
    }, [fetchAssignments]);

    return { assignments, loading, assignTag, removeTag, refetch: fetchAssignments };
}

// =============================================
// CUSTOMER METADATA HOOK
// =============================================
export function useCustomerMetadata(customerPhone: string) {
    const [metadata, setMetadata] = useState<CustomerMetadata | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchMetadata = useCallback(async () => {
        if (!customerPhone) return;

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("customer_metadata")
                .select("*")
                .eq("customer_phone", customerPhone)
                .single();

            if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
            setMetadata(data || null);
        } catch (err) {
            console.error("Error fetching metadata:", err);
        } finally {
            setLoading(false);
        }
    }, [customerPhone]);

    const updateMetadata = async (updates: { birthday?: string; manual_status?: CustomerStatus }): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from("customer_metadata")
                .upsert({
                    customer_phone: customerPhone,
                    ...updates,
                }, { onConflict: "customer_phone" });

            if (error) throw error;
            await fetchMetadata();
            return true;
        } catch (err) {
            console.error("Error updating metadata:", err);
            return false;
        }
    };

    useEffect(() => {
        fetchMetadata();
    }, [fetchMetadata]);

    return { metadata, loading, updateMetadata, refetch: fetchMetadata };
}
