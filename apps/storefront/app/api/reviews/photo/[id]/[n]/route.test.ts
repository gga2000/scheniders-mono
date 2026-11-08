import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
let row: { tenant_id: string; photo_paths: string[] } | null = null;
const download = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  // The anon client: RLS returns only approved reviews of live stores.
  createSupabaseServerClient: async () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  }),
  createSupabaseServiceClient: () => ({ storage: { from: () => ({ download }) } }),
}));

import { GET } from "./route";

const call = (id: string, n: string) => GET(new Request("http://x"), { params: Promise.resolve({ id, n }) });

beforeEach(() => {
  row = null;
  download.mockReset();
  download.mockResolvedValue({ data: new Blob(["img"], { type: "image/webp" }), error: null });
});

describe("GET /api/reviews/photo/[id]/[n]", () => {
  it("serves a photo of an approved review", async () => {
    row = { tenant_id: TENANT, photo_paths: [`${TENANT}/p/a.webp`] };
    const res = await call(REVIEW, "0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(download).toHaveBeenCalledWith(`${TENANT}/p/a.webp`);
  });

  it("404s a review that is not approved (RLS returns no row)", async () => {
    expect((await call(REVIEW, "0")).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("never serves a path outside the review's own store", async () => {
    row = { tenant_id: TENANT, photo_paths: ["33333333-3333-4333-8333-333333333333/p/b.webp"] };
    expect((await call(REVIEW, "0")).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("404s a bad id or index", async () => {
    expect((await call("nope", "0")).status).toBe(404);
    row = { tenant_id: TENANT, photo_paths: [`${TENANT}/p/a.webp`] };
    expect((await call(REVIEW, "3")).status).toBe(404);
  });
});
