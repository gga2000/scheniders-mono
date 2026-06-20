import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const UUID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function req(body: unknown): Request {
  return new Request("http://x/api/cart/abandoned", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validItem = { product_id: UUID, name: "Widget", quantity: 2, price: 5000 };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/cart/abandoned", () => {
  it("400s on an invalid body", async () => {
    const res = await POST(req({ tenant_id: "nope", phone: "x", items: [] }));
    expect(res.status).toBe(400);
  });

  it("no-ops (skipped) on an unmessageable phone", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ upsert }),
    });
    const res = await POST(
      req({ tenant_id: UUID, phone: "12345", items: [validItem] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe("phone");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts a normalized phone + computed subtotal", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ upsert }),
    });
    const res = await POST(
      req({
        tenant_id: UUID,
        phone: "+964 770 000 0000",
        items: [validItem],
        governorate: "BG",
        locale: "ar",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0] as unknown as [
      { phone: string; subtotal_iqd: number },
      { onConflict: string },
    ];
    expect(row.phone).toBe("07700000000");
    expect(row.subtotal_iqd).toBe(10000); // 5000 × 2
    expect(opts.onConflict).toBe("tenant_id,phone");
  });
});
