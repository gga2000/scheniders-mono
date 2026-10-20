"use client";

import { useState, useEffect, useCallback, useId } from "react";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";
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

export interface AnnouncementInsert {
    tenant_id: string;
    content: string;
    created_by_name: string;
}

/**
 * Build the row for a new announcement, or null if it must not be written.
 *
 * `announcements.tenant_id` has no database default and RLS checks it, so an
 * insert without one is rejected with 42501. Returning null (rather than an
 * incomplete row) keeps that failure out of the network entirely. Pinned by
 * use-announcements.test.ts — see REL-D1.
 */
export function buildAnnouncementInsert(
    content: string,
    tenantId: string | null,
    displayName: string | null | undefined,
): AnnouncementInsert | null {
    const trimmed = content.trim();
    if (!trimmed || !tenantId) return null;
    return {
        tenant_id: tenantId,
        content: trimmed,
        created_by_name: displayName || "Admin",
    };
}

export function useAnnouncements() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { role, profile, tenantId } = useAuth();
    const isAdmin = role === 'admin';
    // Per-instance channel name so a remount/double-mount doesn't hand back an
    // already-subscribed channel (which makes `.on()` throw "after subscribe()").
    const instanceId = useId();

    const fetchAnnouncements = useCallback(async () => {
        const { data, error: fetchError } = await supabase
            .from('announcements')
            .select('*')
            .eq('is_active', true)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);

        // A failed read must not render as "no announcements" — an empty list is
        // a fact, a failure is not.
        if (fetchError) {
            Sentry.captureException(fetchError, { tags: { area: "dashboard", op: "announcements.read" } });
            setError(fetchError.message);
        } else {
            setError(null);
            setAnnouncements((data ?? []) as Announcement[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAnnouncements();
    }, [fetchAnnouncements]);

    // Realtime subscription — all users get instant updates
    useEffect(() => {
        const subscription = supabase
            .channel(`announcements-changes:${instanceId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                fetchAnnouncements();
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [fetchAnnouncements, instanceId]);

    /** Returns true only when the row was actually written — callers keep the
     *  admin's typed draft on false rather than clearing it (REL-D1). */
    const createAnnouncement = useCallback(async (content: string): Promise<boolean> => {
        if (!isAdmin) return false;
        const row = buildAnnouncementInsert(content, tenantId, profile?.display_name);
        if (!row) {
            if (content.trim()) toast.error("No active store selected");
            return false;
        }
        const { error: insertError } = await supabase.from('announcements').insert(row);
        if (insertError) {
            Sentry.captureException(insertError, { tags: { area: "dashboard", op: "announcements.create" } });
            toast.error(`Could not post announcement: ${insertError.message}`);
            return false;
        }
        await fetchAnnouncements();
        return true;
    }, [isAdmin, profile?.display_name, tenantId, fetchAnnouncements]);

    const togglePin = useCallback(async (id: string, currentlyPinned: boolean) => {
        if (!isAdmin) return;
        const { error: pinError } = await supabase
            .from('announcements')
            .update({ is_pinned: !currentlyPinned })
            .eq('id', id);
        if (pinError) {
            Sentry.captureException(pinError, { tags: { area: "dashboard", op: "announcements.pin" } });
            toast.error(`Could not update announcement: ${pinError.message}`);
            return;
        }
        await fetchAnnouncements();
    }, [isAdmin, fetchAnnouncements]);

    const deleteAnnouncement = useCallback(async (id: string) => {
        if (!isAdmin) return;
        // Soft delete
        const { error: deleteError } = await supabase
            .from('announcements')
            .update({ is_active: false })
            .eq('id', id);
        if (deleteError) {
            Sentry.captureException(deleteError, { tags: { area: "dashboard", op: "announcements.delete" } });
            toast.error(`Could not delete announcement: ${deleteError.message}`);
            return;
        }
        await fetchAnnouncements();
    }, [isAdmin, fetchAnnouncements]);

    return { announcements, loading, error, isAdmin, createAnnouncement, togglePin, deleteAnnouncement };
}
