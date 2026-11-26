import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { interaktFields } from "@/lib/custom-whatsapp-queue";

/** Staff submit a shop's paid custom WhatsApp message in Interakt by hand and record Meta's answer. */

const SHOP = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const REQ = "33333333-3333-4333-8333-333333333333";

const rpc = vi.fn();
const logAdminAction = vi.fn(async () => undefined);
/** What each `from(...)` read answers, in call order (open requests, then ended ones). */
const reads: { data: unknown[]; error: null }[] = [];
const env: { PLATFORM_URL?: string } = {};

function readQuery() {
  const q = {
    select: () => q,
    in: () => q,
    not: () => q,
    gte: () => q,
    order: () => q,
    limit: () => q,
    then: (resolve: (v: unknown) => void) => resolve(reads.shift() ?? { data: [], error: null }),
  };
  return q;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from: () => readQuery() }) }));
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));
vi.mock("@/lib/admin-env", () => ({ env }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: ADMIN, email: "agent@example.com" }, role: "support_staff" })),
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "agent@example.com" }, role: "support_staff" })),
}));

const { GET } = await import("./route");
const { POST } = await import("./[id]/route");

const BODY = "هلا {customer_name}، طلبك من {store_name} رقم {order_number}. للاستفسار {store_name} على {store_whatsapp} وشكراً";

function row(status: string, over: Record<string, unknown> = {}) {
  return {
    id: REQ,
    tenant_id: SHOP,
    purpose: "confirmation",
    body: BODY,
    template_name: "custom_confirmation_100095_1",
    status,
    category: null,
    in_use: false,
    price_iqd: 15000,
    reason: null,
    created_at: "2026-11-26T10:00:00Z",
    sent_to_meta_at: null,
    decided_at: null,
    refunded_at: null,
    ...over,
  };
}

const post = (body: unknown, id = REQ) =>
  POST(
    new NextRequest(`http://admin.test/api/whatsapp/custom-templates/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  rpc.mockReset();
  logAdminAction.mockClear();
  reads.length = 0;
  delete env.PLATFORM_URL;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/whatsapp/custom-templates", () => {
  it("lists what waits on us first, then on Meta, then the decided ones newest first", async () => {
    const tenant = { business_name: "عطور الكرادة", display_id: 100095 };
    reads.push(
      {
        data: [
          row("at_meta", { id: "a", created_at: "2026-11-25T00:00:00Z", tenant }),
          row("review", { id: "b", created_at: "2026-11-26T00:00:00Z", tenant }),
          row("review", { id: "c", created_at: "2026-11-24T00:00:00Z", tenant }),
        ],
        error: null,
      },
      {
        data: [
          row("live", { id: "d", category: "utility", created_at: "2026-11-20T00:00:00Z", tenant }),
          row("declined", { id: "e", reason: "فيه رابط", created_at: "2026-11-22T00:00:00Z", tenant }),
        ],
        error: null,
      },
    );
    env.PLATFORM_URL = "https://schenidersapp.xyz/";
    const res = await GET(new NextRequest("http://admin.test/api/whatsapp/custom-templates"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.map((i: { id: string }) => i.id)).toEqual(["c", "b", "a", "e", "d"]);
    expect(json.header_images.confirmation).toBe("https://schenidersapp.xyz/whatsapp/order-confirm.png");
  });

  it("says there is no picture link when the merchant app's address is not set", async () => {
    const res = await GET(new NextRequest("http://admin.test/api/whatsapp/custom-templates"));
    expect(await res.json()).toEqual({ items: [], header_images: null });
  });
});

describe("POST /api/whatsapp/custom-templates/[id]", () => {
  it("marks it submitted in Interakt as this staff member and logs the step", async () => {
    rpc.mockResolvedValue({ data: row("at_meta", { sent_to_meta_at: "2026-11-26T11:00:00Z" }), error: null });
    const res = await post({ step: "at_meta" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_custom_whatsapp_template_step", {
      p_id: REQ,
      p_step: "at_meta",
      p_admin_id: ADMIN,
      p_category: undefined,
      p_reason: undefined,
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: ADMIN }) }),
      "custom_wa_step",
      expect.objectContaining({ tenantId: SHOP, details: expect.objectContaining({ step: "at_meta", refunded_iqd: null }) }),
    );
  });

  it("approves it under the category Meta chose", async () => {
    rpc.mockResolvedValue({ data: row("live", { category: "marketing", in_use: true }), error: null });
    expect((await post({ step: "live", category: "marketing" })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_custom_whatsapp_template_step", expect.objectContaining({ p_step: "live", p_category: "marketing" }));
  });

  it("a refusal carries the reason the shop reads and logs the refund", async () => {
    rpc.mockResolvedValue({
      data: row("rejected", { reason: "ميتا تريد كلام أوضح", refunded_at: "2026-11-26T12:00:00Z" }),
      error: null,
    });
    expect((await post({ step: "rejected", reason: "  ميتا تريد كلام أوضح " })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "admin_custom_whatsapp_template_step",
      expect.objectContaining({ p_step: "rejected", p_reason: "ميتا تريد كلام أوضح" }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "custom_wa_step",
      expect.objectContaining({ details: expect.objectContaining({ step: "rejected", refunded_iqd: 15000 }) }),
    );
  });

  it("refuses a missing category or reason, or an unknown step, before the database", async () => {
    expect((await post({ step: "live" })).status).toBe(400);
    expect((await post({ step: "declined" })).status).toBe(400);
    expect((await post({ step: "declined", reason: "no" })).status).toBe(400);
    expect((await post({ step: "review" })).status).toBe(400);
    expect((await post({ step: "at_meta" }, "not-an-id")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a step the request has moved past is 409, an unknown request 404, and neither is logged", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "custom message is live, cannot be marked at_meta" } });
    expect((await post({ step: "at_meta" })).status).toBe(409);
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "no such custom message" } });
    expect((await post({ step: "at_meta" })).status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("a database failure is a 500, not a success", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect((await post({ step: "at_meta" })).status).toBe(500);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe("what staff type into Interakt", () => {
  it("numbers the fields in order and gives a sample for each", () => {
    const fields = Object.fromEntries(
      interaktFields({ purpose: "confirmation", body: BODY, template_name: "custom_confirmation_100095_1" }).map((f) => [f.label, f.value]),
    );
    expect(fields["Template name"]).toBe("custom_confirmation_100095_1");
    expect(fields.Category).toBe("Utility");
    expect(fields.Language).toBe("Arabic");
    expect(fields.Body).toBe("هلا {{1}}، طلبك من {{2}} رقم {{3}}. للاستفسار {{4}} على {{5}} وشكراً");
    expect(fields["Variable samples"].split("\n")).toHaveLength(5);
    expect(fields["Variable samples"].split("\n")[3]).toBe("{{4}} اسم المتجر: عطور الكرادة");
    expect(fields["Quick reply buttons"]).toBe("تأكيد الطلب\nإلغاء الطلب");
  });

  it("submits the discount offer as marketing, like Fermi's own", () => {
    const category = interaktFields({ purpose: "discount", body: "خصم {discount} من {store_name} هسه", template_name: "custom_discount_1_1" })[1];
    expect(category).toEqual({ label: "Category", value: "Marketing" });
  });
});
