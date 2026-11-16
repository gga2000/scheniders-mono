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
        expect(suggestedTopup(9000, 0)).toBe(9000);
        expect(suggestedTopup(9000, 1200)).toBe(8000);
        expect(suggestedTopup(9000, 8500)).toBe(1000);
        expect(suggestedTopup(9000, 9000)).toBeNull();
        expect(suggestedTopup(9000, 12_000)).toBeNull();
        expect(suggestedTopup(null, 0)).toBeNull();
    });
});
