import { describe, it, expect } from "vitest";
import { trialClock } from "./baghdad-day";
import { daysAgo, shopCheckLines, ShopCheckSchema, type ShopCheck } from "./support-shop-check";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const TENANT = "33333333-3333-4333-8333-333333333333";
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function healthy(): ShopCheck {
  return {
    store: {
      status: "active",
      is_prospect: false,
      is_demo: false,
      paused: false,
      blocks_new_orders: false,
      paused_until: null,
      pause_reason: null,
      lock_reason: null,
      lock_since: null,
      trial_ends_at: null,
    },
    products: { on_store: 43, sold_out_marked: 0, no_stock: 0 },
    waseet: { calls_7d: 0, failed_7d: 0, last_error: null, last_error_at: null },
    prime: { is_active: true, last_synced_at: ago(0), last_error: null },
    whatsapp: { paused: false, pause_reason: null, paused_at: null, sent_7d: 14, delivered_7d: 12, failed_7d: 1 },
    wallet: { balance_iqd: 43800, threshold_iqd: 5000 },
    orders: { last_at: ago(0.5), last_7d: 9 },
    errors: { count_7d: 0, last_message: null, last_path: null, last_at: null },
    checked_at: new Date(NOW).toISOString(),
  };
}

const line = (check: ShopCheck, key: string) => {
  const found = shopCheckLines(check, TENANT, NOW).find((l) => l.key === key);
  if (!found) throw new Error(`no ${key} line`);
  return found;
};

