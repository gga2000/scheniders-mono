import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

import { GET, POST } from "./route";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

const UUID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

/** Chainable select-builder whose terminal (.limit) resolves to `result`. */
function selectChain(result: unknown) {
  const p = Promise.resolve(result);
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.limit = () => p;
  return b;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/reviews", () => {
  it("400s on a missing/invalid query", async () => {
    const res = await GET(new Request("http://x/api/reviews"));
    expect(res.status).toBe(400);
  });

  it("returns approved reviews + computed summary", async () => {
    (createSupabaseServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => selectChain({ data: [{ rating: 5 }, { rating: 3 }], error: null }),
    });
    const res = await GET(
      new Request(`http://x/api/reviews?product_id=${UUID}&tenant_id=${UUID}`),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.count).toBe(2);
    expect(json.summary.average).toBe(4); // (5+3)/2
    expect(json.reviews).toHaveLength(2);
  });
});

function serviceMock(opts: {
  product: unknown;
  insertSpy?: ReturnType<typeof vi.fn>;
}) {
  const insertSpy = opts.insertSpy ?? vi.fn(() => Promise.resolve({ error: null }));
  return {
    from: (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: opts.product, error: null }),
              }),
            }),
          }),
        };
      }
      return { insert: insertSpy };
    },
  };
}

function postForm(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x/api/reviews", { method: "POST", body: fd });
}

describe("POST /api/reviews", () => {
  it("400s when rating is missing", async () => {
    const res = await POST(postForm({ tenant_id: UUID, product_id: UUID }));
    expect(res.status).toBe(400);
  });

  it("404s for an unknown product", async () => {
    (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      serviceMock({ product: null }),
    );
    const res = await POST(
      postForm({ tenant_id: UUID, product_id: UUID, rating: "5" }),
    );
    expect(res.status).toBe(404);
  });

  it("inserts a pending review on a valid submission", async () => {
    const insertSpy = vi.fn((_row: { status: string; rating: number }) =>
      Promise.resolve({ error: null }),
    );
    (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      serviceMock({ product: { id: UUID }, insertSpy }),
    );
    const res = await POST(
      postForm({
        tenant_id: UUID,
        product_id: UUID,
        rating: "5",
        author_name: "Ali",
        body: "Great product",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pending).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.status).toBe("pending");
    expect(inserted.rating).toBe(5);
  });
});
