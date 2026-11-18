import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { healthScore, shopHealth } from "./shop-health-score";

/*
 * Round 6: the Merchants list and the shop page read staff_health_score and
 * staff_health_parts on every row, and the score calls the parts, so the
 * parts (a count of 30 days of orders each) were worked out twice. The API now
 * reads the parts and adds them up here. The database keeps its own sum for
 * the health filter and sort, so the two must stay the same sum.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

describe("a shop's health score", () => {
  it("is 50 plus the parts", () => {
    expect(healthScore({ status: 15, wallet: 5, orders: 5 })).toBe(75);
    expect(healthScore({ status: -20, wallet: -10, orders: 0 })).toBe(20);
    expect(healthScore({ status: 15, wallet: 15, orders: 15 })).toBe(95);
  });

  it("stays between 0 and 100, as the database keeps it", () => {
    expect(healthScore({ status: -40, wallet: -20, orders: 0 })).toBe(0);
    expect(healthScore({ status: 40, wallet: 40, orders: 0 })).toBe(100);
  });

  it("comes with the parts it was made from", () => {
    expect(shopHealth({ status: 5, wallet: 5, orders: 5 })).toEqual({
      staff_health_parts: { status: 5, wallet: 5, orders: 5 },
      staff_health_score: 65,
    });
  });

  it("refuses parts that are missing or not whole numbers", () => {
    expect(() => shopHealth(null)).toThrow();
    expect(() => shopHealth({ status: 5, wallet: 5 })).toThrow();
    expect(() => shopHealth({ status: "5", wallet: 5, orders: 5 })).toThrow();
  });

  it("is the same sum as the database's staff_health_score, which the filter and sort use", () => {
    const definitions = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
      .filter((sql) => /CREATE OR REPLACE FUNCTION public\.staff_health_score\b/i.test(sql));
    const latest = definitions.at(-1) ?? "";
    const body = latest.slice(latest.search(/CREATE OR REPLACE FUNCTION public\.staff_health_score\b/i)).split("$$;")[0];

    expect(body.replace(/\s+/g, " ")).toContain(
      "greatest(0, least(100, 50 + (p.parts ->> 'status')::integer + (p.parts ->> 'wallet')::integer + (p.parts ->> 'orders')::integer ))",
    );
  });
});
