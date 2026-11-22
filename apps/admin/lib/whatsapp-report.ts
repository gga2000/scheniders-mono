import { z } from "zod";
import { TENANT_STATUSES } from "@/types/admin";

/**
 * The staff console's WhatsApp page (Fermi B2): what each shop's messages cost
 * in a month, who paid, and which shops are paused to protect the shared
 * number. Read from admin_whatsapp_report (20261116055117_fermi_whatsapp_guard.sql).
 */

/**
 * What Interakt charges us per delivered message in Iraq, in IQD (handoff B2,
 * Interakt's price table on 16 Nov: utility $0.010–0.011, marketing $0.038).
 * Only used to estimate what trial messages cost Fermi; shops pay the plan's
 * own price (30 utility, 80 marketing).
 */
export const INTERAKT_COST_IQD = { utility: 16, marketing: 58 } as const;

export const whatsappReportShopSchema = z.object({
  tenant_id: z.string().uuid(),
  display_id: z.number().int().nullable(),
  name: z.string().nullable(),
  plan: z.string(),
  status: z.enum(TENANT_STATUSES),
  messages: z.number().int(),
  utility: z.number().int(),
  marketing: z.number().int(),
  shop_paid_iqd: z.number().int(),
  trial_utility: z.number().int(),
  trial_marketing: z.number().int(),
  internal: z.number().int(),
  unpaid: z.number().int(),
  reached_24h: z.number().int(),
  failed_24h: z.number().int(),
  bad_24h: z.number().int(),
  paused: z.boolean(),
  pause_reason: z.enum(["failures", "staff"]).nullable(),
  paused_at: z.string().nullable(),
});

export const whatsappReportSchema = z.object({
  month_start: z.string(),
  month_end: z.string(),
  shops: z.array(whatsappReportShopSchema),
});

export type WhatsAppReportShop = z.infer<typeof whatsappReportShopSchema>;

export interface WhatsAppReportTotals {
  messages: number;
  shopPaidIqd: number;
  trialMessages: number;
  /** About what the month's trial messages cost Fermi at Interakt's price. */
  trialCostIqd: number;
  unpaid: number;
  pausedShops: number;
}

export function trialCostIqd(shop: Pick<WhatsAppReportShop, "trial_utility" | "trial_marketing">): number {
  return shop.trial_utility * INTERAKT_COST_IQD.utility + shop.trial_marketing * INTERAKT_COST_IQD.marketing;
}

export function whatsappReportTotals(shops: readonly WhatsAppReportShop[]): WhatsAppReportTotals {
  return shops.reduce<WhatsAppReportTotals>(
    (t, s) => ({
      messages: t.messages + s.messages,
      shopPaidIqd: t.shopPaidIqd + s.shop_paid_iqd,
      trialMessages: t.trialMessages + s.trial_utility + s.trial_marketing,
      trialCostIqd: t.trialCostIqd + trialCostIqd(s),
      unpaid: t.unpaid + s.unpaid,
      pausedShops: t.pausedShops + (s.paused ? 1 : 0),
    }),
    { messages: 0, shopPaidIqd: 0, trialMessages: 0, trialCostIqd: 0, unpaid: 0, pausedShops: 0 },
  );
}

/** The month before or after a "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const monthParamSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");
