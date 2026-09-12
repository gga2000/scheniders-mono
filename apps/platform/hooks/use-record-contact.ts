"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateOrderMutation } from "@/hooks/use-orders-query";
import type { FollowUpKind } from "@/lib/follow-up-state";

/**
 * Stamp who contacted the customer onto the order.
 *
 * Every WhatsApp entry point goes through here — the template panel, the card's
 * chat buttons, the details modal — so the card's badge reflects *any* contact,
 * not only the templated follow-ups. A manual send used to leave no trace at all,
 * which made the hours-passed cue keep nagging for work someone had already done.
 *
 * Bookkeeping must never surface as a send failure: the message is already gone
 * by the time this runs, so errors are logged, not thrown.
 */
export function useRecordContact() {
    const { profile } = useAuth();
    const updateOrder = useUpdateOrderMutation();

    return useCallback(
        (orderId: string, type: FollowUpKind = "manual") => {
            if (!orderId) return;
            try {
                updateOrder.mutate({
                    orderId,
                    updates: {
                        last_followup_by_name: profile?.display_name ?? undefined,
                        last_followup_by_avatar: profile?.avatar_url ?? undefined,
                        last_followup_at: new Date().toISOString(),
                        last_followup_type: type,
                    },
                });
            } catch (err) {
                console.error("[useRecordContact] Failed to record contact:", err);
            }
        },
        [profile?.display_name, profile?.avatar_url, updateOrder],
    );
}
