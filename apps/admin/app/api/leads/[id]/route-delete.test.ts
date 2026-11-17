import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Deleting a lead. A lead with a prospect store was deleted like any other:
 * the store stayed online with the business's name, phone and address, its
 * link to the lead was cleared, and no screen could find it again. Now such
 * a lead is refused with its name, and the filter is in the delete itself,
 * so a store built at the same moment keeps its lead.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));
const logged: unknown[][] = [];
vi.mock("@/lib/activity-logger", () => ({ logAdminAction: async (...args: unknown[]) => void logged.push(args) }));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";

type Step = { method: string; args: unknown[] };
/** Every chain the route built on leads. */
let chains: Step[][];
/** What the delete removed, and what a read finds. */
let removed: { merchant_name: string } | null;
let found: { merchant_name: string } | null;

function chain(steps: Step[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
      }
      return (...args: unknown[]) => {
        steps.push({ method: String(prop), args });
        if (prop === "maybeSingle") {
          const deleting = steps.some((s) => s.method === "delete");
          return Promise.resolve({ data: deleting ? removed : found, error: null });
        }
        return chain(steps);
      };
    },
  });
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: () => {
      const steps: Step[] = [];
      chains.push(steps);
      return chain(steps);
    },
  }),
}));

const { DELETE } = await import("./route");
const remove = () =>
  DELETE(new NextRequest(`http://admin.test/api/leads/${LEAD}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: LEAD }),
  });

beforeEach(() => {
  chains = [];
  removed = null;
  found = null;
  logged.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/leads/[id]", () => {
  it("deletes a lead without a prospect store, only when it has none, and logs its name", async () => {
    removed = { merchant_name: "Kawkab" };

    const res = await remove();

    expect(await res.json()).toEqual({ success: true });
    expect(chains[0]).toContainEqual({ method: "delete", args: [] });
    expect(chains[0]).toContainEqual({ method: "is", args: ["prospect_tenant_id", null] });
    expect(logged).toEqual([[expect.anything(), "delete_lead", { details: { lead_id: LEAD, merchant_name: "Kawkab" } }]]);
  });

  it("refuses a lead with a prospect store, by name, and logs nothing", async () => {
    found = { merchant_name: "Kawkab" };

    const res = await remove();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      '"Kawkab" has a prospect store, so it can\'t be deleted. The store would stay online with no lead to find it by.',
    );
    expect(chains[1]).toContainEqual({ method: "not", args: ["prospect_tenant_id", "is", null] });
    expect(logged).toEqual([]);
  });

  it("answers success for a lead that is gone already, and logs nothing", async () => {
    const res = await remove();

    expect(await res.json()).toEqual({ success: true });
    expect(logged).toEqual([]);
  });
});
