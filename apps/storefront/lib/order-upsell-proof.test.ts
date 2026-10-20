import { describe, expect, it } from "vitest";
import { signPreviewToken, verifyPreviewToken } from "@scheniders/shared/preview-token";
import { signUpsellProof, UPSELL_WINDOW_MS, verifyUpsellProof } from "./order-upsell-proof";

const SECRET = "root-secret-for-tests";
const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const NOW = 1_800_000_000_000;

describe("upsell proof", () => {
  it("round-trips the tenant and order it was minted for", () => {
    const token = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, SECRET, NOW);
    expect(verifyUpsellProof(token, SECRET, NOW + 1000)).toEqual({
      tenantId: TENANT,
      orderId: ORDER,
      exp: NOW + UPSELL_WINDOW_MS,
    });
  });

  it("expires with the upsell window", () => {
    const token = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, SECRET, NOW);
    expect(verifyUpsellProof(token, SECRET, NOW + UPSELL_WINDOW_MS)).toBeNull();
  });

  it("rejects a token signed with another key", () => {
    const token = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, "another-secret", NOW);
    expect(verifyUpsellProof(token, SECRET, NOW)).toBeNull();
  });

  it("rejects an edited payload, even one that extends its own expiry", () => {
    const token = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, SECRET, NOW);
    const [v, , sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ t: TENANT, o: "22222222-2222-4222-8222-222222222222", exp: NOW * 2 }),
    ).toString("base64url");
    expect(verifyUpsellProof(`${v}.${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it.each([null, undefined, "", "v1", "v1.a", "v2.a.b", "garbage.with.dots"])(
    "rejects malformed input %p",
    (token) => {
      expect(verifyUpsellProof(token, SECRET, NOW)).toBeNull();
    },
  );

  it("is not interchangeable with a preview token signed from the same secret", () => {
    // Domain separation: the HKDF purpose label makes the two keys distinct,
    // so neither token type verifies as the other.
    const preview = signPreviewToken({ tenant_id: TENANT }, SECRET, 3600);
    expect(verifyUpsellProof(`v1.${preview}`, SECRET)).toBeNull();
    const proof = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, SECRET);
    expect(verifyPreviewToken(proof.slice(3), SECRET).ok).toBe(false);
  });
});
