import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { config as middlewareConfig } from "./middleware";

/**
 * The console's server code calls the database and the auth server several
 * times for each page and each API call, so it must run in the Vercel region
 * next to them, as the merchant app and the storefront do. With no region set,
 * Vercel ran it in Washington (iad1) and every call crossed the Atlantic: about
 * 105 ms each, against about 27 ms from Frankfurt (Supabase logs, 17 Nov 2026).
 */
const vercelConfig = z.object({ regions: z.array(z.string()).optional() });

function regionsOf(app: string): string[] | undefined {
  const file = path.resolve(__dirname, "..", app, "vercel.json");
  return vercelConfig.parse(JSON.parse(readFileSync(file, "utf8"))).regions;
}

describe("server region", () => {
  it("runs the console in Frankfurt, next to the database", () => {
    expect(regionsOf("admin")).toEqual(["fra1"]);
  });

  it("checks access in the same region, before every request goes on there", () => {
    expect(middlewareConfig.regions).toEqual(regionsOf("admin"));
  });

  it("runs the console where the merchant app and the storefront run", () => {
    expect(regionsOf("platform")).toEqual(regionsOf("admin"));
    expect(regionsOf("storefront")).toEqual(regionsOf("admin"));
  });
});
