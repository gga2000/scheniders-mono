/*
 * One shop in a compare view. Every shop on the screen is read from the
 * Merchants list API, so the numbers side by side mean the same thing: real
 * orders and our fees over the last 30 Baghdad days, the wallet now, the
 * active team now, and the database's health score.
 *
 * The shop page's compare view used to build its own shop from the shop
 * record (orders of all time, no fees, every member row) and the others from
 * the list (the newest usage month, fees of 30 days, a team number written
 * once at sign-up), and marked a "winner" between numbers that could not be
 * compared.
 */
import { z } from "zod";

const listShopSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  plan: z.string(),
  status: z.string(),
  city: z.string().nullable(),
  created_at: z.string(),
  // A shop with no wallet row has nothing in it.
  wallet: z.object({ balance_iqd: z.number() }).nullish(),
  orders_30d: z.number(),
  fees_30d: z.number(),
  team_members: z.number(),
  order_sparkline: z.array(z.number()),
  staff_health_score: z.number(),
  staff_health_parts: z.object({ status: z.number(), wallet: z.number(), orders: z.number() }),
});

const listAnswerSchema = z.object({ merchants: z.array(listShopSchema) });

export interface ComparisonShop {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
  created_at: string;
  wallet_balance: number;
  /** Real orders, today and the 29 Baghdad days before it. */
  orders_30d: number;
  /** Our fees over the same 30 days. */
  fees_30d: number;
  /** People who can sign in to the shop today. */
  team_members: number;
  /** One number per day of those 30 days, oldest first. */
  order_sparkline: number[];
  health_score: number;
  health_parts: { status: number; wallet: number; orders: number };
}

/** The shops of a Merchants list answer. An answer that leaves a number out is an error, never a 0. */
export function parseComparisonShops(answer: unknown): ComparisonShop[] {
  return listAnswerSchema.parse(answer).merchants.map((shop) => ({
    id: shop.id,
    business_name: shop.business_name,
    plan: shop.plan,
    status: shop.status,
    city: shop.city,
    created_at: shop.created_at,
    wallet_balance: shop.wallet?.balance_iqd ?? 0,
    orders_30d: shop.orders_30d,
    fees_30d: shop.fees_30d,
    team_members: shop.team_members,
    order_sparkline: shop.order_sparkline,
    health_score: shop.staff_health_score,
    health_parts: shop.staff_health_parts,
  }));
}

/** Read shops from the Merchants list with the 30-day line. `filter` is a query string such as "ids=..." or "search=...". */
export async function fetchComparisonShops(filter: string): Promise<ComparisonShop[]> {
  const response = await fetch(`/api/merchants?${filter}&include_sparkline=true`);
  if (!response.ok) throw new Error(`The Merchants list answered ${response.status}`);
  return parseComparisonShops(await response.json());
}

const baghdadDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Baghdad",
});

/** "8 Jun 2026", the day it was in Baghdad. */
export function formatBaghdadDay(instant: string): string {
  return baghdadDay.format(new Date(instant));
}
