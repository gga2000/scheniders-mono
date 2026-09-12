// =============================================
// WHATSAPP CONTACT SLOT
//
// An order carries two numbers. `whatsapp_contact_slot` records which one the
// customer actually asked to be reached on — not a guess, a stated preference.
// Everything that renders or swaps those two numbers goes through here so the
// designation can never drift from the number it points at.
// =============================================

import type { Order } from "@/types/order";

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

/** Convenience for callers holding a full Order. */
export function orderWhatsAppNumber(order: Order): string | undefined {
    return whatsappNumber(order as OrderPhones);
}
