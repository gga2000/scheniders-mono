import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Staff pause or resume one shop's automatic WhatsApp (handoff B2 item 10). */

const SHOP = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const logAdminActivity = vi.fn(async () => undefined);

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/activity-logger", () => ({ logAdminActivity }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "boss@example.com" }, role: "super_admin" })),
}));

const { POST } = await import("./route");

const post = (body: unknown, id = SHOP) =>
  POST(
    new NextRequest(`http://admin.test/api/merchants/${id}/whatsapp-pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  rpc.mockReset();
  logAdminActivity.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/merchants/[id]/whatsapp-pause", () => {
  it("pauses through the database as this admin and logs it", async () => {
    rpc.mockResolvedValue({
      data: { tenant_id: SHOP, paused: true, reason: "staff", paused_at: "2026-11-16T06:00:00Z" },
      error: null,
    });
    const res = await post({ paused: true });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_whatsapp_pause", { p_tenant_id: SHOP, p_pause: true, p_admin_id: ADMIN });
    expect(await res.json()).toMatchObject({ paused: true, reason: "staff" });
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ tenantId: SHOP, action: "pause_whatsapp" }));
  });

  it("resuming logs a resume", async () => {
    rpc.mockResolvedValue({ data: { tenant_id: SHOP, paused: false, reason: null, paused_at: null }, error: null });
    expect((await post({ paused: false })).status).toBe(200);
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "resume_whatsapp" }));
  });

  it("refuses a bad id or body without touching the database", async () => {
    expect((await post({ paused: true }, "not-a-uuid")).status).toBe(400);
    expect((await post({ paused: "yes" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an unknown shop is 404 and nothing is logged", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "no such shop" } });
    expect((await post({ paused: true })).status).toBe(404);
    expect(logAdminActivity).not.toHaveBeenCalled();
  });
});
