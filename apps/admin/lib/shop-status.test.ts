import { describe, expect, it } from "vitest";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { shopStatusLine } from "./shop-status";

const now = new Date("2026-11-16T10:00:00Z");

type Detail = Parameters<typeof shopStatusLine>[0];

function shop(over: {
  tenant?: Partial<MerchantDetail["tenant"]>;
  wallet?: number;
  subscription?: Partial<NonNullable<MerchantDetail["subscription"]>> | null;
  lock?: Detail["billingLock"];
  stoppedBy?: Detail["stoppedBy"];
  paidPlan?: Detail["paidPlan"];
}): Detail {
  return {
    tenant: {
      id: "t1", display_id: 100048, business_name: "Dijla Watches", slug: "dijla", plan: "starter", status: "active",
      trial_ends_at: null, branding: null, settings: null, store_config_rev: 2, contact_email: null, contact_phone: null,
      address: null, city: "Baghdad", created_at: "2026-10-01T00:00:00Z", restrictions: null, is_demo: false,
      staff_health_score: 80, staff_health_parts: { status: 40, wallet: 20, orders: 20 },
      ...over.tenant,
    },
    wallet: { balance_iqd: over.wallet ?? 43_800, threshold_iqd: 5_000, total_charged_iqd: 0, total_topped_up_iqd: 0 },
    subscription:
      over.subscription === null
        ? null
        : {
            plan: "starter", status: "active", current_period_start: "2026-10-19T09:00:00Z",
            current_period_end: "2026-11-19T09:00:00Z", pending_plan: null, plan_change_at: null, auto_renew: true,
            ...over.subscription,
          },
    // What billing_lock_snapshot reads for an unlocked starter shop with no add-on.
    billingLock: over.lock ?? { locked: false, reason: null, since: null, orders_left: null, allowance: 50, plan: "starter", price_iqd: 9_000 },
    stoppedBy: over.stoppedBy ?? null,
    // Charged on 19 Sep and 19 Oct: the month that runs now was paid for.
    paidPlan: over.paidPlan ?? { first_paid_at: "2026-09-19T09:00:00Z", paid_until: "2026-11-18T09:00:00Z" },
  };
}

/** A converted lead: its first month starts today and was never charged. */
const NEVER_CHARGED = { first_paid_at: null, paid_until: null };

