"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface Announcement {
    id: string;
    content: string;
    created_by_name: string;
    created_at: string;
    is_pinned: boolean;
    is_active: boolean;
}

export function useAnnouncements() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const { role, profile } = useAuth();
    const isAdmin = role === 'admin';

    const fetchAnnouncements = useCallback(async () => {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('is_active', true)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setAnnouncements(data as Announcement[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAnnouncements();
    }, [fetchAnnouncements]);

    // Realtime subscription — all users get instant updates
    useEffect(() => {
        const subscription = supabase
            .channel('announcements-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                fetchAnnouncements();
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [fetchAnnouncements]);

    const createAnnouncement = useCallback(async (content: string) => {
        if (!isAdmin || !content.trim()) return;
        await supabase.from('announcements').insert({
            content: content.trim(),
            created_by_name: profile?.display_name || 'Admin',
        });
    }, [isAdmin, profile?.display_name]);

    const togglePin = useCallback(async (id: string, currentlyPinned: boolean) => {
        if (!isAdmin) return;
        await supabase.from('announcements').update({ is_pinned: !currentlyPinned }).eq('id', id);
    }, [isAdmin]);

    const deleteAnnouncement = useCallback(async (id: string) => {
        if (!isAdmin) return;
        // Soft delete
        await supabase.from('announcements').update({ is_active: false }).eq('id', id);
    }, [isAdmin]);

    return { announcements, loading, isAdmin, createAnnouncement, togglePin, deleteAnnouncement };
}
