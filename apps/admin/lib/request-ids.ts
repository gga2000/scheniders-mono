import { z } from "zod";

/**
 * One id per distinct money or free-time request (a top-up, free days, lock
 * orders, a free unlock), made in the browser and sent with it. Asking for the
 * same thing again (a double click, a retry after an error or a lost
 * response) reuses the id, so the server makes the change once. A different
 * ask gets its own id; the same ask after `done()` gets a new one.
 *
 * Every ask keeps its id until a success, not only the last one: after a lost
 * answer for 50,000, a try at 10,000 and then 50,000 again sends the first
 * 50,000's id, so that money comes once (round 20).
 *
 * Key it by what moves: the shop, the amount, the days. Not by the reason's
 * words: a form opened again starts empty, and a reason typed anew in other
 * words must not turn a retry into a second top-up (round 20).
 */
export interface RequestIds {
  idFor(key: RequestKey): string;
  /** The ask last handed an id went through: its next press is a new ask. */
  done(): void;
}

declare const shopKeyBrand: unique symbol;
/** A shop's id, checked to be one. */
export type ShopKey = string & { readonly [shopKeyBrand]: true };

declare const requestKeyBrand: unique symbol;
/** What an ask's id is keyed by. Only requestKey makes one. */
export type RequestKey = string & { readonly [requestKeyBrand]: true };

/** The fixed words that name a step inside a key. */
export type RequestStep =
  | "trial"
  | "month"
  | "orders"
  | "unlock"
  | "extend"
  | "top-up"
  | "allow_trial"
  | "end_trial"
  | "checked";

/** What may key an id: shops, numbers (an amount, days) and a step's fixed word. */
export type RequestKeyPart = ShopKey | RequestStep | number;

const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkedShop(id: string): string {
  if (!SHOP_ID.test(id)) throw new Error("This is not a shop's id.");
  return id;
}

/** One shop as a key part. Any other text, a reason or a note, is refused. */
export function shopKey(id: string): ShopKey {
  return checkedShop(id) as ShopKey;
}

/** Many shops as one key part, in one order: the same pick in another order is the same ask. */
export function shopsKey(ids: readonly string[]): ShopKey {
  return ids.map(checkedShop).sort().join(",") as ShopKey;
}

/**
 * The key of one ask: what moves (the shops, the amount, the days) and the
 * step's fixed word. It cannot hold the words staff type: a form opened again
 * starts empty, and a reason typed anew must not turn a retry into a second
 * top-up (round 20). The types say so, where the guard test once read
 * variable names (round 21, structure new 7). The same parts make the same
 * text as the keys before them, so ids kept in a browser still match.
 */
export function requestKey(...parts: RequestKeyPart[]): RequestKey {
  return parts.join(":") as RequestKey;
}

/**
 * The kinds of ask whose ids outlive the page. Top-ups share one kind, so Quick
 * Top-Up on Billing and Add money on the shop page send one id for one shop and
 * amount: the server credits it once, whichever screen staff retry from.
 * Free trial days likewise: Extend on Trials and the shop page's free trial
 * days key the same ask the same way.
 */
export type RequestKind = "topup" | "free-days" | "convert" | "lock" | "bulk" | "trial-check";

/**
 * How long an ask with no success keeps its id. A retry after a lost answer
 * comes within minutes; a wanted second top-up of the same amount an hour
 * later is a new ask.
 */
export const KEPT_FOR_MS = 60 * 60 * 1000;

const STORE = "adminRequestIds";
const keptSchema = z.record(z.string(), z.object({ id: z.string(), at: z.number() }));
type Kept = z.infer<typeof keptSchema>;

/** Where the ids are kept: the browser's localStorage, so a reload and a second tab keep them. */
export type KeptStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeptStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Storage refused (blocked site data, some private windows): this tab keeps them.
    return null;
  }
}

/** This tab's own copy, used when the browser keeps nothing. */
let inTab: Kept = {};

/**
 * Storage that refused a write (full): it no longer holds the newest ids, so
 * this tab's own copy wins from then on. Read alone, it would hand every
 * press of the same ask a new id (round 22).
 */
const unwritable = new WeakSet<KeptStorage>();

function readKept(storage: KeptStorage | null, now: number): Kept {
  let kept = inTab;
  if (storage && !unwritable.has(storage)) {
    try {
      const parsed = keptSchema.safeParse(JSON.parse(storage.getItem(STORE) ?? "{}"));
      if (parsed.success) kept = parsed.data;
    } catch {
      // Storage refused, or held text that is not ours: this tab's own copy stands.
    }
  }
  return Object.fromEntries(Object.entries(kept).filter(([, ask]) => now - ask.at < KEPT_FOR_MS));
}

function writeKept(storage: KeptStorage | null, kept: Kept): void {
  inTab = kept;
  if (!storage) return;
  try {
    storage.setItem(STORE, JSON.stringify(kept));
  } catch {
    // Storage refused or full: the ids last for this tab, as before round 21.
    unwritable.add(storage);
  }
}

/**
 * Ids that outlive the page (round 21). They were held in one form's memory,
 * so a retry after leaving the page, a reload, a second tab, or the other
 * screen for the same shop sent a new id and could credit twice, while the
 * server's words promised "once at most". They are kept in this browser for
 * an hour, and a success ends only its own ask: after a lost 50,000 and a
 * done 10,000, 50,000 again still sends the first id. A repeat the server
 * answers as already done is a success too, so the press after it is new.
 */
export function keptRequestIds(
  kind: RequestKind,
  { storage = browserStorage(), now = Date.now }: { storage?: KeptStorage | null; now?: () => number } = {},
): RequestIds {
  let last: string | null = null;
  return {
    idFor(key: RequestKey): string {
      const name = `${kind}:${key}`;
      last = name;
      const kept = readKept(storage, now());
      const known = kept[name];
      if (known) return known.id;
      const id = crypto.randomUUID();
      writeKept(storage, { ...kept, [name]: { id, at: now() } });
      return id;
    },
    done(): void {
      if (last === null) return;
      const kept = readKept(storage, now()); // a fresh object: safe to change
      delete kept[last];
      writeKept(storage, kept);
      last = null;
    },
  };
}
