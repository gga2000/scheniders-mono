import { z } from "zod";
import { IRAQ_GOVERNORATES, type GovernorateCode } from "@scheniders/shared";

// Lives outside app/actions/checkout.ts because a "use server" module may only
// export async functions.

const GOVERNORATE_CODES = IRAQ_GOVERNORATES.map((g) => g.code) as [
  GovernorateCode,
  ...GovernorateCode[],
];

/**
 * The `submitCheckout` server action is a public endpoint: Next.js exposes
 * every exported server action to any HTTP client, so its argument is
 * untrusted input regardless of which form calls it. Everything is
 * validated and length-bounded here; prices and totals are still recomputed
 * server-side from the database.
 */
export const submitCheckoutPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  /** EC17: dedupe key for a re-submitted order (flaky-3G retry). */
  idempotencyKey: z.string().min(8).max(100).optional(),
  /** Discount engine: coupon code (validated + priced server-side). */
  couponCode: z.string().trim().min(1).max(64).optional(),
  /** Pixel Purchase event_id — reused by the CAPI server twin for dedup. */
  purchaseEventId: z.string().min(8).max(100).optional(),
  /** Loyalty redemption request. Refused on this public path (see checkout.ts). */
  redeemPoints: z.number().int().min(0).optional(),
  /** Referral: a friend's code; eligibility + amount are re-resolved server-side. */
  referralCode: z.string().min(1).max(32).optional(),
  customer: z.object({
    customer_name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(32),
    alt_phone: z.string().trim().max(32).nullish(),
    governorate_code: z.enum(GOVERNORATE_CODES),
    city: z.string().trim().min(1).max(200),
    address_details: z.string().trim().min(1).max(1000),
    notes: z.string().max(2000).optional(),
  }),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        // Looked up tenant-scoped; an id that matches nothing is "unavailable".
        variant_id: z.string().min(1).max(64).nullable(),
        name: z.string().max(500),
        variant_name: z.string().max(500).nullable(),
        price: z.number().finite(),
        quantity: z.number().int(),
      }),
    )
    // Empty carts are answered by the action with a specific message.
    .max(100),
});

export type SubmitCheckoutPayload = z.infer<typeof submitCheckoutPayloadSchema>;
