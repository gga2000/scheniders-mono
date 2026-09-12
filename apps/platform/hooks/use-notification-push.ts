// apps/platform/hooks/use-notification-push.ts
//
// One switch for web push, covering both halves of what "on" requires.
//
// The bell's old toggle wrote a PREFERENCE row and nothing else, while the only
// code that actually created a browser push subscription lived in the chat
// drawer. A user could therefore turn new-order push on, see it lit, and never
// receive anything — and none of them did: `chat_push_subscriptions` held zero
// rows across every active member.
//
// Push is only genuinely on when BOTH are true: this browser holds a push
// subscription, and the user's `notification_prefs` allow the push channel. This
// hook owns both, and reports why it cannot be enabled rather than showing a lit
// control that does nothing.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useWebPush } from "@/hooks/chat/use-web-push";
import { diag } from "@/lib/diag";

/** Applies to every category; per-category overrides live alongside it. */
const ALL_CATEGORIES = "*";

export type PushAvailability =
    /** Ready to be switched on (or already on). */
    | "ready"
    /** Browser has no service worker / Push API. */
    | "unsupported"
    /** The user denied notification permission at the browser level. */
    | "blocked"
    /** No VAPID key shipped to the client — push cannot work in this build. */
    | "unconfigured"
    /** Still resolving the user/tenant. */
    | "loading";

export interface NotificationPushState {
    /** Push will actually reach this user in this browser. */
    enabled: boolean;
    availability: PushAvailability;
    /** Flip it: subscribes/unsubscribes AND records the preference. */
    toggle: () => void;
    busy: boolean;
    /** Safe to render the control. */
    ready: boolean;
}

export function useNotificationPush(): NotificationPushState {
    const { user, tenantId } = useAuth();
    const qc = useQueryClient();
    const push = useWebPush();

    const key = ["notification-push-pref", user?.id, tenantId] as const;
    const identified = !!user?.id && !!tenantId;

    const { data: prefEnabled = true, isLoading } = useQuery({
        queryKey: key,
        enabled: identified,
        staleTime: 60_000,
        queryFn: async (): Promise<boolean> => {
            if (!user?.id || !tenantId) return true;
            const { data, error } = await supabase
                .from("notification_prefs")
                .select("push")
                .eq("user_id", user.id)
                .eq("tenant_id", tenantId)
                .eq("category", ALL_CATEGORIES)
                .maybeSingle();
            if (error) throw error;
            // No row means nothing has been muted yet.
            return data ? data.push : true;
        },
    });

    const writePref = useMutation({
        mutationFn: async (next: boolean): Promise<void> => {
            if (!user?.id || !tenantId) return;
            const { error } = await supabase.from("notification_prefs").upsert(
                {
                    user_id: user.id,
                    tenant_id: tenantId,
                    category: ALL_CATEGORIES,
                    push: next,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,tenant_id,category" },
            );
            if (error) throw error;
        },
        onMutate: async (next: boolean) => {
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData<boolean>(key);
            qc.setQueryData(key, next);
            return { prev };
        },
        onError: (error, _next, ctx) => {
            if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
            diag.warn(`[push] preference write failed: ${(error as Error).message}`);
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: key });
        },
    });

    const availability: PushAvailability = !push.supported
        ? "unsupported"
        : !push.configured
            ? "unconfigured"
            : push.permission === "denied"
                ? "blocked"
                : !identified || isLoading
                    ? "loading"
                    : "ready";

    // Both halves must hold. A stale preference with no subscription is exactly
    // the state that made the old toggle lie.
    const enabled = push.subscribed && prefEnabled;
    const busy = push.busy || writePref.isPending;

    const toggle = useCallback(() => {
        if (busy || availability === "unsupported" || availability === "unconfigured") return;

        void (async () => {
            if (enabled) {
                await push.disable();
                writePref.mutate(false);
                return;
            }
            // Subscribe first: if the user denies permission there is nothing to
            // record, and recording it anyway would recreate the original lie.
            if (!push.subscribed) await push.enable();
            writePref.mutate(true);
        })();
    }, [busy, availability, enabled, push, writePref]);

    return {
        enabled,
        availability,
        toggle,
        busy,
        ready: identified && availability !== "loading",
    };
}
