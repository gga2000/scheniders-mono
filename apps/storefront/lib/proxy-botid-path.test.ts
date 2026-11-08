import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { BOTID_ROUTE_PREFIX } from "./checkout-bot-paths";

describe("BotID routes", () => {
  it("are not rewritten under the store on a subdomain", () => {
    const host = "shop.localhost:3001";
    const req = new NextRequest(new URL(`https://${host}${BOTID_ROUTE_PREFIX}2d206a39-8ed7-437e-a3be-862e0f06eea3/x`), {
      method: "POST",
      headers: { host },
    });
    expect(proxy(req).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("store pages on a subdomain are still rewritten", () => {
    const host = "shop.localhost:3001";
    const req = new NextRequest(new URL(`https://${host}/checkout`), { headers: { host } });
    expect(proxy(req).headers.get("x-middleware-rewrite")).toContain("/s/shop/checkout");
  });
});
