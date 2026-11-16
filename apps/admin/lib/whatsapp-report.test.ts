import { describe, expect, it } from "vitest";
import {
  INTERAKT_COST_IQD,
  baghdadMonth,
  monthParamSchema,
  shiftMonth,
  trialCostIqd,
  whatsappReportTotals,
  type WhatsAppReportShop,
} from "./whatsapp-report";

const shop = (over: Partial<WhatsAppReportShop>): WhatsAppReportShop => ({
  tenant_id: "11111111-1111-4111-8111-111111111111",
  display_id: 100801,
  name: "Shop",
  plan: "starter",
  status: "active",
  messages: 0,
  utility: 0,
  marketing: 0,
  shop_paid_iqd: 0,
  trial_utility: 0,
  trial_marketing: 0,
  internal: 0,
  unpaid: 0,
  reached_24h: 0,
  failed_24h: 0,
  bad_24h: 0,
  paused: false,
  pause_reason: null,
  paused_at: null,
  ...over,
});

describe("WhatsApp report totals", () => {
  it("adds up what shops paid and what trial messages cost us, kept apart", () => {
    const totals = whatsappReportTotals([
      shop({ messages: 5, utility: 4, marketing: 1, shop_paid_iqd: 4 * 30 + 80 }),
      shop({ messages: 3, utility: 2, marketing: 1, trial_utility: 2, trial_marketing: 1, unpaid: 1 }),
      shop({ paused: true, pause_reason: "failures", paused_at: "2026-11-16T05:15:00Z" }),
    ]);
    expect(totals).toEqual({
      messages: 8,
      shopPaidIqd: 200,
      trialMessages: 3,
      trialCostIqd: 2 * INTERAKT_COST_IQD.utility + INTERAKT_COST_IQD.marketing,
      unpaid: 1,
      pausedShops: 1,
    });
  });

  it("a month with no messages is all zeros", () => {
    expect(whatsappReportTotals([])).toEqual({
      messages: 0, shopPaidIqd: 0, trialMessages: 0, trialCostIqd: 0, unpaid: 0, pausedShops: 0,
    });
    expect(trialCostIqd({ trial_utility: 0, trial_marketing: 0 })).toBe(0);
  });
});

describe("months on Baghdad time", () => {
  it("21:30 UTC on 31 October is already November in Baghdad", () => {
    expect(baghdadMonth(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11");
    expect(baghdadMonth(new Date("2026-10-31T20:59:00Z"))).toBe("2026-10");
  });

  it("steps across a year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });

  it("accepts only YYYY-MM", () => {
    expect(monthParamSchema.safeParse("2026-11").success).toBe(true);
    for (const bad of ["2026-13", "2026-1", "26-11", "2026-11-01", ""]) {
      expect(monthParamSchema.safeParse(bad).success).toBe(false);
    }
  });
});
