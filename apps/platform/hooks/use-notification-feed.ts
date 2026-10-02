// apps/platform/hooks/use-notification-feed.ts
//
// The unified notification feed. Replaces the split between
// `useOrderActivityNotifications` (tenant-wide order activity) and the feed half
// of `useMentionNotifications` (per-recipient chat mentions): both are rows in
// `notifications` now, distinguished by `category`.
//
// Reads go through the `notification_feed` RPC rather than a view. The RPC
// resolves the tenant list and the user's watermark ONCE into locals, which is
// what let the query drop from 506ms (sequential scan over every row) to ~10ms,
// and it takes a `before` cursor so the feed can page past the first screen.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { diag } from "@/lib/diag";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useNotificationChime } from "@/hooks/use-notification-chime";

export type NotificationCategory =
    | "orders"
    | "chat"
    | "inventory"
    | "delivery"
    | "finance"
    | "customer"
    | "team"
    | "system";

export type NotificationFilter = "all" | "unread" | "mentions";

export interface FeedNotification {
    id: string;
    /** Dotted event name, e.g. "order.status_changed", "chat.mention". */
    type: string;
    category: NotificationCategory;
    actor_name: string | null;
    actor_avatar: string | null;
    entity_type: string | null;
    entity_id: string | null;
    /** What the reader recognises the subject by, e.g. "#7388". */
    entity_label: string | null;
    payload: Record<string, unknown>;
    priority: string;
    group_key: string | null;
    created_at: string;
    is_read: boolean;
}

const PAGE_SIZE = 30;

export const notificationKeys = {
    all: ["notifications"] as const,
    feed: (userId: string | undefined, filter: NotificationFilter) =>
        ["notifications", "feed", userId, filter] as const,
    unread: (userId: string | undefined) =>
        ["notifications", "unread", userId] as const,
};

function toFeedNotification(row: Record<string, unknown>): FeedNotification | null {
    const id = row.id;
    const created = row.created_at;
    if (typeof id !== "string" || typeof created !== "string") return null;
    return {
        id,
        type: typeof row.type === "string" ? row.type : "unknown",
        category: (typeof row.category === "string"
            ? row.category
            : "system") as NotificationCategory,
        actor_name: typeof row.actor_name === "string" ? row.actor_name : null,
        actor_avatar: typeof row.actor_avatar === "string" ? row.actor_avatar : null,
        entity_type: typeof row.entity_type === "string" ? row.entity_type : null,
        entity_id: typeof row.entity_id === "string" ? row.entity_id : null,
        entity_label: typeof row.entity_label === "string" ? row.entity_label : null,
        payload:
            row.payload && typeof row.payload === "object"
                ? (row.payload as Record<string, unknown>)
                : {},
        priority: typeof row.priority === "string" ? row.priority : "normal",
        group_key: typeof row.group_key === "string" ? row.group_key : null,
        created_at: created,
        is_read: row.is_read === true,
    };
}

export interface NotificationFeedOptions {
    /**
     * False while the panel is open. A live feed that re-sorts under the cursor
     * is unreadable, so arrivals are counted and held behind a "show new" pill
     * instead of being spliced into the list someone is reading.
     */
    live?: boolean;
    /**
     * The dropdown mounts twice (desktop and mobile bars, both present even when
     * one is CSS-hidden). Only one instance may make a sound, or every
     * notification arrives as a double beat.
     */
    sound?: boolean;
}

