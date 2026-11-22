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
  idFor(key: string): string;
  /** The ask last handed an id went through: its next press is a new ask. */
  done(): void;
}

/**
 * Ids held by one form while it stays drawn: `const [requestIds] =
 * useState(createRequestIds)`. A success ends them all.
 */
export function createRequestIds(): RequestIds {
  const ids = new Map<string, string>();
  return {
    idFor(key: string): string {
      const known = ids.get(key);
      if (known) return known;
      const id = crypto.randomUUID();
      ids.set(key, id);
      return id;
    },
    done(): void {
      ids.clear();
    },
  };
}

/**
 * The kinds of ask whose ids outlive the page. Top-ups share one kind, so Quick
 * Top-Up on Billing and Add money on the shop page send one id for one shop and
 * amount: the server credits it once, whichever screen staff retry from.
 */
export type RequestKind = "topup" | "free-days" | "convert" | "lock" | "bulk";

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

function readKept(storage: KeptStorage | null, now: number): Kept {
  let kept = inTab;
  if (storage) {
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
  try {
    storage?.setItem(STORE, JSON.stringify(kept));
  } catch {
    // Storage refused or full: the ids last for this tab, as before round 21.
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
    idFor(key: string): string {
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
