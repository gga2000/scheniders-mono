import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Delete counted the leads using an industry and did not look at the count's
 * error: a failed count came back empty, the industry was removed, and the
 * database cleared it from every lead that used it. Now one database call
 * counts, removes or switches off, and writes the staff log row.
 */

const INDUSTRY = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "ops@example.com" }, role: "super_admin" })),
}));
const logAdminAction = vi.fn();
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { DELETE } = await import("./route");

const del = (id = INDUSTRY) =>
  DELETE(new NextRequest(`http://admin.test/api/industries/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  logAdminAction.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DELETE /api/industries/[id]", () => {
  it("asks the database once, which removes and logs in one transaction", async () => {
    rpc.mockResolvedValue({ data: { success: true, result: "removed" }, error: null });

    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "removed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_remove_industry", {
      _industry_id: INDUSTRY,
      _admin_user_id: ADMIN,
      _email: "ops@example.com",
    });
    expect(from).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("says an industry leads use was switched off, with how many", async () => {
    rpc.mockResolvedValue({ data: { success: true, result: "switched_off", leads_using_it: 28 }, error: null });

    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "switched_off", leads_using_it: 28 });
  });

  it("answers 404 for an industry that no longer exists", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "not_found" }, error: null });

    const res = await del();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This industry no longer exists." });
  });

  it("answers 500 and removes nothing it cannot account for when the database fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });

    expect((await del()).status).toBe(500);
  });

  it("does not take an answer it cannot read as done", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    expect((await del()).status).toBe(500);
  });

  it("refuses a bad id before the database is asked", async () => {
    expect((await del("not-an-id")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});
