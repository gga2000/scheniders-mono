/*
 * The Today desk (board h1, h2, h3, h6, h7, h8): the shops that need someone
 * now, grouped by why, read from staff_today_desk; the numbers above the list,
 * read from staff_today_numbers; and what staff dealt with today, read from
 * staff_today_handled (20261116125015, 20261116125017, 20261116130612). The
 * database decides who waits and what counts as handled; this file words each
 * row.
 */
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { formatCount, formatDay, formatIQD } from "@/lib/format";
import { changeTitle } from "@/lib/shop-timeline";
import type { ShopTone } from "@/lib/shop-status";

export const TODAY_GROUPS = ["money", "locked", "lock_soon", "support"] as const;
export type TodayGroup = (typeof TODAY_GROUPS)[number];

export const GROUP_TITLE: Record<TodayGroup, string> = {
  money: "Money waiting",
  locked: "Locked shops",
  lock_soon: "Will lock within 3 days",
  support: "Support",
};

/** How many rows a group shows before "Show all" (board h7). */
export const GROUP_PREVIEW = 5;

const num = z.coerce.number();

const shopFields = {
  tenant_id: z.string().uuid(),
  display_id: z.number().int().nullable(),
  business_name: z.string(),
  status: z.string(),
  plan: z.string(),
  contact_phone: z.string().nullable(),
  wallet_iqd: num,
  /** When the wait began: the oldest receipt, the lock, the day it locks, or the question. */
  at: z.string(),
};

export const todayShopSchema = z.discriminatedUnion("group", [
  z.object({ group: z.literal("money"), ...shopFields, receipts: z.number().int().positive(), amount_iqd: num }),
  z.object({
    group: z.literal("locked"),
    ...shopFields,
    reason: z.enum(["trial_ended", "unpaid"]),
    orders_left: z.number().int().nullable(),
  }),
  z.object({
    group: z.literal("lock_soon"),
    ...shopFields,
    reason: z.enum(["trial_ends", "month_ends"]),
    price_iqd: num,
    short_iqd: num,
    nothing_to_renew: z.boolean(),
  }),
  z.object({
    group: z.literal("support"),
    ...shopFields,
    questions: z.number().int().positive(),
    case_id: z.string().uuid(),
    preview: z.string().nullable(),
  }),
]);
export type TodayShop = z.infer<typeof todayShopSchema>;

export const todayDeskSchema = z.object({ shops: z.array(todayShopSchema) });

export const todayNumbersSchema = z.object({
  orders_today: num,
  orders_yesterday_by_now: num,
  fees_month: num,
});
export type TodayNumbers = z.infer<typeof todayNumbersSchema>;

const handledFields = {
  tenant_id: z.string().uuid(),
  display_id: z.number().int().nullable(),
  business_name: z.string(),
  at: z.string(),
  /** The staff member: their name, else their email. */
  who: z.string(),
};

export const handledSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("receipt"),
    ...handledFields,
    outcome: z.enum(["approved", "rejected"]),
    amount_iqd: num,
    credited_iqd: num.nullable(),
    reject_reason: z.string().nullable(),
  }),
  z.object({ kind: z.literal("reply"), ...handledFields, case_id: z.string().uuid() }),
  z.object({
    kind: z.literal("change"),
    ...handledFields,
    action: z.string(),
    details: z.record(z.string(), z.unknown()).nullable(),
  }),
]);
export type HandledRow = z.infer<typeof handledSchema>;

export const handledTodaySchema = z.object({ handled: z.array(handledSchema) });

/** How many handled rows show before "Show all" (board h8: a short list). */
export const HANDLED_PREVIEW = 5;

export interface TodayResponse {
  shops: TodayShop[];
  numbers: TodayNumbers;
  /** What staff dealt with since midnight, newest first (board h8). */
  handled: HandledRow[];
}

/** A support step: left out with the Support page for a login that does not handle support. */
export function isSupportWork(row: HandledRow): boolean {
  return row.kind === "reply" || (row.kind === "change" && row.action.startsWith("support_"));
}

/** What was done, in the words of the shop timeline: "Receipt approved, 15,000 IQD". */
export function handledWords(row: HandledRow): string {
  switch (row.kind) {
    case "receipt": {
      if (row.outcome === "rejected") {
        const reason = row.reject_reason?.trim();
        return `Receipt for ${formatIQD(row.amount_iqd)} rejected${reason ? `: ${reason}` : ""}`;
      }
      const credited = row.credited_iqd ?? row.amount_iqd;
      return credited === row.amount_iqd
        ? `Receipt approved, ${formatIQD(credited)}`
        : `Receipt for ${formatIQD(row.amount_iqd)} approved, ${formatIQD(credited)} added`;
    }
    case "reply":
      return "Question answered";
    case "change": {
      const amount = row.details?.amount_iqd;
      if ((row.action === "top_up_wallet" || row.action === "top_up") && typeof amount === "number") {
        return `Added ${formatIQD(amount)}`;
      }
      return changeTitle(row.action, row.details) ?? "Changed the shop";
    }
  }
}

