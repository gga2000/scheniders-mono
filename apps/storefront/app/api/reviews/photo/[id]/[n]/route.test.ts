import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "44444444-4444-4444-8444-444444444444";
const PHOTO = `${TENANT}/${PRODUCT}/55555555-5555-4555-8555-555555555555.webp`;
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
    row = { tenant_id: TENANT, photo_paths: [PHOTO] };
    const res = await call(REVIEW, "0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(download).toHaveBeenCalledWith(PHOTO);
  });

  it("404s a review that is not approved (RLS returns no row)", async () => {
    expect((await call(REVIEW, "0")).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("never serves a path outside the review's own store", async () => {
    row = { tenant_id: TENANT, photo_paths: [PHOTO.replace(TENANT, "33333333-3333-4333-8333-333333333333")] };
    expect((await call(REVIEW, "0")).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    `${TENANT}/../../../../../rest/v1/orders?select=*`,
    `${TENANT}/${PRODUCT}/../../other-bucket/x.webp`,
    `${TENANT}/p/a.webp`,
    `${PHOTO}?x=1`,
    PHOTO.replace(".webp", ".svg"),
  ])("never hands a non-upload path to the service client: %s", async (path) => {
    row = { tenant_id: TENANT, photo_paths: [path] };
    expect((await call(REVIEW, "0")).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("404s a bad id or index", async () => {
    expect((await call("nope", "0")).status).toBe(404);
    row = { tenant_id: TENANT, photo_paths: [PHOTO] };
    expect((await call(REVIEW, "3")).status).toBe(404);
  });
});
