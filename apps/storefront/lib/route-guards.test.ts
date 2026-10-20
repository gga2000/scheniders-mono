import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  tenant: null as { id: string; status: string } | null,
  renamed: null as string | null,
  headers: new Map<string, string>(),
}));

class Redirected extends Error {
  constructor(readonly target: string) {
    super(`redirect:${target}`);
  }
}
class NotFound extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound();
  },
  permanentRedirect: (target: string) => {
    throw new Redirected(target);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => state.headers.get(k) ?? null }),
}));
vi.mock("@/lib/tenant", () => ({
  getTenantBySlug: async () => state.tenant,
  getTenantByCustomDomain: async () => state.tenant,
}));
vi.mock("@/lib/slug-redirect", () => ({
  resolveRenamedSlug: async () => state.renamed,
}));
vi.mock("@/lib/queries", () => ({}));
vi.mock("@/lib/redirects", () => ({ enforceRedirect: () => {} }));

import { renamedStoreTarget, requireStoreTenant } from "./route-guards";

beforeEach(() => {
  state.tenant = null;
  state.renamed = null;
  state.headers = new Map();
});

describe("renamedStoreTarget", () => {
  const OLD = "tenant-1783087997714";

  it("keeps path mode on /s/<new>", () => {
    expect(
      renamedStoreTarget({
        oldSlug: OLD,
        renamed: "zahraa-beauty",
        storeBase: `/s/${OLD}`,
        storePath: `/s/${OLD}`,
        host: "scheniders.com",
        proto: "https",
      }),
    ).toBe("/s/zahraa-beauty");
  });

  it("keeps a shared product link's path and query in path mode", () => {
    expect(
      renamedStoreTarget({
        oldSlug: OLD,
        renamed: "zahraa-beauty",
        storeBase: `/s/${OLD}`,
        storePath: `/s/${OLD}/products/lipstick?utm_source=whatsapp&v=2`,
        host: "scheniders.com",
        proto: "https",
      }),
    ).toBe("/s/zahraa-beauty/products/lipstick?utm_source=whatsapp&v=2");
  });

  it("keeps the query on a path-mode home link", () => {
    expect(
      renamedStoreTarget({
        oldSlug: OLD,
        renamed: "new",
        storeBase: `/s/${OLD}`,
        storePath: `/s/${OLD}?utm_source=whatsapp`,
        host: "scheniders.com",
        proto: "https",
      }),
    ).toBe("/s/new?utm_source=whatsapp");
  });

  it("falls back to the store home when the path is not this old slug's", () => {
    // A prefix match is not enough: /s/<old>x/... names a different store.
    for (const storePath of [`/s/${OLD}x/products/a`, "/s/other/products/a", null]) {
      expect(
        renamedStoreTarget({
          oldSlug: OLD,
          renamed: "new",
          storeBase: `/s/${OLD}`,
          storePath,
          host: "scheniders.com",
          proto: "https",
        }),
      ).toBe("/s/new");
    }
  });

  it("moves subdomain mode to the new subdomain on the same root host", () => {
    expect(
      renamedStoreTarget({
        oldSlug: "old",
        renamed: "new",
        storeBase: "",
        storePath: "/",
        host: "old.scheniders.com",
        proto: "https",
      }),
    ).toBe("https://new.scheniders.com/");
    expect(
      renamedStoreTarget({
        oldSlug: "old",
        renamed: "new",
        storeBase: "",
        storePath: null,
        host: "old.localhost:3001",
        proto: "http",
      }),
    ).toBe("http://new.localhost:3001/");
  });

  it("keeps a shared product link's path and query in subdomain mode", () => {
    expect(
      renamedStoreTarget({
        oldSlug: "old",
        renamed: "new",
        storeBase: "",
        storePath: "/products/lipstick?utm_source=whatsapp",
        host: "old.scheniders.com",
        proto: "https",
      }),
    ).toBe("https://new.scheniders.com/products/lipstick?utm_source=whatsapp");
  });

  it("never lets the forwarded path change the redirect's host", () => {
    for (const storePath of ["@evil.example/x", "//evil.example/x", "https://evil.example/x"]) {
      const target = renamedStoreTarget({
        oldSlug: "old",
        renamed: "new",
        storeBase: "",
        storePath,
        host: "old.scheniders.com",
        proto: "https",
      });
      expect(target).not.toBeNull();
      expect(new URL(target ?? "").host).toBe("new.scheniders.com");
    }
  });

  it("refuses a subdomain-mode host it cannot rebuild", () => {
    const base = { oldSlug: "old", renamed: "new", storeBase: "", storePath: "/" };
    expect(renamedStoreTarget({ ...base, host: null, proto: null })).toBeNull();
    expect(renamedStoreTarget({ ...base, host: "localhost", proto: null })).toBeNull();
  });
});

describe("requireStoreTenant", () => {
  it("returns a showable tenant without consulting the history", async () => {
    state.tenant = { id: "t1", status: "active" };
    state.renamed = "elsewhere";
    await expect(requireStoreTenant("shop")).resolves.toEqual(state.tenant);
  });

  it("permanently redirects a renamed store's old slug", async () => {
    state.renamed = "zahraa-beauty";
    state.headers.set("x-store-base", "/s/tenant-1783087997714");
    await expect(requireStoreTenant("tenant-1783087997714")).rejects.toEqual(
      new Redirected("/s/zahraa-beauty"),
    );
  });

  it("lands an old shared product link on the same product under the new slug", async () => {
    state.renamed = "zahraa-beauty";
    state.headers.set("x-store-base", "/s/tenant-1783087997714");
    state.headers.set("x-store-path", "/s/tenant-1783087997714/products/lipstick?utm_source=wa");
    await expect(requireStoreTenant("tenant-1783087997714")).rejects.toEqual(
      new Redirected("/s/zahraa-beauty/products/lipstick?utm_source=wa"),
    );
  });

  it("lands an old subdomain product link on the new subdomain's product", async () => {
    state.renamed = "new";
    state.headers.set("x-store-base", "");
    state.headers.set("x-store-path", "/products/lipstick?utm_source=wa");
    state.headers.set("host", "old.scheniders.com");
    state.headers.set("x-forwarded-proto", "https");
    await expect(requireStoreTenant("old")).rejects.toEqual(
      new Redirected("https://new.scheniders.com/products/lipstick?utm_source=wa"),
    );
  });

  it("404s an unknown slug with no history", async () => {
    await expect(requireStoreTenant("nope")).rejects.toBeInstanceOf(NotFound);
  });

  it("never treats a custom-domain param as an old slug", async () => {
    state.renamed = "should-not-be-used";
    await expect(requireStoreTenant("__domain__shop.example")).rejects.toBeInstanceOf(NotFound);
  });

  it("still 404s a cancelled store", async () => {
    state.tenant = { id: "t1", status: "cancelled" };
    await expect(requireStoreTenant("gone")).rejects.toBeInstanceOf(NotFound);
  });
});
