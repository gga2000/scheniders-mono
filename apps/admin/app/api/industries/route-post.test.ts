import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Adding an industry inserted it with the column default sort_order 0, so it
 * landed first, above every other industry, in the console's lists and the
 * shop onboarding wizard. Its staff log row was written in a second request.
 * Now one database call puts it just before "Other" and writes the row.
 */

const ADMIN = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "ops@example.com" }, role: "super_admin" })),
  requireBearerAdmin: vi.fn(),
}));
const logAdminAction = vi.fn();
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { POST } = await import("./route");

const add = (body: unknown) =>
  POST(new NextRequest("http://admin.test/api/industries", { method: "POST", body: JSON.stringify(body) }));

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Pets",
  name_ar: "حيوانات أليفة",
  icon: "PawPrint",
  color: "#336699",
  avg_order_value_iqd: 25000,
  is_active: true,
  sort_order: 100,
  created_at: "2026-11-17T09:00:00+00:00",
  recommended_template_id: null,
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  logAdminAction.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/industries", () => {
  it("adds through one database call that places it before \"Other\" and logs it", async () => {
    rpc.mockResolvedValue({ data: ROW, error: null });

    const res = await add({ name: " Pets ", name_ar: "حيوانات أليفة", icon: "PawPrint", color: "#336699" });

    expect(res.status).toBe(201);
    expect((await res.json()).industry).toMatchObject({ id: ROW.id, name: "Pets", sort_order: 100 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_add_industry", {
      _name: "Pets",
      _name_ar: "حيوانات أليفة",
      _icon: "PawPrint",
      _color: "#336699",
      _avg_order_value_iqd: 25000,
      _admin_user_id: ADMIN,
      _email: "ops@example.com",
    });
    // No insert or log write of its own: both are inside the database call.
    expect(from).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a bad industry before the database", async () => {
    const res = await add({ name: "   " });

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says so when an industry already has the name (two staff adding it at once get one)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "an industry with this name already exists" } });

    const res = await add({ name: "pets" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "An industry with this name already exists." });
  });

  it("answers 500 when the database fails or answers something else", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    expect((await add({ name: "Pets" })).status).toBe(500);

    rpc.mockResolvedValue({ data: { success: true }, error: null });
    expect((await add({ name: "Pets" })).status).toBe(500);
  });
});
