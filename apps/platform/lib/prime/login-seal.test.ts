import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPrimePassword, PrimeLoginSealError, sealPrimePassword } from "./login-seal";

const KEY = randomBytes(32);
const STORE = "11111111-1111-4111-8111-111111111111";

describe("Prime password seal", () => {
    it("opens what it sealed, and never stores the password in the clear", () => {
        const sealed = sealPrimePassword("كلمة-سر-123", STORE, KEY);
        expect(sealed.startsWith("v1.")).toBe(true);
        expect(sealed).not.toContain("123");
        expect(openPrimePassword(sealed, STORE, KEY)).toBe("كلمة-سر-123");
    });

    it("a fresh IV each time: the same password seals differently", () => {
        expect(sealPrimePassword("secret1", STORE, KEY)).not.toBe(sealPrimePassword("secret1", STORE, KEY));
    });

    it("refuses another store's row, another key, and changed bytes", () => {
        const sealed = sealPrimePassword("secret1", STORE, KEY);
        expect(() => openPrimePassword(sealed, "22222222-2222-4222-8222-222222222222", KEY)).toThrow(PrimeLoginSealError);
        expect(() => openPrimePassword(sealed, STORE, randomBytes(32))).toThrow(PrimeLoginSealError);
        const flipped = `${sealed.slice(0, -2)}${sealed.endsWith("A") ? "B" : "A"}${sealed.slice(-1)}`;
        expect(() => openPrimePassword(flipped, STORE, KEY)).toThrow(PrimeLoginSealError);
        expect(() => openPrimePassword("plain", STORE, KEY)).toThrow(PrimeLoginSealError);
    });
});
