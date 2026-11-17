import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Settings > Industries moved an industry in two saves that traded sort_order
 * with its neighbour. Two industries added from the console both had 0, so
 * trading did nothing, and a refused second save left two sharing a number.
 * Now one call: the database moves, renumbers and logs in one transaction.
 */

const INDUSTRY = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "ops@example.com" }, role: "super_admin" })),
}));

const { POST } = await import("./route");

const post = (body: unknown, id = INDUSTRY) =>
  POST(
    new NextRequest(`http://admin.test/api/industries/${id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/industries/[id]/move", () => {
  it("moves up in one database call that also writes the staff log row", async () => {
    rpc.mockResolvedValue({ data: { success: true, place: 1, of: 14 }, error: null });

    const res = await post({ direction: "up" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ place: 1, of: 14 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_move_industry", {
      _industry_id: INDUSTRY,
      _step: -1,
      _admin_user_id: ADMIN,
      _email: "ops@example.com",
    });
  });

  it("moves down as step 1", async () => {
    rpc.mockResolvedValue({ data: { success: true, place: 3, of: 14 }, error: null });

    expect((await post({ direction: "down" })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_move_industry", expect.objectContaining({ _step: 1 }));
  });

  it("says why the database refused", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "at_edge" }, error: null });
    const edge = await post({ direction: "up" });
    expect(edge.status).toBe(409);
    expect(await edge.json()).toEqual({ error: "This industry is already at the end of the list." });

    rpc.mockResolvedValue({ data: { success: false, error: "not_found" }, error: null });
    const gone = await post({ direction: "down" });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "This industry no longer exists." });
  });

  it("refuses a bad id or direction without touching the database", async () => {
    expect((await post({ direction: "up" }, "not-an-id")).status).toBe(404);
    expect((await post({ direction: "left" })).status).toBe(400);
    expect((await post({ sort_order: 3 })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails or answers something else", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    expect((await post({ direction: "up" })).status).toBe(500);

    rpc.mockResolvedValue({ data: { moved: true }, error: null });
    expect((await post({ direction: "up" })).status).toBe(500);
  });
});
