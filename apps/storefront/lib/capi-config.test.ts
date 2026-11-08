import { beforeEach, describe, expect, it, vi } from "vitest";

// The data cache is a no-op here: each call runs the read.
vi.mock("./cached-read", () => ({
  cachedRead: vi.fn((_k: string[], _o: unknown, read: (h: { failed: boolean }) => unknown) =>
    read({ failed: false }),
  ),
}));

const lockbox = vi.fn();
vi.mock("./supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => lockbox(table),
          in: () => ({ maybeSingle: async () => lockbox(table) }),
        }),
      }),
    }),
  })),
}));

import { liveStoreAnalytics, withCapiKeys } from "./capi-config";

const TENANT = "00000000-0000-4000-8000-000000000001";

describe("withCapiKeys", () => {
  beforeEach(() => lockbox.mockReset());

  it("uses the lockbox keys and ignores a key left in the design", async () => {
    lockbox.mockReturnValue({ data: { meta_capi_token: "box-meta", tiktok_capi_token: null }, error: null });
    const out = await withCapiKeys(
      { meta_pixel_id: "1", meta_capi_token: "old-design-copy", tiktok_capi_token: "old-tt" },
      TENANT,
    );
    expect(out).toEqual({ meta_pixel_id: "1", meta_capi_token: "box-meta" });
  });

  it("sends nothing server-side when the lockbox is empty", async () => {
    lockbox.mockReturnValue({ data: null, error: null });
    const out = await withCapiKeys({ meta_pixel_id: "1", meta_capi_token: "old-design-copy" }, TENANT);
    expect(out.meta_capi_token).toBeUndefined();
  });

  it("a failed lockbox read keeps the pixel ids and drops the keys", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    lockbox.mockReturnValue({ data: null, error: { message: "boom" } });
    const out = await withCapiKeys({ meta_pixel_id: "1" }, TENANT);
    expect(out).toEqual({ meta_pixel_id: "1" });
    err.mockRestore();
  });
});

describe("liveStoreAnalytics", () => {
  beforeEach(() => lockbox.mockReset());

  it("joins the design's pixel ids with the lockbox key", async () => {
    lockbox.mockImplementation((table: string) =>
      table === "tenants"
        ? { data: { store_config_v2: { globals: { analytics_pixels: { base: { meta_pixel_id: "9" } } } } }, error: null }
        : { data: { meta_capi_token: "box-meta", tiktok_capi_token: "box-tt" }, error: null },
    );
    expect(await liveStoreAnalytics(TENANT)).toEqual({
      meta_pixel_id: "9",
      meta_capi_token: "box-meta",
      tiktok_capi_token: "box-tt",
    });
  });

  it("is null for a store with no pixel config", async () => {
    lockbox.mockReturnValue({ data: null, error: null });
    expect(await liveStoreAnalytics(TENANT)).toBeNull();
  });
});
