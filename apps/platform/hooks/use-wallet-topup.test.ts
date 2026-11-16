// @vitest-environment node
// Node's own Blob and WebCrypto, as in the browser: under jsdom the Blob comes
// from another realm, and Node 20's WebCrypto refuses its ArrayBuffer.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));

const { receiptSha256, suggestedTopup } = await import("./use-wallet-topup");

describe("receiptSha256", () => {
    it("hashes the receipt file so staff see the same file sent twice", async () => {
        expect(await receiptSha256(new Blob(["abc"]))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(await receiptSha256(new Blob(["abc"]))).toBe(await receiptSha256(new Blob(["a", "bc"])));
        expect(await receiptSha256(new Blob(["abd"]))).not.toBe(await receiptSha256(new Blob(["abc"])));
    });
});

describe("suggestedTopup", () => {
    it("suggests what the plan still needs, in whole thousands, never below the smallest top-up", () => {
        expect(suggestedTopup(9000, 0)).toEqual({ amount: 9000, covers: "plan" });
        expect(suggestedTopup(9000, 1200)).toEqual({ amount: 8000, covers: "plan" });
        expect(suggestedTopup(9000, 8500)).toEqual({ amount: 1000, covers: "plan" });
        expect(suggestedTopup(9000, 9000)).toBeNull();
        expect(suggestedTopup(9000, 12_000)).toBeNull();
        expect(suggestedTopup(null, 0)).toBeNull();
    });

    it("adds a month of the shop's spend from its last 7 days", () => {
        // 9,000 plan + 30 x 900 a day - 5,000 in the wallet = 31,000.
        expect(suggestedTopup(9000, 5000, 900)).toEqual({ amount: 31_000, covers: "month" });
        // Rounded up to the next thousand.
        expect(suggestedTopup(9000, 0, 1186)).toEqual({ amount: 45_000, covers: "month" });
        // A wallet that already holds the plan and a month of spend needs nothing.
        expect(suggestedTopup(9000, 40_000, 1000)).toBeNull();
        // No spend (a trial, a new shop) is the plan alone.
        expect(suggestedTopup(9000, 0, 0)).toEqual({ amount: 9000, covers: "plan" });
        expect(suggestedTopup(9000, 0, null)).toEqual({ amount: 9000, covers: "plan" });
    });

    it("never suggests more than one top-up may carry", () => {
        expect(suggestedTopup(9000, 0, 1_000_000)).toEqual({ amount: 10_000_000, covers: "month" });
    });
});
