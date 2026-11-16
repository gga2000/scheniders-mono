import { describe, expect, it } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { patchMerchantInCache } from "./use-infinite-merchants";

type Page = { merchants: AdminTenant[]; total: number; page: number; limit: number };

const shop = (id: string, status: AdminTenant["status"], plan: AdminTenant["plan"]) =>
  ({ id, status, plan, tags: [] }) as unknown as AdminTenant;

function seeded() {
  const client = new QueryClient();
  const list: InfiniteData<Page> = {
    pages: [{ merchants: [shop("a", "trial", "starter"), shop("b", "active", "internal")], total: 2, page: 1, limit: 50 }],
    pageParams: [1],
  };
  client.setQueryData(["admin", "merchants", "list", { status: null }], list);
  client.setQueryData(["admin", "merchants", "list", { status: "trial" }], {
    pages: [{ merchants: [shop("a", "trial", "starter")], total: 1, page: 1, limit: 50 }],
    pageParams: [1],
  });
  client.setQueryData(["admin", "merchants", "stats"], { total: 2 });
  return client;
}

const statusesOf = (client: QueryClient) =>
  client
    .getQueriesData<InfiniteData<Page>>({ queryKey: ["admin", "merchants", "list"] })
    .map(([, data]) => data?.pages.flatMap((p) => p.merchants.map((m) => `${m.id}:${m.status}:${m.plan}`)));

describe("patchMerchantInCache", () => {
  it("changes the shop in every loaded list and leaves other shops and other queries alone", () => {
    const client = seeded();
    patchMerchantInCache(client, "a", { status: "active" });
    expect(statusesOf(client)).toEqual([["a:active:starter", "b:active:internal"], ["a:active:starter"]]);
    expect(client.getQueryData(["admin", "merchants", "stats"])).toEqual({ total: 2 });
  });

  it("gives back a step that puts every list back when the server refuses the change", () => {
    const client = seeded();
    const before = statusesOf(client);
    const restore = patchMerchantInCache(client, "a", { status: "active", plan: "internal" });
    expect(statusesOf(client)).not.toEqual(before);
    restore();
    expect(statusesOf(client)).toEqual(before);
    expect(statusesOf(client)).toEqual([["a:trial:starter", "b:active:internal"], ["a:trial:starter"]]);
  });
});
