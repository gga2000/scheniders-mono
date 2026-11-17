import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Deleting a lead. A lead with a prospect store was deleted like any other:
 * the store stayed online with the business's name, phone and address, its
 * link to the lead was cleared, and no screen could find it again. Such a
 * lead is refused with its name, and the database skips it in the delete
 * itself, so a store built at the same moment keeps its lead.
 *
 * The staff log row is all that remains of a deleted lead. It was written in
 * a second request after the delete, and lost when that request failed. Now
 * admin_delete_leads deletes and writes the row in one transaction.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const { DELETE } = await import("./route");
const remove = () =>
  DELETE(new NextRequest(`http://admin.test/api/leads/${LEAD}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: LEAD }),
  });
const answer = (removed: Array<{ id: string; merchant_name: string }>, kept: string[] = []) =>
  rpc.mockResolvedValue({ data: { removed, kept_with_store: kept }, error: null });

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/leads/[id]", () => {
  it("deletes the lead and writes its log row in one database call", async () => {
    answer([{ id: LEAD, merchant_name: "Kawkab" }]);

    const res = await remove();

    expect(await res.json()).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_delete_leads", {
      _lead_ids: [LEAD],
      _admin_user_id: "a1",
      _actor_email: "a@b.co",
      _bulk: false,
    });
    // No delete or log write of its own: both are inside the database call.
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a lead with a prospect store, by name", async () => {
    answer([], ["Kawkab"]);

    const res = await remove();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      '"Kawkab" has a prospect store, so it can\'t be deleted. The store would stay online with no lead to find it by.',
    );
  });

  it("answers success for a lead that is gone already", async () => {
    answer([]);

    expect(await (await remove()).json()).toEqual({ success: true });
  });

  it("answers 500 when the database fails or answers something else", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    expect((await remove()).status).toBe(500);

    rpc.mockResolvedValue({ data: { deleted: true }, error: null });
    expect((await remove()).status).toBe(500);
  });
});
