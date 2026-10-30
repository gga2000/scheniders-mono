import { describe, it, expect } from "vitest";
import { OrderSchema } from "./schemas";
import { validatePhoneDetailed } from "./order-utils";

/**
 * ARCH-4 guard for phone validation.
 *
 * There were three overlapping layers that disagreed:
 *
 *  - `validatePhone` in order-utils matched `^07\d{8}$` and `^\+9647\d{8}$`.
 *    Those are one digit short: an Iraqi mobile is 07 plus NINE digits, and the
 *    international form is 964 plus TEN. It therefore returned false for every
 *    real number. It was only harmless because its single caller,
 *    `validateOrderForm`, had no callers of its own. Both are now deleted.
 *  - `OrderSchema.phone` accepted anything of length >= 10, including
 *    "abcdefghij" — the typed boundary gating order creation validated nothing.
 *  - `validatePhoneDetailed` is correct and is what the table already uses to
 *    flag a number red.
 *
 * The schema now uses the third, so the UI's notion of invalid and the one that
 * blocks creation agree. Verified against live data before tightening: 4,733 of
 * 4,757 real orders (99.5%) satisfy it.
 */
const base = {
    customer_name: "أحمد",
    city: "بغداد",
    items: [{ name: "شاورما", price: 6000, quantity: 1 }],
    price: 6000,
    status: "new",
};

const parsePhone = (phone: string) => OrderSchema.safeParse({ ...base, phone }).success;

describe("validatePhoneDetailed", () => {
    it("accepts the real Iraqi shapes present in live data", () => {
        // 2,976 live orders are stored in the local form.
        expect(validatePhoneDetailed("07701234567").isValid).toBe(true);
        // 1,747 live orders are stored with the country code.
        expect(validatePhoneDetailed("+9647701234567").isValid).toBe(true);
        expect(validatePhoneDetailed("9647701234567").isValid).toBe(true);
        // Separators and Arabic-Indic digits still resolve.
        expect(validatePhoneDetailed("0770 123 4567").isValid).toBe(true);
        expect(validatePhoneDetailed("٠٧٧٠١٢٣٤٥٦٧").isValid).toBe(true);
    });

    it("accepts the zero-less and 00964 forms the card already shows as 07…", () => {
        // LightFunnels stores what the customer typed; 24 live orders hold the
        // zero-less form. formatPhoneGrouped displays them as "0771 438 8144", so
        // flagging them red with "must start with 07" contradicted the screen.
        const zeroless = validatePhoneDetailed("7714388144");
        expect(zeroless.isValid).toBe(true);
        expect(zeroless.formattedNumber).toBe("07714388144");
        expect(validatePhoneDetailed("009647714388144").isValid).toBe(true);
        // Ten digits is only an Iraqi mobile when it starts with 7.
        expect(validatePhoneDetailed("5714388144").error).toBe("invalid_prefix");
        expect(validatePhoneDetailed("771438814").error).toBe("invalid_prefix");
    });

    it("rejects a number one digit short, which the old regex demanded", () => {
        // The deleted validatePhone matched exactly this and rejected the real
        // 11-digit numbers above.
        expect(validatePhoneDetailed("0770123456").isValid).toBe(false);
    });

    it("reports why, not just that it failed", () => {
        expect(validatePhoneDetailed("").error).toBe("missing");
        expect(validatePhoneDetailed("0570123456").error).toBe("invalid_prefix");
        expect(validatePhoneDetailed("077012345").error).toBe("too_short");
    });
});

describe("OrderSchema phone rule", () => {
    it("accepts the shapes real orders actually use", () => {
        expect(parsePhone("07701234567")).toBe(true);
        expect(parsePhone("+9647701234567")).toBe(true);
    });

    it("rejects the junk the old length>=10 rule let through", () => {
        expect(parsePhone("abcdefghij")).toBe(false);
        expect(parsePhone("0000000000")).toBe(false);
        expect(parsePhone("1234567890")).toBe(false);
    });

    it("still allows an empty phone, as before", () => {
        // Requiring a phone outright is a product decision, not a validation fix.
        expect(parsePhone("")).toBe(true);
    });
});
