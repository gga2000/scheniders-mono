"use client";

import { useState } from "react";
import { usePrimeShipments } from "@/hooks/use-prime-shipments";
import { primeEditDiff, type PrimeEditDiff } from "@/lib/prime/edit-diff";
import { primeTakesEdits } from "@/lib/prime/status-map";
import type { Order } from "@/types/order";

interface PrimeEditReviewInput {
    order: Order | null;
    formData: Partial<Order>;
    isEditing: boolean;
    handleSave: () => Promise<void>;
}

/**
 * The save step of an edit to an order Prime is delivering: what Prime will
 * get (the edit queue's own fields), shown before the save so staff see the
 * parcel change too. An edit Prime holds nothing of saves straight away, as
 * does any order without a live Prime parcel.
 */
export function usePrimeEditReview({ order, formData, isEditing, handleSave }: PrimeEditReviewInput) {
    const view = usePrimeShipments().get(order?.id ?? "") ?? null;
    // Tied to the edit it was made for: any later change of the form, or a new edit, drops it.
    const [pending, setPending] = useState<{ diff: PrimeEditDiff; form: Partial<Order> } | null>(null);
    const review = isEditing && pending?.form === formData ? pending.diff : null;

    const requestSave = () => {
        const live = order && view && view.cancelledAt === null && primeTakesEdits(order.status, view.status);
        const diff = live ? primeEditDiff(order, { ...order, ...formData }) : null;
        if (diff) setPending({ diff, form: formData });
        else void handleSave();
    };

    return {
        review,
        view,
        requestSave,
        confirm: () => {
            setPending(null);
            void handleSave();
        },
        back: () => setPending(null),
    };
}

export type PrimeEditReviewState = ReturnType<typeof usePrimeEditReview>;
