import { describe, it, expect, vi } from "vitest";
import { updateShop } from "./shop-update";
import type { createAdminClient } from "./admin-supabase";

/*
 * A status or plan change used to be two table writes and a log insert from
 * the route. It is one database call now; this is the one place that knows its
 * arguments and what each refusal means to staff.
 */

const TENANT = "33333333-3333-4333-8333-333333333333";
const ACTOR = { id: "aaaaaaaa-1111-4222-8333-444444444444", email: "ops@example.com" };

function client(answer: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => answer);
  // Only `rpc` is used: a table write from here would be a bug, and has nothing to call.
  return { rpc, supabase: { rpc } as unknown as ReturnType<typeof createAdminClient> };
}

const done = (over: Record<string, unknown> = {}) => ({
  data: {
    success: true,
    tenant_id: TENANT,
    status: "suspended",
    plan: "starter",
    auto_renew: true,
    pending_plan: null,
    changed: ["status_change"],
    ...over,
  },
  error: null,
});

describe("updateShop", () => {
  it("asks the database for the change, with the acting admin and where it came from", async () => {
    const { rpc, supabase } = client(done());
    const result = await updateShop(supabase, TENANT, { status: "suspended" }, ACTOR, "bulk");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_update_shop", {
      _tenant_id: TENANT,
      _status: "suspended",
      _plan: null,
      _auto_renew: null,
      _admin_user_id: ACTOR.id,
      _actor_email: ACTOR.email,
      _source: "bulk",
    });
    expect(result).toEqual({
      ok: true,
      shop: { id: TENANT, status: "suspended", plan: "starter", auto_renew: true, pending_plan: null, changed: ["status_change"] },
    });
  });

  it("sends auto-renew false as false, not as nothing asked", async () => {
    const { rpc, supabase } = client(done({ auto_renew: false, changed: ["auto_renew_toggle"] }));
    await updateShop(supabase, TENANT, { auto_renew: false }, ACTOR);

    expect(rpc).toHaveBeenCalledWith(
      "admin_update_shop",
      expect.objectContaining({ _status: null, _plan: null, _auto_renew: false, _source: "single" }),
    );
  });

  it("a shop with no subscription has no auto-renew to report", async () => {
    const { supabase } = client(done({ auto_renew: null, changed: [] }));
    const result = await updateShop(supabase, TENANT, { plan: "starter" }, ACTOR);

    expect(result).toMatchObject({ ok: true, shop: { auto_renew: null, changed: [] } });
  });

  it.each([
    ["not_found", 404, "Merchant not found"],
    ["demo_store", 409, "This is the demo store. Its status does not change."],
    ["use_pause", 409, "Use Pause to limit a shop: it sets what is blocked and for how long."],
    ["paused", 409, "This shop is paused. Resume it first."],
    ["still_trial", 409, "This shop is on trial. Use Convert to paid to make it a paying shop."],
    ["not_trialing", 409, "This shop's subscription is not a trial, so it cannot go back to Trial."],
    ["no_subscription", 409, "This shop has no subscription yet."],
    [
      "subscription_ended",
      409,
      "This shop's subscription has ended, so it would never be billed for a paid plan. The plan stays as it is.",
    ],
  ])("a refusal %s tells staff what to do", async (code, status, error) => {
    const { supabase } = client({ data: { success: false, error: code }, error: null });

    expect(await updateShop(supabase, TENANT, { status: "active" }, ACTOR)).toEqual({ ok: false, status, error });
  });

  it("a database error is thrown, never read as done", async () => {
    const { supabase } = client({ data: null, error: { message: "deadlock detected" } });

    await expect(updateShop(supabase, TENANT, { status: "active" }, ACTOR)).rejects.toMatchObject({
      message: "deadlock detected",
    });
  });

  it.each([
    ["a refusal it does not know", { success: false, error: "something_new" }],
    ["no answer", null],
    ["an answer with no status", { success: true, tenant_id: TENANT, plan: "starter", auto_renew: true, pending_plan: null, changed: [] }],
  ])("%s is thrown, never read as done", async (_name, data) => {
    const { supabase } = client({ data, error: null });

    await expect(updateShop(supabase, TENANT, { status: "active" }, ACTOR)).rejects.toThrow();
  });
});
