import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signPreviewToken } from "@scheniders/shared/preview-token";
import type { StoreConfigV2 } from "@scheniders/shared";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/app/actions/checkout", () => ({
  submitCheckout: vi.fn(),
}));

import { cookies } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { submitCheckout } from "@/app/actions/checkout";
import { POST } from "@/app/api/checkout/orders/route";
import { DRAFT_VIEW_COOKIE, isDraftViewRequest } from "./draft-view";
import { withDraftView } from "./tenant";
import { DEV_PREVIEW_TOKEN } from "./preview-access";
import type { Tenant } from "./types";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const SECRET = "test-preview-secret";

const PUBLISHED_V2 = { brand_kit: { identity: { name: "published" } } } as unknown as StoreConfigV2;
const DRAFT_V2 = { brand_kit: { identity: { name: "draft" } } } as unknown as StoreConfigV2;

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT_ID,
    business_name: "Store",
    slug: "store",
    store_config_v2: PUBLISHED_V2,
    ...overrides,
  } as Tenant;
}

/** Point `cookies()` at a jar holding only the draft-view cookie (or none). */
function withCookie(token: string | undefined): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === DRAFT_VIEW_COOKIE && token !== undefined ? { name, value: token } : undefined,
  } as never);
}

describe("draft-view flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a visitor without the cookie gets the published tenant, unflagged", async () => {
    withCookie(undefined);
    const published = tenant();
    const loadWithDraft = vi.fn();
    const out = await withDraftView(published, loadWithDraft);
    expect(out).toBe(published);
    expect(out?.is_draft_view).toBeUndefined();
    expect(loadWithDraft).not.toHaveBeenCalled();
    expect(await isDraftViewRequest(TENANT_ID)).toBe(false);
  });

  it("a valid token for this tenant renders the draft and sets is_draft_view", async () => {
    withCookie(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    const out = await withDraftView(tenant(), async () =>
      tenant({ store_config_v2_draft: DRAFT_V2 }),
    );
    expect(out?.is_draft_view).toBe(true);
    expect(out?.store_config_v2).toBe(DRAFT_V2);
    expect(out?.store_config_v2_draft).toBeNull();
    expect(await isDraftViewRequest(TENANT_ID)).toBe(true);
  });

  it("a token minted for another tenant is not a draft-view session", async () => {
    withCookie(signPreviewToken({ tenant_id: OTHER_TENANT_ID }, SECRET, 600));
    const published = tenant();
    const out = await withDraftView(published, async () =>
      tenant({ store_config_v2_draft: DRAFT_V2 }),
    );
    expect(out).toBe(published);
    expect(out?.is_draft_view).toBeUndefined();
    expect(await isDraftViewRequest(TENANT_ID)).toBe(false);
  });

  it("a forged/garbage token is rejected", async () => {
    withCookie("not-a-token");
    expect(await isDraftViewRequest(TENANT_ID)).toBe(false);
  });

  it("still flags the session when the draft fails to load", async () => {
    withCookie(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    const published = tenant();
    const out = await withDraftView(published, async () => null);
    expect(out?.is_draft_view).toBe(true);
    expect(out?.store_config_v2).toBe(PUBLISHED_V2);
    // The cached published object itself is never mutated.
    expect(published.is_draft_view).toBeUndefined();
  });

  it("no tenant stays no tenant", async () => {
    withCookie(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    expect(await withDraftView(null, async () => tenant())).toBeNull();
  });

  it("the dev token only opens draft view outside production with no secret", async () => {
    vi.stubEnv("PREVIEW_TOKEN_SECRET", "");
    withCookie(DEV_PREVIEW_TOKEN);
    expect(await isDraftViewRequest(TENANT_ID)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(await isDraftViewRequest(TENANT_ID)).toBe(false);
  });
});

describe("checkout order from draft view", () => {
  const mockInsert = vi.fn();
  const mockFrom = vi.fn();
  const body = {
    tenant_id: TENANT_ID,
    customer_name: "Ali Hassan",
    phone: "07701234567",
    governorate_code: "BG",
    city: "Baghdad",
    address_details: "Street 14",
    items: [
      {
        product_id: OTHER_TENANT_ID,
        variant_id: null,
        name: "P",
        variant_name: null,
        price: 1000,
        quantity: 1,
      },
    ],
  };
  const post = () =>
    POST(
      new Request("http://localhost/api/checkout/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  /** sb_vid present (so an experiment event WOULD be written) + an optional
   *  draft-view token. */
  function jar(draftToken: string | undefined): void {
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => {
        if (name === "sb_vid") return { name, value: "visitor-abc" };
        if (name === DRAFT_VIEW_COOKIE && draftToken !== undefined)
          return { name, value: draftToken };
        return undefined;
      },
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
    vi.mocked(submitCheckout).mockResolvedValue({ success: true, total: 1000 });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) =>
      table === "tenants"
        ? {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    store_config_v2: {
                      experiments: [
                        {
                          id: "exp",
                          status: "running",
                          arms: [{ id: "arm", traffic_pct: 100 }],
                        },
                      ],
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }
        : { insert: mockInsert },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: mockFrom } as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records the experiment conversion for a shopper", async () => {
    jar(undefined);
    expect((await post()).status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("keeps a draft-view test order out of the experiment's revenue", async () => {
    jar(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
    // The order itself still goes through with the unchanged payload.
    expect(submitCheckout).toHaveBeenCalledTimes(1);
  });
});
