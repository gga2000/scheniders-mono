import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

let stored: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const upsert = vi.fn();
const keys: string[] = [];

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: (_column: string, key: string) => (keys.push(key), q),
        maybeSingle: () => Promise.resolve(stored),
        upsert,
      };
      return q;
    },
  }),
}));

const logAdminAction = vi.fn(async () => undefined);
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "support_staff" })),
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
}));

const { GET, PUT } = await import("./route");

function put(body: unknown) {
  return PUT(new NextRequest("http://localhost/api/settings/signup-whatsapp", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => {
  upsert.mockReset();
  logAdminAction.mockClear();
  keys.length = 0;
  stored = { data: null, error: null };
});

describe("/api/settings/signup-whatsapp (Fermi B11)", () => {
  it("reads as all off before anyone has switched anything", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/settings/signup-whatsapp"))).json();
    expect(body).toEqual({ settings: { phone_code: false, welcome: false, welcome_video_url: null }, updated_at: null });
    expect(keys).toEqual(["signup_whatsapp"]);
  });

  it("saves the switches and the video under their own key, and logs who did", async () => {
    upsert.mockResolvedValue({ error: null });
    const settings = { phone_code: true, welcome: true, welcome_video_url: "https://youtu.be/abc" };
    const res = await put(settings);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: "signup_whatsapp", value: settings, updated_by: ADMIN_ID }), { onConflict: "key" });
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "update_signup_whatsapp", { details: settings });
  });

  it("refuses a welcome with no code before it or no video, and saves nothing", async () => {
    for (const body of [
      { phone_code: false, welcome: true, welcome_video_url: "https://youtu.be/abc" },
      { phone_code: true, welcome: true, welcome_video_url: null },
      { phone_code: "yes", welcome: false, welcome_video_url: null },
    ]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(upsert).not.toHaveBeenCalled();
  });
});
