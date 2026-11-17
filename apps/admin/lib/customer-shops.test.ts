import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOMER_SHOP, CUSTOMER_SHOP_EMBEDDED } from "./customer-shops";

/*
 * Round 5 of the staff console audit: prospect stores, built for a lead
 * before it signs up, were counted as shops and listed as trials, while the
 * demo store was left out of each read one by one.
 */

const API = join(__dirname, "..", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("stores that are not customers", () => {
  it("are the demo store and prospect stores, on a shop read or a joined one", () => {
    expect(CUSTOMER_SHOP).toEqual({ is_demo: false, is_prospect: false });
    expect(CUSTOMER_SHOP_EMBEDDED).toEqual({ "tenants.is_demo": false, "tenants.is_prospect": false });
  });

  it("are left out through the one rule, never by skipping the demo store alone", () => {
    const alone = routeFiles(API).filter((file) => /\.eq\(\s*"(tenants\.)?is_demo",\s*false\s*\)/.test(readFileSync(file, "utf8")));
    expect(alone).toEqual([]);
  });
});
