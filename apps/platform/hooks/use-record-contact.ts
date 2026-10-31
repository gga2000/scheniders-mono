"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateOrderMutation } from "@/hooks/use-orders-query";
import { followUpStamp, senderDisplayName, type FollowUpKind } from "@/lib/follow-up-state";
import { useLanguage } from "@/components/providers/language-provider";
import { toast } from "@/hooks/use-toast";
import { orderWriteErrorMessage } from "@/lib/order-status-guard";

/**
 * Stamp who contacted the customer onto the order, for sends that never reach
 * the server: the `wa.me` links opened from the card, the details modal and the
 * template panel's "open in WhatsApp" button.
 *
 * Template sends through `/api/webhooks/interakt/send` are stamped by that route
 * from the verified session, so callers must not record those here as well.
 *
 * The write goes through the shared order mutation, so the card updates
 * optimistically and a failure surfaces the same way any other order edit does.
 */
export function useRecordContact() {
    const { profile, user } = useAuth();
    const { t } = useLanguage();
    const { mutate } = useUpdateOrderMutation();

    const name = senderDisplayName(profile, user?.email);
    const avatar = profile?.avatar_url ?? null;

    return useCallback(
        (orderId: string, type: FollowUpKind = "manual") => {
            // No signed-in identity yet (profile still loading): a stamp with no
            // name would render as nobody, so there is nothing worth writing.
            if (!orderId || !name) return;
            mutate(
                { orderId, updates: followUpStamp({ name, avatar }, type) },
                { onError: (err) => toast.error(orderWriteErrorMessage(err, t)) },
            );
        },
        [name, avatar, mutate, t],
    );
}