describe("shopCheckLines", () => {
  it("reads a healthy shop as fine, with nothing in use marked as such", () => {
    const states = Object.fromEntries(shopCheckLines(healthy(), TENANT, NOW).map((l) => [l.key, l.state]));
    expect(states).toEqual({
      store: "ok",
      orders: "ok",
      products: "ok",
      wallet: "ok",
      whatsapp: "ok",
      delivery: "none",
      prime: "ok",
      errors: "ok",
    });
    expect(line(healthy(), "wallet").text).toBe("43,800 IQD");
  });

  it.each([
    ["cancelled", { status: "cancelled" }, "broken"],
    ["suspended", { status: "suspended" }, "broken"],
    ["locked for payment", { lock_reason: "trial_ended", lock_since: ago(2) }, "broken"],
    ["paused with new orders blocked", { status: "limited", paused: true, blocks_new_orders: true }, "broken"],
    ["paused without blocking orders", { status: "limited", paused: true }, "look"],
    ["a prospect store", { is_prospect: true }, "look"],
    ["a trial ending tomorrow", { status: "trial", trial_ends_at: ago(-1) }, "look"],
    ["a trial ending in a week", { status: "trial", trial_ends_at: ago(-7) }, "ok"],
  ])("store: %s", (_name, store, state) => {
    const check = healthy();
    check.store = { ...check.store, ...store };
    expect(line(check, "store").state).toBe(state);
  });

  it("says why a store is locked, in plain words", () => {
    const check = healthy();
    check.store.lock_reason = "trial_ended";
    check.store.lock_since = ago(2);
    expect(line(check, "store").text).toBe("Locked for payment since 2 days ago (trial ended).");
  });

  it("products: an empty store is broken, products with no stock are worth a look", () => {
    const check = healthy();
    check.products = { on_store: 0, sold_out_marked: 0, no_stock: 0 };
    expect(line(check, "products").state).toBe("broken");
    check.products = { on_store: 43, sold_out_marked: 2, no_stock: 8 };
    expect(line(check, "products")).toMatchObject({
      state: "look",
      text: "43 products on the store; 8 products with no stock left, 2 marked sold out.",
    });
  });

  it.each([
    [0, "broken"],
    [-500, "broken"],
    [4_999, "look"],
    [5_000, "ok"],
  ])("wallet at %s IQD is %s", (balance, state) => {
    const check = healthy();
    check.wallet = { balance_iqd: balance, threshold_iqd: 5000 };
    expect(line(check, "wallet").state).toBe(state);
  });

  it("wallet: a shop with no wallet row is worth a look", () => {
    const check = healthy();
    check.wallet = null;
    expect(line(check, "wallet")).toMatchObject({ state: "look", text: "No wallet yet." });
  });

  it("whatsapp: paused is broken; many failures are worth a look; few sends are not judged", () => {
    const check = healthy();
    check.whatsapp = { ...check.whatsapp, paused: true, pause_reason: "high_failure_rate", paused_at: ago(1) };
    expect(line(check, "whatsapp")).toMatchObject({ state: "broken", text: "Sending paused yesterday (high failure rate)." });
    check.whatsapp = { ...check.whatsapp, paused: false, sent_7d: 20, delivered_7d: 10, failed_7d: 5 };
    expect(line(check, "whatsapp").state).toBe("look");
    check.whatsapp = { ...check.whatsapp, sent_7d: 9, failed_7d: 5 };
    expect(line(check, "whatsapp").state).toBe("ok");
    check.whatsapp = { ...check.whatsapp, sent_7d: 0, failed_7d: 0 };
    expect(line(check, "whatsapp").state).toBe("none");
  });

  it("delivery: every call failing is broken, some failing is worth a look", () => {
    const check = healthy();
    check.waseet = { calls_7d: 3, failed_7d: 3, last_error: "Cloudflare 403", last_error_at: ago(0) };
    expect(line(check, "delivery")).toMatchObject({
      state: "broken",
      text: "3 of 3 calls failed in 7 days, newest today: Cloudflare 403",
    });
    check.waseet = { calls_7d: 10, failed_7d: 1, last_error: null, last_error_at: ago(1) };
    expect(line(check, "delivery").state).toBe("look");
  });

  it("prime: not linked, switched off, failing", () => {
    const check = healthy();
    check.prime = null;
    expect(line(check, "prime").state).toBe("none");
    check.prime = { is_active: false, last_synced_at: null, last_error: null };
    expect(line(check, "prime").state).toBe("broken");
    check.prime = { is_active: true, last_synced_at: ago(1), last_error: "401 from Prime" };
    expect(line(check, "prime")).toMatchObject({ state: "broken", text: "Last sync failed: 401 from Prime" });
  });

  it("orders: quiet for more than 3 days is worth a look; none ever is not judged", () => {
    const check = healthy();
    check.orders = { last_at: ago(4), last_7d: 2 };
    expect(line(check, "orders")).toMatchObject({ state: "look", text: "Newest 4 days ago; 2 orders in 7 days." });
    check.orders = { last_at: null, last_7d: 0 };
    expect(line(check, "orders").state).toBe("none");
  });

  it("errors: shows the newest error a merchant sent and always links to the shop in Sentry", () => {
    const check = healthy();
    check.errors = { count_7d: 2, last_message: "Failed to save", last_path: "/orders", last_at: ago(0) };
    const errors = line(check, "errors");
    expect(errors).toMatchObject({
      state: "look",
      text: "2 errors sent with messages in 7 days. Newest today on /orders: Failed to save",
    });
    expect(errors.href).toContain(`tenant_id%3A${TENANT}`);
  });

  // Baghdad is UTC+3: 19:00Z is 22:00 there, 02:00Z is 05:00.
  it.each([
    ["Mon 22:00 to Thu 23:00 (3 days on Trials)", "2026-11-16T19:00:00Z", "2026-11-19T20:00:00Z", "Taking orders. Trial ends in 3 days.", "look"],
    ["Mon 05:00 to Tue 08:00 (tomorrow on Trials)", "2026-11-16T02:00:00Z", "2026-11-17T05:00:00Z", "Taking orders. Trial ends tomorrow.", "look"],
    ["Mon 22:00 to Tue 05:00 (under a day)", "2026-11-16T19:00:00Z", "2026-11-17T02:00:00Z", "Taking orders. Trial ends in 7 h.", "look"],
    ["Mon 15:00 to Mon a week later", "2026-11-16T12:00:00Z", "2026-11-23T12:00:00Z", "Taking orders. Trial ends in 7 days.", "ok"],
    ["ended this morning, not locked yet", "2026-11-16T12:00:00Z", "2026-11-16T05:00:00Z", "Trial ended today, not paid yet.", "look"],
    ["ended two days ago, not locked yet", "2026-11-16T12:00:00Z", "2026-11-14T12:00:00Z", "Trial ended 2 days ago, not paid yet.", "look"],
  ])("store: a trial %s counts days like Trials", (_name, now, end, text, state) => {
    const check = healthy();
    check.store = { ...check.store, status: "trial", trial_ends_at: end };
    expect(shopCheckLines(check, TENANT, Date.parse(now)).find((l) => l.key === "store")).toMatchObject({ text, state });
  });

  it("names the same number of days as the Trials page at every hour of a Baghdad day", () => {
    const end = "2026-11-21T03:30:00Z"; // Sat 06:30 in Baghdad
    for (let hour = 0; hour < 24; hour += 1) {
      const now = Date.parse("2026-11-16T00:00:00+03:00") + hour * 3_600_000;
      const check = healthy();
      check.store = { ...check.store, status: "trial", trial_ends_at: end };
      const text = shopCheckLines(check, TENANT, now).find((l) => l.key === "store")?.text;
      expect(text).toBe(`Taking orders. Trial ends in ${trialClock(end, now).days} days.`);
    }
  });

  it("puts the store first and links to where staff fix it", () => {
    const lines = shopCheckLines(healthy(), TENANT, NOW);
    expect(lines[0].key).toBe("store");
    expect(lines.find((l) => l.key === "store")?.href).toBe(`/merchants/${TENANT}`);
    expect(lines.find((l) => l.key === "whatsapp")?.href).toBe("/whatsapp");
  });
});

