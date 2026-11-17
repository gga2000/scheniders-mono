import { z } from "zod";
import { storeAddress } from "@scheniders/shared/store-address";

/**
 * The demo store (Fermi B13): one shop, «متجر مثال», full of invented orders
 * for recording videos. The database keeps it apart from everything real
 * (tenants.is_demo); the staff console creates it, resets its data and opens
 * it as its owner.
 */

/**
 * The demo store's owner. An Auth user with no password: nobody signs in
 * with it except through the one-time link the console makes. No mail is
 * ever sent to it.
 */
export const DEMO_OWNER_EMAIL = "demo@usefermi.com";

/** Where the console's "open" link lands in the merchant app. */
export const DEMO_OPEN_PATH = "/orders";

/** What seed_demo_store answers: the counts the card shows after a reset. */
export const demoCountsSchema = z.object({
  products: z.number(),
  variants: z.number(),
  orders: z.number(),
  abandoned_carts: z.number(),
  expenses: z.number(),
});
export type DemoCounts = z.infer<typeof demoCountsSchema>;

/** What create_demo_store answers. */
export const demoCreatedSchema = z.object({
  tenant_id: z.string().uuid(),
  counts: demoCountsSchema,
});

/** The card's view of the demo store, as GET /api/demo-store answers. */
export const demoStoreSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  business_name: z.string(),
  created_at: z.string(),
  orders: z.number(),
  products: z.number(),
  storefront_url: z.string().url(),
});

export const demoStatusSchema = z.object({ store: demoStoreSchema.nullable() });

export const demoActionSchema = z.object({ action: z.enum(["create", "reset", "open"]) });
export type DemoAction = z.infer<typeof demoActionSchema>["action"];

/** The store's own address, as merchants share it. */
export function demoStorefrontUrl(slug: string): string {
  return `https://${storeAddress(slug)}`;
}

/**
 * The one-time sign-in link for the demo owner: the merchant app's own email
 * link handler checks the token and lands on the orders page. The same
 * handler serves the password reset emails, so no new sign-in path is opened.
 */
export function demoOpenUrl(platformUrl: string, hashedToken: string): string {
  const url = new URL("/api/auth/confirm", platformUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", DEMO_OPEN_PATH);
  return url.toString();
}

/** One line for the card after a create or reset. */
export function demoCountsLine(counts: DemoCounts): string {
  return `${counts.orders} orders (${counts.abandoned_carts} abandoned carts), ${counts.products} products, ${counts.expenses} expenses`;
}
