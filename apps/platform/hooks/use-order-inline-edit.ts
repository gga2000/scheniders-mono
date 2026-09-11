"use client";

import { useCallback } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { validatePhoneDetailed } from "@/lib/order-utils";

/**
 * The fields an operator can correct without opening the order modal.
 *
 * These are the four that a courier call turns up wrong — a misheard name, a
 * digit off in the phone, the wrong district, a missing landmark — and all four
 * are already visible on the row or the card being corrected.
 */
export const INLINE_EDITABLE_FIELDS = [
    "customer_name",
    "phone",
    "city",
    "address_details",
] as const;

export type InlineEditableField = (typeof INLINE_EDITABLE_FIELDS)[number];

/**
 * Rejects a value before it is written, per field.
 *
 * A phone is the one field where a typo silently costs a delivery, so it is
 * checked before the save rather than flagged red afterwards.
 */
export function inlineFieldValidator(
    field: InlineEditableField,
): ((value: string) => string | null) | undefined {
    if (field === "phone") {
        return (value) =>
            validatePhoneDetailed(value).isValid ? null : "That is not a valid Iraqi phone number";
    }
    if (field === "customer_name") {
        return (value) => (value.trim().length === 0 ? "A customer name is required" : null);
    }
    return undefined;
}

/**
 * Inline editing of an order, shared by the table and the card/grid views.
 *
 * WF-4: the table took `updateOrder` as an optional prop and used it as
 * `onSave={updateOrder!}`, but the one place that renders the table never passed
 * it — so every inline edit called `undefined`, and the operator got "Could not
 * save" on a field the UI invited them to edit. Reading the mutation from the
 * orders context instead of threading it through props is what makes that
 * impossible; there is no prop left to forget.
 */
export function useOrderInlineEdit() {
    const { updateOrder } = useOrdersContext();
    const editingCell = useOrderStore((s) => s.editingCell);
    const setEditingCell = useOrderStore((s) => s.setEditingCell);

    const isEditing = useCallback(
        (orderId: string, field: InlineEditableField) =>
            editingCell?.orderId === orderId && editingCell?.field === field,
        [editingCell],
    );

    const startEdit = useCallback(
        (orderId: string, field: InlineEditableField) => setEditingCell({ orderId, field }),
        [setEditingCell],
    );

    const stopEdit = useCallback(() => setEditingCell(null), [setEditingCell]);

    /**
     * `updateOrder` reports failure by returning `{ success: false }` rather than
     * throwing, so a save that failed used to close the editor and toast
     * "Updated". Turning that into a throw is what lets the cell keep the typed
     * value and show the real reason.
     */
    const saveField = useCallback(
        async (orderId: string, update: Record<string, string>) => {
            const result = await updateOrder(orderId, update);
            if (!result?.success) {
                throw new Error(result?.error || "The order could not be updated");
            }
            return result;
        },
        [updateOrder],
    );

    return { isEditing, startEdit, stopEdit, saveField };
}
