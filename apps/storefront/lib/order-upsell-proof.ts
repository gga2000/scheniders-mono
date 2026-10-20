// =====================================================================
// Order upsell proof — "this browser placed that order, just now"
// =====================================================================
// The post-purchase upsell appends a line to an order that was just
// placed. Who may do that is the whole security question, and neither the
// order id nor the order number answers it: the number is sequential, and
// the id travels to the merchant's tools, webhooks and the courier. So the
// checkout mints this proof in the same response that creates the order,
// and only the browser that received that response holds it.
//
//   v1.<base64url(JSON {t: tenant_id, o: order_id, exp})>.<base64url(HMAC)>
//
// It is the preview-token pattern (packages/shared/src/preview-token.ts):
// HMAC-SHA256 over the encoded payload, constant-time comparison, expiry
// inside the signed payload. Two differences, both deliberate:
//
//   - The tenant comes FROM the proof. The route never trusts a tenant id
//     from the request, so a proof for one store cannot act on another.
//   - The key is derived (HKDF, fixed purpose label) from the server-only
//     service-role key the checkout already needs to create the order, so
//     the feature works wherever checkout works and needs no new secret.
//     The label separates this key from any other use of that secret: an
//     upsell proof is not a valid signature for anything else, and nothing
//     else is a valid upsell proof.
//
// Server-only: imports node:crypto and reads a server env var. It must
// never be imported from a client component or a shared package barrel.
// =====================================================================

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/** How long after placement the shopper may add to the order. Matches the
 *  thank-you page's own stash TTL. */
export const UPSELL_WINDOW_MS = 60 * 60 * 1000;

const VERSION = "v1";
const KEY_PURPOSE = "scheniders/storefront/order-upsell-proof/v1";

export interface UpsellProof {
  tenantId: string;
  orderId: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const pad = (4 - (input.length % 4)) % 4;
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64");
}

function deriveKey(rootSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", rootSecret, Buffer.alloc(0), KEY_PURPOSE, 32));
}

function sign(message: string, rootSecret: string): Buffer {
  return createHmac("sha256", deriveKey(rootSecret)).update(message).digest();
}

/** The root secret, or null when the server is not configured to mint proofs
 *  (then no proof is issued and the upsell never renders). */
export function upsellProofSecret(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret && secret.length > 0 ? secret : null;
}

export function signUpsellProof(
  input: { tenantId: string; orderId: string },
  rootSecret: string,
  nowMs: number = Date.now(),
): string {
  const payload = base64Url(
    Buffer.from(
      JSON.stringify({ t: input.tenantId, o: input.orderId, exp: nowMs + UPSELL_WINDOW_MS }),
      "utf8",
    ),
  );
  const message = `${VERSION}.${payload}`;
  return `${message}.${base64Url(sign(message, rootSecret))}`;
}

/** The verified claims, or null for anything malformed, forged or expired. */
export function verifyUpsellProof(
  token: string | null | undefined,
  rootSecret: string,
  nowMs: number = Date.now(),
): UpsellProof | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [version, payload, sig] = parts;

  const expected = sign(`${version}.${payload}`, rootSecret);
  const provided = fromBase64Url(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  // The signature is good, so the payload is ours; parsing still guards the
  // shape rather than trusting it.
  let claims: unknown;
  try {
    claims = JSON.parse(fromBase64Url(payload).toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object") return null;
  const { t, o, exp } = claims as Record<string, unknown>;
  if (typeof t !== "string" || typeof o !== "string" || typeof exp !== "number") return null;
  if (exp <= nowMs) return null;
  return { tenantId: t, orderId: o, exp };
}
