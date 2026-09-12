import { describe, it, expect } from "vitest";
import {
    whatsappNumber,
    isWhatsAppSlot,
    swapPhones,
    normalizeWhatsAppSlot,
    type OrderPhones,
} from "./whatsapp-contact";

const PRIMARY = "07802301677";
const SECONDARY = "07811262261";

function phones(overrides: Partial<OrderPhones> = {}): OrderPhones {
    return { phone: PRIMARY, secondary_phone: SECONDARY, ...overrides };
}

describe("whatsappNumber", () => {
    it("returns nothing when the customer never stated a preference", () => {
        expect(whatsappNumber(phones())).toBeUndefined();
    });

    it("resolves each slot to its number", () => {
        expect(whatsappNumber(phones({ whatsapp_contact_slot: "primary" }))).toBe(PRIMARY);
        expect(whatsappNumber(phones({ whatsapp_contact_slot: "secondary" }))).toBe(SECONDARY);
    });

    it("returns nothing when the designated slot is empty", () => {
        expect(
            whatsappNumber({ phone: PRIMARY, secondary_phone: "", whatsapp_contact_slot: "secondary" }),
        ).toBeUndefined();
    });
});

describe("isWhatsAppSlot", () => {
    it("marks only the designated slot", () => {
        const order = phones({ whatsapp_contact_slot: "secondary" });
        expect(isWhatsAppSlot(order, "secondary")).toBe(true);
        expect(isWhatsAppSlot(order, "primary")).toBe(false);
    });

    it("never marks a slot with no number behind it", () => {
        const order: OrderPhones = { phone: PRIMARY, secondary_phone: null, whatsapp_contact_slot: "secondary" };
        expect(isWhatsAppSlot(order, "secondary")).toBe(false);
    });
});

describe("swapPhones", () => {
    it("exchanges the two numbers", () => {
        const result = swapPhones(phones());
        expect(result.phone).toBe(SECONDARY);
        expect(result.secondary_phone).toBe(PRIMARY);
    });

    it("carries the designation with the number, not the slot", () => {
        // The customer said "reach me on the secondary" — after the swap that same
        // number is the primary, so the designation must follow it.
        const result = swapPhones(phones({ whatsapp_contact_slot: "secondary" }));
        expect(result.phone).toBe(SECONDARY);
        expect(result.whatsapp_contact_slot).toBe("primary");
        expect(whatsappNumber({ ...result })).toBe(SECONDARY);
    });

    it("keeps an unset designation unset", () => {
        expect(swapPhones(phones()).whatsapp_contact_slot).toBeNull();
    });

    it("is a no-op when there is no secondary to promote", () => {
        // `orders.phone` is NOT NULL — swapping into an empty secondary would
        // blank the only number the order has.
        const result = swapPhones({ phone: PRIMARY, secondary_phone: "", whatsapp_contact_slot: "primary" });
        expect(result.phone).toBe(PRIMARY);
        expect(result.whatsapp_contact_slot).toBe("primary");
    });

    it("treats a whitespace-only secondary as empty", () => {
        const result = swapPhones({ phone: PRIMARY, secondary_phone: "   " });
        expect(result.phone).toBe(PRIMARY);
    });
});

describe("normalizeWhatsAppSlot", () => {
    it("drops a secondary designation when the number is cleared", () => {
        // Otherwise the save trips orders_whatsapp_slot_has_number_check.
        expect(
            normalizeWhatsAppSlot({ phone: PRIMARY, secondary_phone: "", whatsapp_contact_slot: "secondary" }),
        ).toBeNull();
    });

    it("keeps a valid designation", () => {
        expect(normalizeWhatsAppSlot(phones({ whatsapp_contact_slot: "secondary" }))).toBe("secondary");
    });

    it("returns null when nothing was designated", () => {
        expect(normalizeWhatsAppSlot(phones())).toBeNull();
    });
});