export function useNotificationFeed(
    filter: NotificationFilter = "all",
    { live = true, sound = false }: NotificationFeedOptions = {},
) {
    const { user, profile, tenantId } = useAuth();
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const userId = user?.id;
    const feedKey = notificationKeys.feed(userId, filter);
    const unreadKey = notificationKeys.unread(userId);

    // Per-instance channel name: the dropdown mounts in both the desktop and the
    // mobile top bar, and StrictMode double-invokes effects — a static name made
    // realtime-js dedupe to one channel and reject the second `.on()`.
    const instanceId = useId();

    // Read inside the realtime callback; a ref keeps the subscription from being
    // torn down and rebuilt whenever the profile loads.
    const actorNameRef = useRef<string | null>(null);
    actorNameRef.current = profile?.display_name ?? null;

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: feedKey,
        enabled: !!userId,
        staleTime: 30_000,
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }): Promise<FeedNotification[]> => {
            const { data: rows, error } = await supabase.rpc("notification_feed", {
                p_limit: PAGE_SIZE,
                p_before: pageParam,
                p_filter: filter,
            });
            if (error) throw error;
            const raw = (rows ?? []) as unknown as Record<string, unknown>[];
            return raw
                .map(toFeedNotification)
                .filter((n): n is FeedNotification => n !== null);
        },
        // The cursor is the oldest row we've seen; a short page means the end.
        getNextPageParam: (lastPage) =>
            lastPage.length < PAGE_SIZE
                ? undefined
                : lastPage[lastPage.length - 1]?.created_at ?? undefined,
    });

    const notifications = useMemo(
        () => data?.pages.flat() ?? [],
        [data],
    );

    // Counted server-side: deriving it from the loaded pages would silently cap
    // the badge at the page size once paging exists.
    const { data: unreadCount = 0 } = useQuery({
        queryKey: unreadKey,
        enabled: !!userId,
        staleTime: 30_000,
        queryFn: async (): Promise<number> => {
            const { data: count, error } = await supabase.rpc("notification_unread_count");
            if (error) throw error;
            return typeof count === "number" ? count : 0;
        },
    });

    /**
     * Record which language this person reads. The in-app feed renders in the
     * browser's language, but push copy is composed server-side in the edge
     * function, which has no other way to know — so it would otherwise go out in
     * English to everyone.
     */
    useEffect(() => {
        if (!userId || !tenantId) return;
        if (language !== "ar" && language !== "en") return;
        let cancelled = false;
        void (async () => {
            const { error } = await supabase.from("notification_settings").upsert(
                { user_id: userId, tenant_id: tenantId, locale: language },
                { onConflict: "user_id,tenant_id" },
            );
            if (error && !cancelled) {
                diag.warn(`[notifications] locale sync failed: ${error.message}`);
            }
        })();
        return () => { cancelled = true; };
    }, [userId, tenantId, language]);

    const invalidateAll = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    }, [queryClient]);

    const invalidateUnread = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: unreadKey });
    }, [queryClient, unreadKey]);

    // Held arrivals. `heldRef` records that something changed at all (an edit or
    // a dismissal elsewhere, not just an insert); `pendingCount` is what the
    // pill shows, so it only counts genuinely new entries.
    const [pendingCount, setPendingCount] = useState(0);
    const heldRef = useRef(false);
    const liveRef = useRef(live);
    liveRef.current = live;

    const chime = useNotificationChime();
    const soundRef = useRef(sound);
    soundRef.current = sound;

    const refresh = useCallback(() => {
        heldRef.current = false;
        setPendingCount(0);
        invalidateAll();
    }, [invalidateAll]);

    // Closing the panel releases whatever was held while it was open.
    useEffect(() => {
        if (live && heldRef.current) refresh();
    }, [live, refresh]);

    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`notifications:${userId}:${instanceId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "notifications" },
                (payload) => {
                    if (liveRef.current) {
                        invalidateAll();
                    } else {
                        // The badge stays honest even while the list is frozen.
                        heldRef.current = true;
                        invalidateUnread();
                        if (payload.eventType === "INSERT") setPendingCount((c) => c + 1);
                    }

                    // F2. Something urgent shouldn't wait for someone to open the
                    // bell. RLS already filtered this event to what this user may
                    // see, so anything arriving here is theirs.
                    if (payload.eventType !== "INSERT") return;
                    const row = payload.new as Record<string, unknown> | null;
                    if (!row) return;

                    // Don't announce someone's own action back at them.
                    const isOwnAction =
                        typeof row.actor_name === "string"
                        && row.actor_name === actorNameRef.current;

                    if (soundRef.current) {
                        chime({
                            category: typeof row.category === "string" ? row.category : "system",
                            priority: typeof row.priority === "string" ? row.priority : "normal",
                            isOwnAction,
                        });
                    }

                    if (row.priority !== "urgent" || isOwnAction) return;
                    toast.warning(
                        t("notifications.urgentToast", "Something needs attention"),
                        typeof row.entity_label === "string" ? row.entity_label : undefined,
                    );
                },
            )
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(
                        `[notifications] channel ${status}${err ? ` ${err.message}` : ""}`,
                    );
                }
            });
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [userId, instanceId, invalidateAll, invalidateUnread, chime, t]);

    /**
     * Acting on a row edits the loaded pages in place. Refetching instead would
     * re-run every page the reader has scrolled through and rebuild the list
     * under their cursor, which is exactly the churn the freeze is there to
     * prevent — and the outcome of these two mutations is already known.
     */
    const patchFeed = useCallback(
        (fn: (n: FeedNotification) => FeedNotification | null) => {
            queryClient.setQueryData<InfiniteData<FeedNotification[], string | null>>(
                feedKey,
                (current) =>
                    current && {
                        ...current,
                        pages: current.pages.map((page) =>
                            page.map(fn).filter((n): n is FeedNotification => n !== null),
                        ),
                    },
            );
        },
        [queryClient, feedKey],
    );

    const dropUnread = useCallback(() => {
        queryClient.setQueryData<number>(unreadKey, (c) => Math.max(0, (c ?? 0) - 1));
    }, [queryClient, unreadKey]);

    const markRead = useMutation({
        onMutate: (id: string) => {
            let wasUnread = false;
            patchFeed((n) => {
                if (n.id !== id) return n;
                wasUnread = !n.is_read;
                return { ...n, is_read: true };
            });
            if (wasUnread) dropUnread();
        },
        mutationFn: async (id: string) => {
            if (!userId) return;
            const { error } = await supabase.from("notification_user_state").upsert(
                { notification_id: id, user_id: userId, read_at: new Date().toISOString() },
                { onConflict: "notification_id,user_id" },
            );
            if (error) throw error;
        },
        onError: (error) => {
            diag.warn(`[notifications] mark read failed: ${(error as Error).message}`);
            toast.error(t("notifications.markReadFailed", "Couldn't mark as read"));
            // The optimistic edit was wrong; put the server's answer back.
            invalidateAll();
        },
        onSettled: invalidateUnread,
    });

    const dismissOne = useMutation({
        onMutate: (id: string) => {
            let wasUnread = false;
            patchFeed((n) => {
                if (n.id !== id) return n;
                wasUnread = !n.is_read;
                return null;
            });
            if (wasUnread) dropUnread();
        },
        mutationFn: async (id: string) => {
            if (!userId) return;
            const now = new Date().toISOString();
            const { error } = await supabase.from("notification_user_state").upsert(
                { notification_id: id, user_id: userId, read_at: now, dismissed_at: now },
                { onConflict: "notification_id,user_id" },
            );
            if (error) throw error;
        },
        onError: (error) => {
            diag.warn(`[notifications] dismiss failed: ${(error as Error).message}`);
            toast.error(t("notifications.dismissFailed", "Couldn't dismiss that notification"));
            // The row is gone from the list but not from the server; put it back.
            invalidateAll();
        },
        onSettled: invalidateUnread,
    });

    /**
     * Bulk actions set a per-user watermark server-side. Acting on the loaded
     * page only would clear one screen of a long backlog; stamping the time in
     * the browser would let a fast clock swallow genuinely new notifications.
     */
    const bulk = useMutation({
        mutationFn: async (op: "clear" | "read") => {
            const { error } = await supabase.rpc(
                op === "clear" ? "clear_notification_feed" : "mark_notifications_read",
            );
            if (error) throw error;
        },
        onError: (error, op) => {
            diag.warn(`[notifications] ${op} failed: ${(error as Error).message}`);
            toast.error(
                op === "clear"
                    ? t("notifications.clearFailed", "Couldn't clear notifications")
                    : t("notifications.markReadFailed", "Couldn't mark as read"),
            );
        },
        onSettled: invalidateAll,
    });

    return {
        notifications,
        unreadCount,
        /** Arrivals held back while the panel is open. */
        pendingCount,
        /** Pull the held arrivals in — and whatever else changed meanwhile. */
        refresh,
        isLoading,
        hasMore: !!hasNextPage,
        isLoadingMore: isFetchingNextPage,
        loadMore: () => void fetchNextPage(),
        markAsRead: (id: string) => markRead.mutate(id),
        dismiss: (id: string) => dismissOne.mutate(id),
        markAllAsRead: () => bulk.mutate("read"),
        clearAll: () => bulk.mutate("clear"),
    };
}
