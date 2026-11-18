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

/**
 * Each `.from("tenants")` in the API with the query chained on it, up to the
 * next query or the end of the statement. Comments are dropped first: a ";"
 * in one would end the read early.
 */
function shopReads(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/\.from\("tenants"\)/g)].map((match) => {
    const rest = code.slice(match.index);
    const end = rest.slice(1).search(/;|\bsupabase\b|\.from\(/);
    return end === -1 ? rest : rest.slice(0, end + 1);
  });
}

/**
 * A shop read either keeps to customers through the one rule, or names the
 * shops it reads (one shop's page, the shops ticked on a list), or is the
 * demo store's own read, or writes.
 */
function keepsToCustomers(read: string): boolean {
  return (
    read.includes("CUSTOMER_SHOP") ||
    /\.(eq|in)\(\s*"id",/.test(read) ||
    /\.eq\(\s*"is_demo",\s*true\s*\)/.test(read) ||
    /\.(insert|update|upsert)\(/.test(read)
  );
}

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

  it("are left out of every list of shops the API reads", () => {
    // Round 6: the Trials download read every "trial" shop with no rule, so it listed prospect stores.
    const unruled = routeFiles(API).flatMap((file) =>
      shopReads(readFileSync(file, "utf8"))
        .filter((read) => !keepsToCustomers(read))
        .map((read) => `${file.slice(API.length)}: ${read.replace(/\s+/g, " ").slice(0, 120)}`),
    );
    expect(unruled).toEqual([]);
  });
});

describe("the shop-read guard itself", () => {
  it("passes a read that uses the rule, names its shop, or writes", () => {
    expect(keepsToCustomers('.from("tenants").select("id").match(CUSTOMER_SHOP).range(0, 9)')).toBe(true);
    expect(keepsToCustomers('.from("tenants").select("id").eq("id", id).single()')).toBe(true);
    expect(keepsToCustomers('.from("tenants").select("id").in("id", ids)')).toBe(true);
    expect(keepsToCustomers('.from("tenants").update({ status: "active" }).eq("id", id)')).toBe(true);
  });

  it("reads past a comment with a semicolon in it", () => {
    const [read] = shopReads('supabase.from("tenants").select("id")\n  // a store; no customer\n  .match(CUSTOMER_SHOP);');
    expect(keepsToCustomers(read)).toBe(true);
  });

  it("catches a list read with no rule, even when the next query names one shop", () => {
    const [list] = shopReads(
      'await Promise.all([supabase.from("tenants").select("id").eq("status", "trial"), supabase.from("wallet").select("*").eq("id", id)]);',
    );
    expect(keepsToCustomers(list)).toBe(false);
  });
});