/** The rows of each group in the database's order: longest wait, or soonest lock, first. */
export function groupRows(shops: TodayShop[]): Array<{ group: TodayGroup; rows: TodayShop[] }> {
  return TODAY_GROUPS.map((group) => ({ group, rows: shops.filter((s) => s.group === group) })).filter(
    (g) => g.rows.length > 0,
  );
}

/** The few words beside a group's title: "2 receipts to check", "3 shops". */
export function groupCount(group: TodayGroup, rows: TodayShop[]): string {
  const shops = `${formatCount(rows.length)} ${rows.length === 1 ? "shop" : "shops"}`;
  if (group === "money") {
    const receipts = rows.reduce((sum, r) => sum + (r.group === "money" ? r.receipts : 0), 0);
    return `${formatCount(receipts)} ${receipts === 1 ? "receipt" : "receipts"} to check`;
  }
  if (group === "support") {
    const questions = rows.reduce((sum, r) => sum + (r.group === "support" ? r.questions : 0), 0);
    return `${formatCount(questions)} ${questions === 1 ? "question" : "questions"}`;
  }
  return shops;
}

export interface RowWords {
  tone: ShopTone;
  label: string;
  /** Why the shop is on the list, with the number that matters. */
  why: string;
}

/** The status chip and the reason, in the words of the Merchants list. */
export function rowWords(shop: TodayShop, now: Date = new Date()): RowWords {
  const chip: Pick<RowWords, "tone" | "label"> =
    shop.group === "locked"
      ? { tone: "locked", label: "Locked" }
      : shop.plan === "internal"
        ? { tone: "internal", label: "Internal" }
        : shop.status === "trial"
          ? { tone: "trial", label: "Trial" }
          : { tone: "paying", label: "Paying" };

  switch (shop.group) {
    case "money": {
      const more = shop.receipts > 1 ? ` and ${shop.receipts - 1} more` : "";
      return { ...chip, why: `Sent a receipt for ${formatIQD(shop.amount_iqd)}${more}` };
    }
    case "locked": {
      const fee = shop.reason === "trial_ended" ? "Trial ended, not paid." : "Month not paid.";
      if (shop.orders_left === null) return { ...chip, why: fee };
      return {
        ...chip,
        why: shop.orders_left > 0
          ? `${fee} ${formatCount(shop.orders_left)} store ${shop.orders_left === 1 ? "order" : "orders"} left`
          : `${fee} The store takes no more orders`,
      };
    }
    case "lock_soon": {
      const day = formatDay(shop.at, now);
      if (shop.reason === "trial_ends") {
        if (shop.nothing_to_renew) return { ...chip, why: `Trial ends ${day}, nothing set to renew` };
        return {
          ...chip,
          why: shop.wallet_iqd <= 0
            ? `Trial ends ${day}, wallet is empty`
            : `Trial ends ${day}, ${formatCount(shop.short_iqd)} short`,
        };
      }
      return { ...chip, why: `${formatCount(shop.price_iqd)} due ${day}, ${formatCount(shop.short_iqd)} short` };
    }
    case "support":
      return { ...chip, why: shop.preview ? `Asked: ${shop.preview}` : "Wrote to us" };
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "25 min", "2 h", "3 days": a whole amount of time, rounded down, never less than 1 min. */
function span(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}

/** The Waiting column: how long the shop has waited, or how long until it locks. */
export function waitWords(shop: TodayShop, now: Date = new Date()): string {
  const at = new Date(shop.at).getTime();
  if (shop.group === "lock_soon") return `locks in ${span(Math.max(0, at - now.getTime()))}`;
  const since = span(Math.max(0, now.getTime() - at));
  return shop.group === "locked" ? `locked ${since}` : `waiting ${since}`;
}

/**
 * An owner's phone as a wa.me link (0770 123 4567 to wa.me/9647701234567), or
 * null when it is not an Iraqi mobile WhatsApp can open.
 */
export function whatsappLink(raw: string | null): string | null {
  const local = normalizeIraqiMobile(raw);
  return local ? `https://wa.me/964${local.slice(1)}` : null;
}
