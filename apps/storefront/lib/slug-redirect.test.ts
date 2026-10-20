import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown> | null;
type Result = { data: Row; error: { message: string } | null };

/** Canned PostgREST answers, keyed `table:column=value`. */
const answers = vi.hoisted(() => new Map<string, Result>());

vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: () => Promise<T>) => fn,
}));

vi.mock("./supabase/server", () => ({
  createSupabasePublicClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async (): Promise<Result> =>
            answers.get(`${table}:${column}=${value}`) ?? { data: null, error: null },
        }),
      }),
    }),
  }),
}));

import { resolveRenamedSlug } from "./slug-redirect";

beforeEach(() => {
  answers.clear();
  vi.restoreAllMocks();
});

describe("resolveRenamedSlug", () => {
  it("follows old_slug to the tenant's CURRENT slug", async () => {
    answers.set("tenant_slug_history:old_slug=tenant-1783087997714", {
      data: { tenant_id: "t1" },
      error: null,
    });
    answers.set("tenants:id=t1", { data: { slug: "zahraa-beauty" }, error: null });
    await expect(resolveRenamedSlug("tenant-1783087997714")).resolves.toBe("zahraa-beauty");
  });

  it("returns null for a slug no store ever had", async () => {
    await expect(resolveRenamedSlug("never-existed")).resolves.toBeNull();
  });

  it("returns null when the store is not publicly readable (suspended)", async () => {
    // public_storefront_read admits only trial/active, so anon sees no row.
    answers.set("tenant_slug_history:old_slug=old", { data: { tenant_id: "t2" }, error: null });
    await expect(resolveRenamedSlug("old")).resolves.toBeNull();
  });

  it("never redirects a slug to itself", async () => {
    answers.set("tenant_slug_history:old_slug=same", { data: { tenant_id: "t3" }, error: null });
    answers.set("tenants:id=t3", { data: { slug: "same" }, error: null });
    await expect(resolveRenamedSlug("same")).resolves.toBeNull();
  });

  it("reports a failed history lookup instead of swallowing it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    answers.set("tenant_slug_history:old_slug=broken", {
      data: null,
      error: { message: "permission denied" },
    });
    await expect(resolveRenamedSlug("broken")).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(
      "[slug-redirect] history lookup failed:",
      { message: "permission denied" },
    );
  });

  it("reports a failed current-slug lookup", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    answers.set("tenant_slug_history:old_slug=half", { data: { tenant_id: "t4" }, error: null });
    answers.set("tenants:id=t4", { data: null, error: { message: "timeout" } });
    await expect(resolveRenamedSlug("half")).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith("[slug-redirect] current-slug lookup failed:", {
      message: "timeout",
    });
  });
});
