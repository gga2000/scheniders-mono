import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

let stored: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const upsert = vi.fn();

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
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

const filled = {
  qi_card: "1234 5678",
  qi_card_name: "Fermi",
  zain_cash: "",
  support_whatsapp: "9647701234567",
  working_hours: "Sat–Thu, 10 am–6 pm",
  legal_name: "Fermi LLC",
};

function put(body: unknown) {
  return PUT(new NextRequest("http://localhost/api/settings/payment-details", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => {
  upsert.mockReset();
  logAdminAction.mockClear();
  stored = { data: null, error: null };
});

describe("GET /api/settings/payment-details", () => {
  it("answers empty fields before anyone has filled them", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/settings/payment-details"))).json();
    expect(body).toEqual({
      details: { qi_card: "", qi_card_name: "", zain_cash: "", support_whatsapp: "", working_hours: "", legal_name: "" },
      updated_at: null,
    });
  });

  it("reads the saved setting", async () => {
    stored = { data: { value: filled, updated_at: "2026-11-16T10:00:00Z" }, error: null };
    const body = await (await GET(new NextRequest("http://localhost/api/settings/payment-details"))).json();
    expect(body).toEqual({ details: filled, updated_at: "2026-11-16T10:00:00Z" });
  });

  it("is a 500 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stored = { data: null, error: { message: "down" } };
    expect((await GET(new NextRequest("http://localhost/api/settings/payment-details"))).status).toBe(500);
  });
});

describe("PUT /api/settings/payment-details", () => {
  it("saves the row shops read, names the editor and writes the staff log", async () => {
    upsert.mockResolvedValue({ error: null });
    const res = await put({ ...filled, qi_card: " 1234 5678 " });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "topup_payment", value: filled, updated_by: ADMIN_ID }),
      { onConflict: "key" },
    );
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "update_payment_details", { details: filled });
  });

  it("refuses a WhatsApp number that is not digits, saving nothing", async () => {
    const res = await put({ ...filled, support_whatsapp: "0770-123" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Digits only/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a body without every field", async () => {
    expect((await put({ qi_card: "1" })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("is a 500 and logs nothing when the save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    upsert.mockResolvedValue({ error: { message: "down" } });
    expect((await put(filled)).status).toBe(500);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
