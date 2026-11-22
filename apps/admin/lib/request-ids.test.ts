import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createRequestIds, KEPT_FOR_MS, keptRequestIds, type KeptStorage } from "./request-ids";

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
 * Round 21 (structure new 3): ids lived in one form's memory. A retry after
 * leaving the page, a reload, a second tab, or Quick Top-Up after Add money
 * for the same shop and amount sent a new id and could credit twice, while
 * the server's words promised "once at most".
 */
describe("keptRequestIds", () => {
  /** A browser's localStorage, shared by every page and tab that reads it. */
  function browser(): KeptStorage {
    const items = new Map<string, string>();
    return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
  }

  it("keeps an id across pages, reloads and tabs of one browser", () => {
    const storage = browser();
    const billing = keptRequestIds("topup", { storage });
    const id = billing.idFor("shop-a:50000");
    // The shop page's Add money, or Billing after a reload: a new handle, the same browser.
    expect(keptRequestIds("topup", { storage }).idFor("shop-a:50000")).toBe(id);
  });

  it("keeps kinds apart", () => {
    const storage = browser();
    const topUp = keptRequestIds("topup", { storage }).idFor("shop-a:7");
    expect(keptRequestIds("free-days", { storage }).idFor("shop-a:7")).not.toBe(topUp);
  });

  it("ends only the ask that went through", () => {
    const storage = browser();
    const ids = keptRequestIds("topup", { storage });
    const fifty = ids.idFor("shop-a:50000"); // its answer was lost
    const ten = ids.idFor("shop-a:10000");
    ids.done(); // 10,000 went through
    expect(ids.idFor("shop-a:50000")).toBe(fifty);
    expect(ids.idFor("shop-a:10000")).not.toBe(ten);
  });

  it("ends an ask from another handle once it goes through there", () => {
    const storage = browser();
    const id = keptRequestIds("topup", { storage }).idFor("shop-a:50000");
    const shopPage = keptRequestIds("topup", { storage });
    expect(shopPage.idFor("shop-a:50000")).toBe(id);
    shopPage.done();
    expect(keptRequestIds("topup", { storage }).idFor("shop-a:50000")).not.toBe(id);
  });

  it("forgets an ask after an hour, so a wanted top-up later is a new one", () => {
    const storage = browser();
    let at = 1_000_000;
    const now = () => at;
    const id = keptRequestIds("topup", { storage, now }).idFor("shop-a:50000");
    at += KEPT_FOR_MS - 1;
    expect(keptRequestIds("topup", { storage, now }).idFor("shop-a:50000")).toBe(id);
    at += KEPT_FOR_MS;
    expect(keptRequestIds("topup", { storage, now }).idFor("shop-a:50000")).not.toBe(id);
  });

  it("keeps ids in the tab when the browser refuses its storage", () => {
    const refusing: KeptStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const first = keptRequestIds("lock", { storage: refusing }).idFor("shop-b:orders:50");
    expect(keptRequestIds("lock", { storage: refusing }).idFor("shop-b:orders:50")).toBe(first);
  });

  it("starts afresh when the stored text is not its own", () => {
    const storage = browser();
    storage.setItem("adminRequestIds", "not json");
    expect(keptRequestIds("bulk", { storage }).idFor("top-up:10000:a,b")).toMatch(/^[0-9a-f-]{36}$/);
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
