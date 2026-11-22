import { beforeEach, describe, expect, it } from "vitest";
import { supabaseStub } from "./supabase-stub.test-data";
import { REQUEST_REUSED } from "./billing-lock-tools";
import type { createAdminClient } from "./admin-supabase";
import {
  DECIDED_SHOWN,
  decideTrialCheck,
  matchLine,
  needsLook,
  readTrialChecks,
  storeName,
  trialCheckDecisionSchema,
} from "./trial-checks";

const NEW = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
const ADMIN = { id: "44444444-4444-4444-8444-444444444444", email: "agent@example.com" };

let stub: ReturnType<typeof supabaseStub>;
const client = () => stub.client as unknown as ReturnType<typeof createAdminClient>;

function store(id: string, display_id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    business_name: `Shop ${display_id}`,
    display_id,
    status: "trial",
    restrictions: {},
    trial_ends_at: "2026-11-23T10:00:00Z",
    contact_phone: "07701234567",
    created_at: "2026-11-16T10:00:00Z",
    ...extra,
  };
}

function check(tenant_id: string, extra: Record<string, unknown> = {}) {
  return {
    tenant_id,
    verdict: "review",
    signals: [{ family: "phone", source: "owner_phone", tenant_id: OLD }],
    trial_withheld_at: null,
    staff_decision: null,
    staff_reason: null,
    decided_by_email: null,
    decided_at: null,
    created_at: "2026-11-16T10:00:00Z",
    updated_at: "2026-11-16T10:00:00Z",
    ...extra,
  };
}

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.tenants = [store(NEW, 100200), store(OLD, 100100, { status: "cancelled", contact_phone: "07709999999" })];
});

describe("needsLook", () => {
  it("is open until decided, and again when a match comes in after the decision", () => {
    expect(needsLook({ decided_at: null, updated_at: "2026-11-16T10:00:00Z" })).toBe(true);
    expect(needsLook({ decided_at: "2026-11-16T11:00:00Z", updated_at: "2026-11-16T10:00:00Z" })).toBe(false);
    expect(needsLook({ decided_at: "2026-11-16T11:00:00Z", updated_at: "2026-11-16T11:00:00Z" })).toBe(false);
    expect(needsLook({ decided_at: "2026-11-16T11:00:00Z", updated_at: "2026-11-16T12:00:00Z" })).toBe(true);
  });
});

