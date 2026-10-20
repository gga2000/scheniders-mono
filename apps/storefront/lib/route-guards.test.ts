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
  it("keeps path mode on /s/<new>", () => {
    expect(renamedStoreTarget("zahraa-beauty", "/s/old", "scheniders.com", "https")).toBe(
      "/s/zahraa-beauty",
    );
  });

  it("moves subdomain mode to the new subdomain on the same root host", () => {
    expect(renamedStoreTarget("new", "", "old.scheniders.com", "https")).toBe(
      "https://new.scheniders.com",
    );
    expect(renamedStoreTarget("new", "", "old.localhost:3001", "http")).toBe(
      "http://new.localhost:3001",
    );
  });

  it("refuses a subdomain-mode host it cannot rebuild", () => {
    expect(renamedStoreTarget("new", "", null, null)).toBeNull();
    expect(renamedStoreTarget("new", "", "localhost", null)).toBeNull();
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
