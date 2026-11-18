import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Opening a lead reads the lead and four parts of it (history, follow-ups,
 * links, rivals) and the two people on it. Only the lead's own read was
 * checked: a failed part came back as [] and the page said "no history" or
 * "no follow-ups" for a lead that has them, and a failed name read showed
 * no owner. Any failed part now fails the page, which says it could not load.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "support_staff" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OWNER = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

type Answer = { data: unknown; error: unknown };
const ok = (data: unknown): Answer => ({ data, error: null });
const broken: Answer = { data: null, error: { message: "canceling statement due to statement timeout" } };

let answers: Record<string, Answer>;

function from(table: string) {
  const answer = () => answers[table];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => answer(),
    maybeSingle: async () => answer(),
    then: (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(answer()).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from }) }));

const { GET } = await import("./route");
const get = () =>
  GET(new NextRequest(`http://admin.test/api/leads/${LEAD}`), { params: Promise.resolve({ id: LEAD }) });

beforeEach(() => {
  answers = {
    leads: ok({ id: LEAD, merchant_name: "Kawkab", assigned_to: OWNER, created_by: null }),
    lead_activities: ok([{ id: "act1" }]),
    lead_follow_ups: ok([{ id: "fu1" }]),
    lead_social_links: ok([]),
    lead_competitors: ok([]),
    user_profiles: ok({ id: OWNER, display_name: "Noor", email: null, avatar_url: null }),
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/leads/[id]", () => {
  it("answers the lead with its parts and its owner", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toEqual([{ id: "act1" }]);
    expect(body.follow_ups).toEqual([{ id: "fu1" }]);
    expect(body.lead.assigned_user.display_name).toBe("Noor");
    expect(body.lead.created_by_user).toBeNull();
  });

  it.each(["lead_activities", "lead_follow_ups", "lead_social_links", "lead_competitors", "user_profiles"])(
    "fails the read when %s fails, in place of answering it as empty",
    async (table) => {
      answers[table] = broken;
      const res = await get();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to fetch lead" });
    },
  );

  it("shows no name for an owner whose profile is gone, without failing", async () => {
    answers.user_profiles = ok(null);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).lead.assigned_user).toBeNull();
  });

  it("answers 404 for a lead that is not there", async () => {
    answers.leads = { data: null, error: { code: "PGRST116", message: "0 rows" } };
    expect((await get()).status).toBe(404);
  });
});
