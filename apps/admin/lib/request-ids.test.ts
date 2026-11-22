import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, expectTypeOf } from "vitest";
import {
  KEPT_FOR_MS,
  keptRequestIds,
  requestKey,
  shopKey,
  shopsKey,
  type KeptStorage,
  type RequestKeyPart,
} from "./request-ids";

const SHOP_A = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const SHOP_B = "0b9f1c2e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const A = shopKey(SHOP_A);
const B = shopKey(SHOP_B);

/** A browser's localStorage, shared by every page and tab that reads it. */
function browser(): KeptStorage {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

/*
 * A staff top-up carries an id the server uses to drop a repeat. The id must
 * stay the same for a retry of the same request and change for a new one, or
 * a retry credits twice / a wanted second top-up is dropped.
 */
describe("an ask's id", () => {
  it("is the same for a retry of the same ask", () => {
    const ids = keptRequestIds("topup", { storage: browser() });
    const first = ids.idFor(requestKey(A, 5000));
    expect(ids.idFor(requestKey(A, 5000))).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is new for another amount or another shop", () => {
    const ids = keptRequestIds("topup", { storage: browser() });
    const first = ids.idFor(requestKey(A, 5000));
    expect(ids.idFor(requestKey(A, 6000))).not.toBe(first);
    expect(ids.idFor(requestKey(B, 5000))).not.toBe(first);
  });
});

/*
 * Round 21 (structure new 7): the guard test read variable names in the key
 * text and missed a key built from a name it did not list. The key's parts are
 * now typed: a shop's checked id, a number, or a step's fixed word. Words
 * staff type cannot be one.
 */
describe("requestKey", () => {
  it("takes no free text: a string is not a key part", () => {
    expectTypeOf<string>().not.toMatchTypeOf<RequestKeyPart>();
    expectTypeOf<number>().toMatchTypeOf<RequestKeyPart>();
  });

  it("refuses a reason passed off as a shop", () => {
    expect(() => shopKey("Qi transfer, receipt 12")).toThrow("This is not a shop's id.");
    expect(() => shopsKey([SHOP_A, "refund for order 9"])).toThrow("This is not a shop's id.");
  });

  it("makes the same text as the keys before it, so ids kept in a browser still match", () => {
    expect(requestKey(A, 50000)).toBe(`${SHOP_A}:50000`);
    expect(requestKey(A, "orders", 50)).toBe(`${SHOP_A}:orders:50`);
    expect(requestKey("top-up", 10000, shopsKey([SHOP_A, SHOP_B]))).toBe(
      `top-up:10000:${[SHOP_A, SHOP_B].sort().join(",")}`,
    );
  });

  it("reads a pick of shops in one order", () => {
    expect(shopsKey([SHOP_B, SHOP_A])).toBe(shopsKey([SHOP_A, SHOP_B]));
  });
});

/*
 * Round 21 (structure new 3): ids lived in one form's memory. A retry after
 * leaving the page, a reload, a second tab, or Quick Top-Up after Add money
 * for the same shop and amount sent a new id and could credit twice, while
 * the server's words promised "once at most".
 */
describe("keptRequestIds", () => {
  it("keeps an id across pages, reloads and tabs of one browser", () => {
    const storage = browser();
    const billing = keptRequestIds("topup", { storage });
    const id = billing.idFor(requestKey(A, 50000));
    // The shop page's Add money, or Billing after a reload: a new handle, the same browser.
    expect(keptRequestIds("topup", { storage }).idFor(requestKey(A, 50000))).toBe(id);
  });

  it("keeps kinds apart", () => {
    const storage = browser();
    const topUp = keptRequestIds("topup", { storage }).idFor(requestKey(A, 7));
    expect(keptRequestIds("free-days", { storage }).idFor(requestKey(A, 7))).not.toBe(topUp);
  });

  it("ends only the ask that went through", () => {
    const storage = browser();
    const ids = keptRequestIds("topup", { storage });
    const fifty = ids.idFor(requestKey(A, 50000)); // its answer was lost
    const ten = ids.idFor(requestKey(A, 10000));
    ids.done(); // 10,000 went through
    expect(ids.idFor(requestKey(A, 50000))).toBe(fifty);
    expect(ids.idFor(requestKey(A, 10000))).not.toBe(ten);
  });

  it("ends an ask from another handle once it goes through there", () => {
    const storage = browser();
    const id = keptRequestIds("topup", { storage }).idFor(requestKey(A, 50000));
    const shopPage = keptRequestIds("topup", { storage });
    expect(shopPage.idFor(requestKey(A, 50000))).toBe(id);
    shopPage.done();
    expect(keptRequestIds("topup", { storage }).idFor(requestKey(A, 50000))).not.toBe(id);
  });

  it("forgets an ask after an hour, so a wanted top-up later is a new one", () => {
    const storage = browser();
    let at = 1_000_000;
    const now = () => at;
    const id = keptRequestIds("topup", { storage, now }).idFor(requestKey(A, 50000));
    at += KEPT_FOR_MS - 1;
    expect(keptRequestIds("topup", { storage, now }).idFor(requestKey(A, 50000))).toBe(id);
    at += KEPT_FOR_MS;
    expect(keptRequestIds("topup", { storage, now }).idFor(requestKey(A, 50000))).not.toBe(id);
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
    const first = keptRequestIds("lock", { storage: refusing }).idFor(requestKey(B, "orders", 50));
    expect(keptRequestIds("lock", { storage: refusing }).idFor(requestKey(B, "orders", 50))).toBe(first);
  });

  it("starts afresh when the stored text is not its own", () => {
    const storage = browser();
    storage.setItem("adminRequestIds", "not json");
    expect(keptRequestIds("bulk", { storage }).idFor(requestKey("top-up", 10000, shopsKey([SHOP_A, SHOP_B])))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/*
 * Round 20: the ids were keyed by the reason's words. A form opened again
 * starts empty, so a retry typed in other words got a new id and a wallet
 * could be credited twice. Every key is built by requestKey, whose parts the
 * types hold to what moves (round 21, structure new 7). A cast to a key type
 * would step around them, so none is allowed outside the module.
 */
const ADMIN_DIR = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("every request id key", () => {
  it("is built by requestKey, and nothing casts its way around it", () => {
    let calls = 0;
    const loose: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const name = path.relative(ADMIN_DIR, file).split(path.sep).join("/");
        const text = readFileSync(file, "utf8");
        for (const call of text.matchAll(/\.idFor\(\s*([^)\s]*)/g)) {
          if (name === "lib/request-ids.ts") continue;
          calls += 1;
          if (!call[1].startsWith("requestKey(")) loose.push(`${name}: .idFor(${call[1]}`);
        }
        if (name !== "lib/request-ids.ts" && /as\s+(RequestKey|ShopKey)\b/.test(text)) loose.push(`${name}: casts to a key type`);
      }
    }
    expect(calls).toBeGreaterThanOrEqual(9);
    expect(loose).toEqual([]);
  });
});
