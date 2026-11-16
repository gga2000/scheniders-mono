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
}): Detail {
  return {
    tenant: {
      id: "t1", display_id: 100048, business_name: "Dijla Watches", slug: "dijla", plan: "starter", status: "active",
      trial_ends_at: null, branding: null, settings: null, store_config: null, contact_email: null, contact_phone: null,
      address: null, city: "Baghdad", created_at: "2026-10-01T00:00:00Z", restrictions: null,
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
    planLimits: { plan: "starter", max_orders_per_month: -1, max_team_members: 2, base_price_iqd: 9_000, order_price_iqd: 55, overage_price_iqd: 0, features: {} },
    billingLock: over.lock ?? null,
    stoppedBy: over.stoppedBy ?? null,
  };
}

describe("shopStatusLine", () => {
  it("gives a paying shop its next charge with day and amount", () => {
    expect(shopStatusLine(shop({}), now)).toEqual({
      tone: "paying",
      label: "Paying",
      sentence: "Paying. This month runs from Mon 19 Oct to Thu 19 Nov.",
      next: "Next charge 9,000 IQD on Thu 19 Nov.",
    });
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

  it("never bills our own shops", () => {
    expect(shopStatusLine(shop({ tenant: { plan: "internal" } }), now)).toMatchObject({ label: "Internal", next: null });
  });
});