describe("ShopCheckSchema", () => {
  it("accepts what the database answers for a shop with no Prime link and no wallet", () => {
    const check = { ...healthy(), prime: null, wallet: null };
    expect(ShopCheckSchema.parse(check)).toEqual(check);
  });

  it("refuses an answer missing a part", () => {
    const partial: Partial<ShopCheck> = healthy();
    delete partial.errors;
    expect(ShopCheckSchema.safeParse(partial).success).toBe(false);
  });
});

describe("daysAgo", () => {
  it.each([
    [ago(0.2), "today"],
    [ago(1.5), "yesterday"],
    [ago(5), "5 days ago"],
    [ago(-0.5), "tomorrow"],
    [ago(-3), "in 3 days"],
  ])("%s reads %s", (iso, expected) => {
    expect(daysAgo(iso, NOW)).toBe(expected);
  });

  // Baghdad is UTC+3: these are Mon 23:00 and Mon 23:50, seen on Tuesday.
  it.each([
    ["2026-11-16T20:00:00Z", "2026-11-17T07:00:00Z", "yesterday"],
    ["2026-11-16T20:50:00Z", "2026-11-16T21:30:00Z", "yesterday"],
    ["2026-11-16T21:30:00Z", "2026-11-17T20:30:00Z", "today"],
  ])("counts Baghdad days: %s seen at %s is %s", (iso, now, expected) => {
    expect(daysAgo(iso, Date.parse(now))).toBe(expected);
  });

  it("says a lock from last night began yesterday, as the shop page dates it", () => {
    const check = healthy();
    check.store.lock_reason = "trial_ended";
    check.store.lock_since = "2026-11-16T20:00:00Z";
    const store = shopCheckLines(check, TENANT, Date.parse("2026-11-17T07:00:00Z")).find((l) => l.key === "store");
    expect(store?.text).toBe("Locked for payment since yesterday (trial ended).");
  });
});
