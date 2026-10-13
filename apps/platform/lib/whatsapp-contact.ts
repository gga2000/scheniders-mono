// =============================================
// WHATSAPP CONTACT SLOT
//
// An order carries two numbers. `whatsapp_contact_slot` records which one the
// customer actually asked to be reached on — not a guess, a stated preference.
// Everything that renders or swaps those two numbers goes through here so the
// designation can never drift from the number it points at.
// =============================================


export type WhatsAppSlot = "primary" | "secondary";

export interface OrderPhones {
    phone: string;
    secondary_phone?: string | null;
    whatsapp_contact_slot?: WhatsAppSlot | null;
}

/** The number the customer asked to be contacted on, or undefined if never stated. */
export function whatsappNumber(order: OrderPhones): string | undefined {
    if (order.whatsapp_contact_slot === "primary") return order.phone || undefined;
    if (order.whatsapp_contact_slot === "secondary") return order.secondary_phone || undefined;
    return undefined;
}

/** True when `slot` is the customer's stated WhatsApp line for this order. */
export function isWhatsAppSlot(order: OrderPhones, slot: WhatsAppSlot): boolean {
    if (order.whatsapp_contact_slot !== slot) return false;
    // A designation pointing at an empty number is meaningless — treat it as unset
    // rather than painting an empty field green.
    return !!(slot === "primary" ? order.phone : order.secondary_phone);
}

/**
 * Swap the two numbers, carrying the designation with the number it points at.
 *
 * Without the flip, swapping would silently re-point "contact me here" at the
 * other person's phone — the exact mistake this feature exists to prevent.
 */
export function swapPhones<T extends OrderPhones>(order: T): Pick<OrderPhones, "phone" | "secondary_phone" | "whatsapp_contact_slot"> {
    const promoted = (order.secondary_phone || "").trim();
    const demoted = (order.phone || "").trim();

    // With nothing in the secondary slot the swap would blank `phone`, which is
    // NOT NULL in the database. A swap with nothing to swap is a no-op.
    if (!promoted) {
        return {
            phone: demoted,
            secondary_phone: order.secondary_phone ?? null,
            whatsapp_contact_slot: order.whatsapp_contact_slot ?? null,
        };
    }

    return {
        phone: promoted,
        secondary_phone: demoted,
        // The designation follows the *number*, not the slot: whoever the customer
        // told us to call is still that same line after the swap.
        whatsapp_contact_slot:
            order.whatsapp_contact_slot === "primary"
                ? "secondary"
                : order.whatsapp_contact_slot === "secondary"
                    ? "primary"
                    : null,
    };
}

/**
 * Keep the designation consistent with the numbers after an edit. Clearing the
 * secondary number while it was the WhatsApp line must drop the designation, or
 * the save fails the `orders_whatsapp_slot_has_number_check` constraint.
 */
export function normalizeWhatsAppSlot(next: OrderPhones): WhatsAppSlot | null {
    const slot = next.whatsapp_contact_slot ?? null;
    if (slot === "secondary" && !(next.secondary_phone || "").trim()) return null;
    if (slot === "primary" && !(next.phone || "").trim()) return null;
    return slot;
}

/**
 * The designation a details-form save should write, or `undefined` to leave the
 * column alone.
 *
 * `saved.whatsapp_contact_slot === undefined` means the row was read without the
 * column, so the stored value is unknown: an untouched designation is then left
 * as it is rather than overwritten with a guess. A touched one is always written,
 * normalized against the numbers being saved, and a known designation whose
 * number was cleared is dropped so the write passes
 * `orders_whatsapp_slot_has_number_check`.
 */
export function slotToSave(saved: OrderPhones, edits: Partial<OrderPhones>): WhatsAppSlot | null | undefined {
    const touched = "whatsapp_contact_slot" in edits;
    if (!touched && saved.whatsapp_contact_slot === undefined) return undefined;

    const next = normalizeWhatsAppSlot({
        phone: edits.phone ?? saved.phone,
        secondary_phone: edits.secondary_phone ?? saved.secondary_phone,
        whatsapp_contact_slot: touched ? edits.whatsapp_contact_slot : saved.whatsapp_contact_slot,
    });
    if (touched) return next;
    return next === (saved.whatsapp_contact_slot ?? null) ? undefined : next;
}
