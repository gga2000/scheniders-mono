// apps/platform/hooks/use-order-push-pref.ts
//
// Per-user toggle for NEW-ORDER web push, independent of chat push. Stored in
// chat_notification_prefs under a synthetic kind 'order_alert' (level 'all' =
// on, 'none' = off; no row = on by default). The send-order-push edge function
// honours the same row. Self-RLS on chat_notification_prefs lets the user write
// their own pref directly — no API route needed.

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

const ORDER_ALERT_KIND = "order_alert";

export interface OrderPushPref {
    /** Whether new-order web push is enabled for this user (default true). */
    enabled: boolean;
    /** Flip the preference (optimistic). */
    toggle: () => void;
    /** A write is in flight. */
    busy: boolean;
    /** user + tenant resolved — safe to render the control. */
    ready: boolean;
}

export function useOrderPushPref(): OrderPushPref {
    const { user, tenantId } = useAuth();
    const qc = useQueryClient();
    const key = ["order-push-pref", user?.id, tenantId] as const;
    const ready = !!user?.id && !!tenantId;

    const { data: enabled = true } = useQuery({
        queryKey: key,
        enabled: ready,
        staleTime: 60_000,
        queryFn: async (): Promise<boolean> => {
            if (!user?.id || !tenantId) return true;
            const { data, error } = await supabase
                .from("chat_notification_prefs")
                .select("level")
                .eq("user_id", user.id)
                .eq("tenant_id", tenantId)
                .eq("kind", ORDER_ALERT_KIND)
                .maybeSingle();
            if (error) throw error;
            return data ? data.level !== "none" : true;
        },
    });

    const mutation = useMutation({
        mutationFn: async (next: boolean): Promise<void> => {
            if (!user?.id || !tenantId) return;
            const { error } = await supabase.from("chat_notification_prefs").upsert(
                {
                    user_id: user.id,
                    tenant_id: tenantId,
                    kind: ORDER_ALERT_KIND,
                    level: next ? "all" : "none",
                },
                { onConflict: "user_id,tenant_id,kind" },
            );
            if (error) throw error;
        },
        onMutate: async (next: boolean) => {
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData<boolean>(key);
            qc.setQueryData(key, next);
            return { prev };
        },
        onError: (_e, _next, ctx) => {
            if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: key });
        },
    });

    const toggle = useCallback(() => mutation.mutate(!enabled), [mutation, enabled]);

    return { enabled, toggle, busy: mutation.isPending, ready };
}