describe("readTrialChecks", () => {
  it("names the earlier store without its phone, and keeps the flagged store's phone for WhatsApp", async () => {
    stub.state.tables.trial_checks = [check(NEW)];
    const { checks, summary } = await readTrialChecks(client());

    expect(summary).toEqual({ needs_look: 1, no_trial: 0, review: 1 });
    expect(checks[0]?.store?.contact_phone).toBe("07701234567");
    expect(checks[0]?.matches).toEqual([
      {
        tenant_id: OLD,
        family: "phone",
        source: "owner_phone",
        store: {
          id: OLD,
          business_name: "Shop 100100",
          display_id: 100100,
          status: "cancelled",
          restrictions: {},
          trial_ends_at: "2026-11-23T10:00:00Z",
          created_at: "2026-11-16T10:00:00Z",
        },
      },
    ]);
    expect(JSON.stringify(checks[0]?.matches)).not.toContain("07709999999");
  });

  it("shows one line for two old numbers that match the same store, and a deleted store as gone", async () => {
    stub.state.tables.trial_checks = [
      check(NEW, {
        verdict: "no_trial",
        signals: [
          { family: "phone", source: "owner_phone", tenant_id: OLD },
          { family: "phone", source: "owner_phone", tenant_id: OLD },
          { family: "prime", source: "prime_account", tenant_id: GONE },
        ],
      }),
    ];
    const { checks } = await readTrialChecks(client());

    expect(checks[0]?.matches.map(matchLine)).toEqual([
      "Owner phone matches #100100 Shop 100100 (cancelled)",
      "Prime account matches a store that was deleted",
    ]);
  });

  it("says how many customers a store shares with an earlier one, and never which", async () => {
    stub.state.tables.trial_checks = [
      check(NEW, {
        verdict: "no_trial",
        signals: [
          { family: "phone", source: "owner_phone", tenant_id: OLD },
          { family: "customers", source: "customer_overlap", tenant_id: OLD, matched: 9, customers: 30 },
        ],
      }),
    ];
    const { checks } = await readTrialChecks(client());

    expect(checks[0]?.matches.map(matchLine)).toEqual([
      "Owner phone matches #100100 Shop 100100 (cancelled)",
      "9 of the first 30 customers also ordered from #100100 Shop 100100 (cancelled)",
    ]);
    expect(checks[0]?.matches[1]).toMatchObject({ family: "customers", shared: { matched: 9, customers: 30 } });
  });

  it("refuses a shared-customers signal without its counts", async () => {
    stub.state.tables.trial_checks = [
      check(NEW, { signals: [{ family: "customers", source: "customer_overlap", tenant_id: OLD }] }),
    ];
    await expect(readTrialChecks(client())).rejects.toThrow();
  });

  it("puts open rows first, newest change first, and keeps only the latest decided ones", async () => {
    const decided = Array.from({ length: DECIDED_SHOWN + 5 }, (_, i) =>
      check(`55555555-5555-4555-8555-${String(i).padStart(12, "0")}`, {
        staff_decision: "checked",
        decided_at: "2026-11-16T12:00:00Z",
        updated_at: `2026-11-16T10:${String(i).padStart(2, "0")}:00Z`,
      }),
    );
    stub.state.tables.trial_checks = [
      ...decided,
      check(NEW, { updated_at: "2026-11-16T09:00:00Z" }),
      check(OLD, { staff_decision: "checked", decided_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T09:30:00Z" }),
    ];
    const { checks, summary } = await readTrialChecks(client());

    expect(summary.needs_look).toBe(2);
    expect(checks.slice(0, 2).map((c) => c.tenant_id)).toEqual([OLD, NEW]);
    expect(checks).toHaveLength(2 + DECIDED_SHOWN);
    expect(checks[2]?.updated_at).toBe(`2026-11-16T10:${String(DECIDED_SHOWN + 4).padStart(2, "0")}:00Z`);
  });

  it("reads the stores a hundred ids at a time", async () => {
    stub.state.tables.trial_checks = Array.from({ length: 150 }, (_, i) =>
      check(`66666666-6666-4666-8666-${String(i).padStart(12, "0")}`),
    );
    await readTrialChecks(client());
    const reads = stub.callsTo("tenants.in").map((args) => (args[1] as unknown[]).length);
    expect(reads).toEqual([100, 51]);
  });

  it("fails loudly when a read fails, instead of a short list", async () => {
    stub.state.tables.trial_checks = [check(NEW)];
    stub.state.failing.add("tenants");
    await expect(readTrialChecks(client())).rejects.toBeTruthy();
  });
});

describe("decisions", () => {
  const REQ = "0b7d3f4e-8c1a-4f2b-9d6e-5a4c3b2a1f00";
  const SEEN = "2026-11-16T22:21:19.123456+00:00";

  it("giving a trial back needs the days; every decision needs a reason and a request id", () => {
    const ask = (body: Record<string, unknown>) =>
      trialCheckDecisionSchema.safeParse({ request_id: REQ, seen_decided_at: null, ...body }).success;
    expect(ask({ decision: "allow_trial", reason: "same owner" })).toBe(false);
    expect(ask({ decision: "allow_trial", days: 91, reason: "same owner" })).toBe(false);
    expect(ask({ decision: "allow_trial", days: 7, reason: "same owner" })).toBe(true);
    expect(ask({ decision: "end_trial", reason: "ok" })).toBe(false);
    expect(ask({ decision: "checked", reason: "family shop" })).toBe(true);
    expect(ask({ decision: "delete", reason: "family shop" })).toBe(false);
  });

  it("a page loaded before request ids is asked to reload", () => {
    const parsed = trialCheckDecisionSchema.safeParse({ decision: "allow_trial", days: 7, reason: "same owner" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("This page is out of date. Reload it and try again");
  });

  it("a page that does not say what decision it showed is asked to reload", () => {
    const base = { decision: "checked", reason: "family shop", request_id: REQ };
    for (const seen of [undefined, "", "yesterday"]) {
      const parsed = trialCheckDecisionSchema.safeParse({ ...base, seen_decided_at: seen });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe("This page is out of date. Reload it and try again");
    }
    expect(trialCheckDecisionSchema.safeParse({ ...base, seen_decided_at: null }).success).toBe(true);
    expect(trialCheckDecisionSchema.safeParse({ ...base, seen_decided_at: "2026-11-16T22:21:19.123456+00:00" }).success).toBe(true);
  });

  it("sends the decision once per request, with the staff member, what the page showed, and days only when giving the trial back", async () => {
    stub.state.functions.admin_trial_check_decide_once = (args) => ({
      data: { success: true, tenant_id: args._tenant_id, decision: args._decision },
      error: null,
    });

    await expect(
      decideTrialCheck(client(), NEW, { decision: "allow_trial", days: 7, reason: "same owner", request_id: REQ, seen_decided_at: null }, ADMIN),
    ).resolves.toEqual({ ok: true, tenantId: NEW, decision: "allow_trial", repeat: false });
    await decideTrialCheck(client(), NEW, { decision: "end_trial", reason: "same Prime login", request_id: REQ, seen_decided_at: SEEN }, ADMIN);

    expect(stub.state.rpcCalls.map((c) => [c.fn, c.args])).toEqual([
      [
        "admin_trial_check_decide_once",
        {
          _request_id: REQ,
          _tenant_id: NEW,
          _decision: "allow_trial",
          _reason: "same owner",
          _days: 7,
          _admin_user_id: ADMIN.id,
          _actor_email: ADMIN.email,
          _seen_decided_at: null,
        },
      ],
      [
        "admin_trial_check_decide_once",
        {
          _request_id: REQ,
          _tenant_id: NEW,
          _decision: "end_trial",
          _reason: "same Prime login",
          _days: null,
          _admin_user_id: ADMIN.id,
          _actor_email: ADMIN.email,
          _seen_decided_at: SEEN,
        },
      ],
    ]);
  });

  it("a repeat of an answered request says so and changes nothing", async () => {
    stub.state.functions.admin_trial_check_decide_once = (args) => ({
      data: { success: true, tenant_id: args._tenant_id, decision: "allow_trial", repeat: true },
      error: null,
    });
    await expect(
      decideTrialCheck(client(), NEW, { decision: "allow_trial", days: 7, reason: "same owner", request_id: REQ, seen_decided_at: null }, ADMIN),
    ).resolves.toEqual({ ok: true, tenantId: NEW, decision: "allow_trial", repeat: true });
  });

  it("turns the database's refusals into answers staff can read", async () => {
    const checked = { decision: "checked", reason: "same owner", request_id: REQ, seen_decided_at: null } as const;
    stub.state.functions.admin_trial_check_decide_once = () => ({ data: { success: false, error: "not_trial" }, error: null });
    await expect(
      decideTrialCheck(client(), NEW, { decision: "end_trial", reason: "same owner", request_id: REQ, seen_decided_at: null }, ADMIN),
    ).resolves.toEqual({ ok: false, status: 409, error: "This shop is no longer on trial. Reload the page to see it" });

    stub.state.functions.admin_trial_check_decide_once = () => ({ data: { success: false, error: "not_found" }, error: null });
    await expect(decideTrialCheck(client(), NEW, checked, ADMIN)).resolves.toEqual({
      ok: false,
      status: 404,
      error: "This store has no trial check",
    });

    stub.state.functions.admin_trial_check_decide_once = () => ({
      data: { success: false, error: "request_reused" },
      error: null,
    });
    await expect(decideTrialCheck(client(), NEW, checked, ADMIN)).resolves.toEqual({ ok: false, ...REQUEST_REUSED });

    stub.state.functions.admin_trial_check_decide_once = () => ({
      data: { success: false, error: "decided_meanwhile" },
      error: null,
    });
    const meanwhile = await decideTrialCheck(client(), NEW, checked, ADMIN);
    expect(meanwhile).toMatchObject({ ok: false, status: 409 });
    expect(meanwhile.ok === false && meanwhile.error).toMatch(/while you were looking/);

    stub.state.functions.admin_trial_check_decide_once = () => ({ data: { success: false, error: "odd" }, error: null });
    await expect(decideTrialCheck(client(), NEW, checked, ADMIN)).rejects.toThrow("Unexpected trial check answer: odd");
  });
});

describe("labels", () => {
  it("names a store by its number and name", () => {
    expect(storeName({ business_name: "Al Noor", display_id: 100123 })).toBe("#100123 Al Noor");
    expect(storeName({ business_name: "Al Noor", display_id: null })).toBe("Al Noor");
    expect(storeName(null)).toBe("a store that was deleted");
  });
});
