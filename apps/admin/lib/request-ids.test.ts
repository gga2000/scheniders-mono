import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createRequestIds } from "./request-ids";

/*
 * A staff top-up carries an id the server uses to drop a repeat. The id must
 * stay the same for a retry of the same request and change for a new one, or
 * a retry credits twice / a wanted second top-up is dropped.
 */
describe("createRequestIds", () => {
  it("gives a retry of the same payload the same id", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:receipt 12");
    expect(ids.idFor("shop-a:5000:receipt 12")).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("gives a different payload a new id", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:");
    expect(ids.idFor("shop-a:6000:")).not.toBe(first);
    expect(ids.idFor("shop-b:5000:")).not.toBe(first);
  });

  it("gives the same payload a new id once the request is done", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:");
    ids.done();
    expect(ids.idFor("shop-a:5000:")).not.toBe(first);
  });

  it("keeps each ask's id until a success, so a retry after another ask keeps its own", () => {
    // Round 20: only the last ask was kept. 50,000 lost, then 10,000, then
    // 50,000 again went out with a new id and could be credited twice.
    const ids = createRequestIds();
    const fifty = ids.idFor("shop-a:50000");
    const ten = ids.idFor("shop-a:10000");
    expect(ten).not.toBe(fifty);
    expect(ids.idFor("shop-a:50000")).toBe(fifty);
    ids.done();
    expect(ids.idFor("shop-a:50000")).not.toBe(fifty);
    expect(ids.idFor("shop-a:10000")).not.toBe(ten);
  });

  it("keeps two forms apart", () => {
    const a = createRequestIds();
    const b = createRequestIds();
    expect(a.idFor("shop-a:5000:")).not.toBe(b.idFor("shop-a:5000:"));
  });
});

/*
 * Round 20: the ids were keyed by the reason's words. A form opened again
 * starts empty, so a retry typed in other words got a new id and a wallet
 * could be credited twice. Every key is what moves (shop, amount, days), never
 * the free text staff type.
 */
const ADMIN_DIR = path.resolve(__dirname, "..");
// "extensionReason" and "topUpDescription" count too.
const FREE_TEXT = /reason|description|\bwhy\b|\bhow\b|\bnote\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("every request id key", () => {
  it("is what moves, never the words staff type", () => {
    const keys: string[] = [];
    const found: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const text = readFileSync(file, "utf8");
        for (let at = text.indexOf(".idFor("); at >= 0; at = text.indexOf(".idFor(", at + 1)) {
          // A key is a template literal, on one line or several: read to its closing backtick.
          const rest = text.slice(at, at + 400);
          const end = rest.search(/`\s*,?\s*\)/);
          const key = (end > 0 ? rest.slice(0, end + 1) : rest.split("\n")[0]).replace(/\s+/g, " ");
          keys.push(key);
          if (FREE_TEXT.test(key)) found.push(`${path.relative(ADMIN_DIR, file).split(path.sep).join("/")}: ${key}`);
        }
      }
    }
    expect(keys.length).toBeGreaterThanOrEqual(9);
    expect(found).toEqual([]);
  });
});
