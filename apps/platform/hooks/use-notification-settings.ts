// apps/platform/hooks/use-notification-settings.ts
//
// Everything a person can decide about their own notifications: which
// categories reach them on which channel, when to stay quiet, whether to batch,
// and which individual orders to stop hearing about.
//
// All four resolve through one SQL gate (`notification_channel_enabled`), so the
// settings here and what the dispatcher actually does cannot drift apart.

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { diag } from "@/lib/diag";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

/** Categories a person can tune. `*` is the fallback for anything unlisted. */
export const NOTIFICATION_CATEGORIES = [
    "orders",
    "chat",
    "inventory",
    "delivery",
    "finance",
    "customer",
    "team",
] as const;

export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationChannel = "in_app" | "push" | "sound";
export type DigestMode = "off" | "hourly" | "daily";

export interface CategoryPref {
    in_app: boolean;
    push: boolean;
    sound: boolean;
}

export interface QuietHours {
    enabled: boolean;
    /** Minutes from local midnight; start > end means the window wraps midnight. */
    start: number;
    end: number;
}

const DEFAULT_PREF: CategoryPref = { in_app: true, push: true, sound: true };

export const settingsKeys = {
    prefs: (u?: string, t?: string | null) => ["notification-prefs", u, t] as const,
    settings: (u?: string, t?: string | null) => ["notification-settings", u, t] as const,
};

export function useNotificationSettings() {
    const { user, tenantId } = useAuth();
    const { t } = useLanguage();
    const qc = useQueryClient();
    const enabled = !!user?.id && !!tenantId;

    const prefsKey = settingsKeys.prefs(user?.id, tenantId);
    const settingsKey = settingsKeys.settings(user?.id, tenantId);

    const { data: prefRows = [] } = useQuery({
        queryKey: prefsKey,
        enabled,
        staleTime: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("notification_prefs")
                .select("category,in_app,push,sound")
                .eq("user_id", user!.id)
                .eq("tenant_id", tenantId!);
            if (error) throw error;
            return data ?? [];
        },
    });

    const { data: settings } = useQuery({
        queryKey: settingsKey,
        enabled,
        staleTime: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("notification_settings")
                .select("quiet_hours_enabled,quiet_start,quiet_end,digest_mode")
                .eq("user_id", user!.id)
                .eq("tenant_id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    /** Category -> effective preference, falling back to `*` then to all-on. */
    const prefs = useMemo(() => {
        const byCategory = new Map(prefRows.map((r) => [r.category, r]));
        const fallback = byCategory.get("*");
        const resolve = (category: string): CategoryPref => {
            const row = byCategory.get(category) ?? fallback;
            return row
                ? { in_app: row.in_app, push: row.push, sound: row.sound }
                : DEFAULT_PREF;
        };
        return Object.fromEntries(
            NOTIFICATION_CATEGORIES.map((c) => [c, resolve(c)]),
        ) as Record<NotificationCategoryKey, CategoryPref>;
    }, [prefRows]);

    const quietHours: QuietHours = {
        enabled: settings?.quiet_hours_enabled ?? false,
        start: settings?.quiet_start ?? 1320,
        end: settings?.quiet_end ?? 420,
    };
    const digestMode = (settings?.digest_mode ?? "off") as DigestMode;

    const fail = useCallback(
        (error: unknown) => {
            diag.warn(`[notifications] settings write failed: ${(error as Error).message}`);
            toast.error(t("notifications.settingsSaveFailed", "Couldn't save that setting"));
        },
        [t],
    );

    const setChannel = useMutation({
        mutationFn: async (input: {
            category: NotificationCategoryKey;
            channel: NotificationChannel;
            value: boolean;
        }) => {
            if (!enabled) return;
            const current = prefs[input.category];
            const { error } = await supabase.from("notification_prefs").upsert(
                {
                    user_id: user!.id,
                    tenant_id: tenantId!,
                    category: input.category,
                    ...current,
                    [input.channel]: input.value,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,tenant_id,category" },
            );
            if (error) throw error;
        },
        onMutate: async (input) => {
            await qc.cancelQueries({ queryKey: prefsKey });
            const previous = qc.getQueryData(prefsKey);
            qc.setQueryData(prefsKey, (old: typeof prefRows | undefined) => {
                const rows = [...(old ?? [])];
                const idx = rows.findIndex((r) => r.category === input.category);
                const base = idx >= 0 ? rows[idx] : { category: input.category, ...prefs[input.category] };
                const next = { ...base, [input.channel]: input.value };
                if (idx >= 0) rows[idx] = next;
                else rows.push(next);
                return rows;
            });
            return { previous };
        },
        onError: (error, _input, ctx) => {
            if (ctx?.previous) qc.setQueryData(prefsKey, ctx.previous);
            fail(error);
        },
        onSettled: () => void qc.invalidateQueries({ queryKey: prefsKey }),
    });

    const saveSettings = useMutation({
        mutationFn: async (patch: Partial<{
            quiet_hours_enabled: boolean;
            quiet_start: number;
            quiet_end: number;
            digest_mode: DigestMode;
        }>) => {
            if (!enabled) return;
            const { error } = await supabase.from("notification_settings").upsert(
                {
                    user_id: user!.id,
                    tenant_id: tenantId!,
                    quiet_hours_enabled: quietHours.enabled,
                    quiet_start: quietHours.start,
                    quiet_end: quietHours.end,
                    digest_mode: digestMode,
                    ...patch,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,tenant_id" },
            );
            if (error) throw error;
        },
        onError: fail,
        onSettled: () => void qc.invalidateQueries({ queryKey: settingsKey }),
    });

    return {
        prefs,
        quietHours,
        digestMode,
        ready: enabled,
        busy: setChannel.isPending || saveSettings.isPending,
        setChannel: (
            category: NotificationCategoryKey,
            channel: NotificationChannel,
            value: boolean,
        ) => setChannel.mutate({ category, channel, value }),
        setQuietHours: (patch: Partial<QuietHours>) =>
            saveSettings.mutate({
                ...(patch.enabled !== undefined ? { quiet_hours_enabled: patch.enabled } : {}),
                ...(patch.start !== undefined ? { quiet_start: patch.start } : {}),
                ...(patch.end !== undefined ? { quiet_end: patch.end } : {}),
            }),
        setDigestMode: (mode: DigestMode) => saveSettings.mutate({ digest_mode: mode }),
    };
}

/**
 * Mute one order (or conversation) without muting its whole category. Existing
 * feed entries stay — muting silences what comes NEXT, it is not a delete.
 */
export function useNotificationMute() {
    const { user, tenantId } = useAuth();
    const { t } = useLanguage();
    const qc = useQueryClient();

    const mute = useMutation({
        mutationFn: async (input: { entityType: string; entityId: string }) => {
            if (!user?.id || !tenantId) return;
            const { error } = await supabase.from("notification_mutes").upsert(
                {
                    user_id: user.id,
                    tenant_id: tenantId,
                    entity_type: input.entityType,
                    entity_id: input.entityId,
                },
                { onConflict: "user_id,entity_type,entity_id" },
            );
            if (error) throw error;
        },
        onError: (error) => {
            diag.warn(`[notifications] mute failed: ${(error as Error).message}`);
            toast.error(t("notifications.muteFailed", "Couldn't mute that"));
        },
        onSuccess: () => {
            toast.success(t("notifications.muted", "Muted — you won't get further updates"));
            void qc.invalidateQueries({ queryKey: ["notifications"] });
        },
    });

    return { mute: (entityType: string, entityId: string) => mute.mutate({ entityType, entityId }) };
}
