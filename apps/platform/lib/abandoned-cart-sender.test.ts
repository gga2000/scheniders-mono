import { describe, it, expect } from "vitest";
import {
    buildCartRecoveryBody,
    sendCartRecoveryMessage,
    CART_RECOVERY_TEMPLATE,
    type RecoverableCart,
} from "./abandoned-cart-sender";

const cart: RecoverableCart = {
    id: "c1",
    phone: "07700000000",
    items: [
        { product_id: "p", name: "Widget", quantity: 2, price: 5000 },
        { product_id: "q", name: "Gizmo", quantity: 1, price: 3000 },
    ],
    subtotal_iqd: 13000,
};

describe("buildCartRecoveryBody", () => {
    it("maps phone, items list, and total", () => {
        const b = buildCartRecoveryBody(cart);
        expect(b.countryCode).toBe("964");
        expect(b.phoneNumber).toBe("7700000000");
        expect(b.template.name).toBe(CART_RECOVERY_TEMPLATE);
        expect(b.template.languageCode).toBe("ar");
        expect(b.template.bodyValues[1]).toBe("Widget × 2، Gizmo");
        expect(b.template.bodyValues[2]).toBe("IQD 13,000");
    });

    it("falls back to the computed subtotal when subtotal_iqd is 0", () => {
        const b = buildCartRecoveryBody({ ...cart, subtotal_iqd: 0 });
        expect(b.template.bodyValues[2]).toBe("IQD 13,000");
    });
});

describe("sendCartRecoveryMessage", () => {
    it("fails fast without an Interakt API key", async () => {
        // INTERAKT_API_KEY is unset in the test environment.
        const r = await sendCartRecoveryMessage(cart);
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/not configured/i);
    });
});
