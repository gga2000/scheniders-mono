// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TRIAL_ENDING_DAYS, trialClock } from "./baghdad-day";
import { isChurnRisk } from "./merchant-health";
import { shopCheckLines, type ShopCheck } from "./support-shop-check";
import { MerchantAlertFlag } from "@/components/merchants/merchant-alert-flag";

/*
 * "Ending" trials: the Trials page, the support card, shop health and the
 * shop list's flag each kept their own "3 days", so a change to one left the
 * others saying something else. They now read TRIAL_ENDING_DAYS. These tests
 * hold every reader to the same edge: the last "ending" day and the day after.
 */

const NOW = Date.parse("2026-11-16T12:00:00Z"); // Mon 15:00 in Baghdad
const TENANT = "33333333-3333-4333-8333-333333333333";
const endIn = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

const shopCheck = (trialEndsAt: string): ShopCheck => ({
  store: {
    status: "trial",
    is_prospect: false,
    is_demo: false,
    paused: false,
    blocks_new_orders: false,
    paused_until: null,
    pause_reason: null,
    lock_reason: null,
    lock_since: null,
    trial_ends_at: trialEndsAt,
  },
  products: { on_store: 5, sold_out_marked: 0, no_stock: 0 },
  waseet: { calls_7d: 0, failed_7d: 0, last_error: null, last_error_at: null },
  prime: null,
  whatsapp: { paused: false, pause_reason: null, paused_at: null, sent_7d: 0, delivered_7d: 0, failed_7d: 0 },
  wallet: { balance_iqd: 20_000, threshold_iqd: 5_000 },
  orders: { last_at: null, last_7d: 0 },
  errors: { count_7d: 0, last_message: null, last_path: null, last_at: null },
  checked_at: new Date(NOW).toISOString(),
});

const readers = (trialEndsAt: string) => {
  render(<MerchantAlertFlag merchant={{ status: "trial", trial_ends_at: trialEndsAt }} />);
  return {
    supportCard: shopCheckLines(shopCheck(trialEndsAt), TENANT, NOW).find((l) => l.key === "store")?.state,
    churnFlame: isChurnRisk({ status: "trial", trialEndsAt, walletIqd: 20_000, orders30d: 0 }, NOW),
    listFlag: screen.queryByRole("button", { name: "Trial ending" }) !== null,
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TRIAL_ENDING_DAYS: every reader calls the same trials 'ending'", () => {
  it(`calls a trial ${TRIAL_ENDING_DAYS} Baghdad days from its end 'ending' everywhere`, () => {
    const end = endIn(TRIAL_ENDING_DAYS);
    expect(trialClock(end, NOW).days).toBe(TRIAL_ENDING_DAYS);
    expect(readers(end)).toEqual({ supportCard: "look", churnFlame: true, listFlag: true });
  });

  it("calls a trial one day further out 'ending' nowhere", () => {
    const end = endIn(TRIAL_ENDING_DAYS + 1);
    expect(readers(end)).toEqual({ supportCard: "ok", churnFlame: false, listFlag: false });
  });
});
