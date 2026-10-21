import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  createSupabasePublicClient: vi.fn(),
}));

import * as route from "./route";
import {
  createSupabasePublicClient,
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

beforeEach(() => vi.clearAllMocks());

describe("/api/cart/abandoned (PKG-12 interim: capture disabled)", () => {
  it("returns 410 and calls no Supabase client", async () => {
    // Every method the route exports answers 410; POST is the only one.
    const exported = HTTP_METHODS.filter((m) => m in route);
    expect(exported).toEqual(["POST"]);

    const res = route.POST();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "Abandoned-cart capture is disabled" });

    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(createSupabasePublicClient).not.toHaveBeenCalled();
  });
});