describe("shopStatusLine", () => {
  it("gives a paying shop its next charge with day and amount", () => {
    expect(shopStatusLine(shop({}), now)).toEqual({
      tone: "paying",
      label: "Paying",
      sentence: "Paying. This month runs from Mon 19 Oct to Thu 19 Nov.",
      next: "Next charge 9,000 IQD on Thu 19 Nov.",
    });
  });

  it("charges what the renewal takes: the plan with its add-ons, not the plan's list price", () => {
    // A starter shop with one more team member: 9,000 + 5,000.
    const lock = { locked: false, reason: null, since: null, orders_left: null, allowance: 50, plan: "starter", price_iqd: 14_000 };
    expect(shopStatusLine(shop({ lock, wallet: 10_000 }), now).next).toBe(
      "Next charge 14,000 IQD on Thu 19 Nov. Wallet 10,000 IQD, short by 4,000 IQD. It locks that day unless money is added.",
    );
  });

  it("charges the plan the shop moves to when a change waits for the renewal", () => {
    const lock = { locked: false, reason: null, since: null, orders_left: null, allowance: 50, plan: "growth", price_iqd: 25_000 };
    const line = shopStatusLine(shop({ lock, subscription: { pending_plan: "growth" } }), now);
    expect(line.next).toBe("Next charge 25,000 IQD on Thu 19 Nov.");
  });

  it("charges a trial's first month with its add-ons", () => {
    const lock = { locked: false, reason: null, since: null, orders_left: null, allowance: 50, plan: "starter", price_iqd: 14_000 };
    const line = shopStatusLine(shop({ tenant: { status: "trial", trial_ends_at: "2026-11-17T09:00:00Z" }, lock, wallet: 20_000 }), now);
    expect(line.next).toBe("First charge 14,000 IQD on Tue 17 Nov.");
  });

  it("never promises a charge to the demo store, which renews at no charge", () => {
    for (const status of ["active", "trial"]) {
      expect(shopStatusLine(shop({ tenant: { is_demo: true, status, trial_ends_at: "2026-11-17T09:00:00Z" } }), now)).toEqual({
        tone: "internal",
        label: "Demo",
        sentence: "The demo store. It is never charged.",
        next: null,
      });
    }
  });

  it("says how short the wallet is for the next charge", () => {
    expect(shopStatusLine(shop({ wallet: 4_000 }), now).next).toBe(
      "Next charge 9,000 IQD on Thu 19 Nov. Wallet 4,000 IQD, short by 5,000 IQD. It locks that day unless money is added.",
    );
  });

  it("says why a locked shop is locked, since when, and what opens it", () => {
    const line = shopStatusLine(
      shop({ wallet: 2_175, lock: { locked: true, reason: "unpaid", since: "2026-11-13T08:00:00Z", orders_left: 50, allowance: 50, plan: "starter", price_iqd: 9_000 } }),
      now,
    );
    expect(line.label).toBe("Locked");
    expect(line.sentence).toBe("Month not paid. Locked since Fri 13 Nov.");
    expect(line.next).toBe("Paying 9,000 IQD from the wallet opens it again. Wallet 2,175 IQD, short by 6,825 IQD.");
  });

  it("says a paused locked shop stays locked until the pause lifts, even with the money in its wallet", () => {
    const lock = { locked: true, reason: "unpaid", since: "2026-11-13T08:00:00Z", orders_left: 50, allowance: 50, plan: "starter", price_iqd: 9_000 } as const;
    const paused = { status: "limited", restrictions: { paused_until: "2026-11-20T15:00:00Z" } };
    expect(shopStatusLine(shop({ wallet: 9_000, lock, tenant: paused }), now).next).toBe(
      "Paused, so the lock stays until the pause lifts. Then paying 9,000 IQD from the wallet opens it.",
    );
    expect(shopStatusLine(shop({ wallet: 2_000, lock, tenant: paused }), now).next).toBe(
      "Paused, so the lock stays until the pause lifts. Then paying 9,000 IQD from the wallet opens it. Wallet 2,000 IQD, short by 7,000 IQD.",
    );
  });

  it("gives a trial its end and first charge", () => {
    const line = shopStatusLine(shop({ tenant: { status: "trial", trial_ends_at: "2026-11-17T09:00:00Z" }, wallet: 0 }), now);
    expect(line.sentence).toBe("Trial until Tue 17 Nov, 12:00.");
    expect(line.next).toBe(
      "First charge 9,000 IQD on Tue 17 Nov. Wallet 0 IQD, short by 9,000 IQD. It locks that day unless money is added.",
    );
  });

  it("reads a shop stopped by staff as On hold, with no fee", () => {
    expect(shopStatusLine(shop({ tenant: { status: "suspended" } }), now)).toMatchObject({ label: "On hold", next: null });
  });

  it("says who put a shop on hold and since when", () => {
    const line = shopStatusLine(shop({ tenant: { status: "suspended" }, stoppedBy: { who: "Ali", at: "2026-11-16T08:00:00Z" } }), now);
    expect(line.sentence).toBe("On hold since Mon 16 Nov, by Ali. No monthly fee while on hold.");
  });

  it("says who paused a shop", () => {
    const line = shopStatusLine(
      shop({
        tenant: { status: "limited", restrictions: { paused_until: "2026-11-18T09:00:00Z" } },
        stoppedBy: { who: "Noor", at: "2026-11-16T08:00:00Z" },
      }),
      now,
    );
    expect(line.sentence).toBe("Paused by Noor until Wed 18 Nov, 12:00.");
  });

  it("reads a paused shop with its end and reason", () => {
    const line = shopStatusLine(
      shop({ tenant: { status: "limited", restrictions: { paused_until: "2026-11-18T09:00:00Z", reason: "Owner asked" } } }),
      now,
    );
    expect(line.sentence).toBe("Paused by staff until Wed 18 Nov, 12:00. Reason: Owner asked.");
  });

  it("never promises a charge to an active shop whose subscription has ended", () => {
    const line = shopStatusLine(shop({ subscription: { status: "cancelled" } }), now);
    expect(line.sentence).toBe("Active, but its subscription has ended, so it is not billed.");
    expect(line.next).toBeNull();
  });

  it("says when renewal is off", () => {
    expect(shopStatusLine(shop({ subscription: { auto_renew: false } }), now).next).toBe(
      "The month ends on Thu 19 Nov and is not renewed.",
    );
  });

  it("says Free time, not Paying, for a running month that no charge pays for", () => {
    // Round 18: a converted lead read "Paying" though it was never charged,
    // and the Paying page rightly left it out.
    const lead = shop({
      paidPlan: NEVER_CHARGED,
      subscription: { current_period_start: "2026-11-16T09:00:00Z", current_period_end: "2026-12-16T09:00:00Z" },
    });
    expect(shopStatusLine(lead, now)).toEqual({
      tone: "paying",
      label: "Free time",
      sentence: "No plan charge yet. Free time from Mon 16 Nov to Wed 16 Dec.",
      next: "First charge 9,000 IQD on Wed 16 Dec.",
    });
  });

  it("says when a charged shop's free days began, and charges next at their end", () => {
    // Its last charged month ended on 10 Nov; free days run its month to 25 Nov.
    const line = shopStatusLine(
      shop({
        paidPlan: { first_paid_at: "2026-09-11T09:00:00Z", paid_until: "2026-11-10T09:00:00Z" },
        subscription: { current_period_end: "2026-11-25T09:00:00Z" },
        wallet: 4_000,
      }),
      now,
    );
    expect(line.label).toBe("Free time");
    expect(line.sentence).toBe("Not charged for this time: its last paid month ended on Tue 10 Nov. Free until Wed 25 Nov.");
    expect(line.next).toBe(
      "Next charge 9,000 IQD on Wed 25 Nov. Wallet 4,000 IQD, short by 5,000 IQD. It locks that day unless money is added.",
    );
  });

  it("says a free month with renewal off ends unrenewed", () => {
    const line = shopStatusLine(shop({ paidPlan: NEVER_CHARGED, subscription: { auto_renew: false } }), now);
    expect(line).toMatchObject({ label: "Free time", next: "The free time ends on Thu 19 Nov and is not renewed." });
  });

  it("keeps Paying while a charged month covers now, even when free days run past it", () => {
    const line = shopStatusLine(shop({ subscription: { current_period_end: "2026-11-28T09:00:00Z" } }), now);
    expect(line.label).toBe("Paying");
  });

  it("keeps Paying for a charged month that has ended and waits for the renewal run, and Behind for a month behind", () => {
    // Paid through its month (17 Oct to 16 Nov 09:00); the run has not charged
    // the next yet, and paid_plan_months gives it the wait day.
    const waiting = shop({
      paidPlan: { first_paid_at: "2026-09-17T09:00:00Z", paid_until: "2026-11-17T09:00:00Z" },
      subscription: { current_period_start: "2026-10-17T09:00:00Z", current_period_end: "2026-11-16T09:00:00Z" },
      wallet: 4_000,
    });
    // Round 20: it named the month's last day, already past, as the charge day.
    expect(shopStatusLine(waiting, now)).toEqual({
      tone: "paying",
      label: "Paying",
      sentence: "Paying. This month ended on Mon 16 Nov.",
      next: "Next charge 9,000 IQD with the next daily renewal. Wallet 4,000 IQD, short by 5,000 IQD. It locks then unless money is added.",
    });
    expect(shopStatusLine(shop({ paidPlan: NEVER_CHARGED, subscription: { status: "past_due" } }), now).label).toBe("Behind");
  });

  // Round 19: a converted shop's free year ended at 09:00; until the renewal run
  // charged it, the page said "Paying" for a shop that had never paid.
  it("says free time ended, not Paying, while the renewal run has yet to charge it", () => {
    const ended = shop({
      paidPlan: NEVER_CHARGED,
      subscription: { current_period_start: "2025-11-16T09:00:00Z", current_period_end: "2026-11-16T09:00:00Z" },
      wallet: 4_000,
    });
    // Round 20: "with the next renewal" was said twice, in the sentence and the next line.
    expect(shopStatusLine(ended, now)).toEqual({
      tone: "trial",
      label: "Due",
      sentence: "Free time ended on Mon 16 Nov.",
      next: "First charge 9,000 IQD with the next daily renewal. Wallet 4,000 IQD, short by 5,000 IQD. It locks then unless money is added.",
    });

    // Charged before, then free days that have ended: the next charge, not the
    // first. Free days move the period's end and keep its start, as
    // admin_extend_subscription writes them (round 20: this read "Paying").
    const freeDaysEnded = shop({
      paidPlan: { first_paid_at: "2026-09-11T09:00:00Z", paid_until: "2026-11-10T09:00:00Z" },
      subscription: { current_period_start: "2026-10-11T09:00:00Z", current_period_end: "2026-11-16T09:00:00Z" },
    });
    expect(shopStatusLine(freeDaysEnded, now)).toMatchObject({
      label: "Due",
      sentence: "Free time ended on Mon 16 Nov.",
      next: "Next charge 9,000 IQD with the next daily renewal.",
    });

    const notRenewed = shop({
      paidPlan: NEVER_CHARGED,
      subscription: { current_period_end: "2026-11-16T09:00:00Z", auto_renew: false },
    });
    expect(shopStatusLine(notRenewed, now)).toEqual({
      tone: "ended",
      label: "Free time ended",
      sentence: "Free time ended on Mon 16 Nov. Renewal is off, so it is not charged.",
      next: null,
    });
  });

  it("never bills our own shops", () => {
    expect(shopStatusLine(shop({ tenant: { plan: "internal" } }), now)).toMatchObject({ label: "Internal", next: null });
  });
});
