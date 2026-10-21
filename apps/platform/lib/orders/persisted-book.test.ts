import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    BOOK_MAX_AGE_MS,
    BOOK_MAX_WINDOWS,
    BOOK_VERSION,
    bookKey,
    clearPersistedBooks,
    readPersistedBook,
    setBookStorageForTests,
    writePersistedBook,
    type BookStorage,
} from "./persisted-book";
import type { Order } from "@/types/order";

class MemoryStorage implements BookStorage {
    map = new Map<string, unknown>();
    failGet: unknown = null;
    async get(key: string) {
        if (this.failGet) throw this.failGet;
        return structuredClone(this.map.get(key));
    }
    async set(key: string, value: unknown) { this.map.set(key, structuredClone(value)); }
    async del(key: string) { this.map.delete(key); }
    async keys() { return [...this.map.keys()]; }
}

const rows = [{ id: "o1", status: "new" }, { id: "o2", status: "confirmed" }] as unknown as Order[];
const NOW = Date.parse("2026-10-22T10:00:00.000Z");
let mem: MemoryStorage;

beforeEach(() => {
    mem = new MemoryStorage();
    setBookStorageForTests(mem);
});
afterEach(() => setBookStorageForTests(null));

const save = (over: Partial<Parameters<typeof writePersistedBook>[0]> = {}) =>
    writePersistedBook({ userId: "u1", tenantId: "t1", windowKey: "all", rows, mark: "2026-10-22T09:59:00.000Z", savedAt: NOW, ...over });

describe("persisted order book", () => {
    it("reads back what was saved, with its watermark", async () => {
        await save();
        const r = await readPersistedBook("u1", "t1", "all", NOW + 1000);
        expect(r).toEqual({ book: expect.objectContaining({ rows, mark: "2026-10-22T09:59:00.000Z", windowKey: "all", version: BOOK_VERSION }) });
    });

    it("is keyed to user, tenant and window: another one is a miss", async () => {
        await save();
        expect(await readPersistedBook("u2", "t1", "all", NOW)).toEqual({ miss: "none" });
        expect(await readPersistedBook("u1", "t2", "all", NOW)).toEqual({ miss: "none" });
        expect(await readPersistedBook("u1", "t1", "123-456", NOW)).toEqual({ miss: "none" });
    });

    it("refuses a copy saved under a key it does not belong to", async () => {
        // Defence in depth: the payload names its owner and window too.
        await save();
        mem.map.set(bookKey("u2", "t1", "all"), mem.map.get(bookKey("u1", "t1", "all")));
        expect(await readPersistedBook("u2", "t1", "all", NOW)).toEqual({ miss: "owner" });
        mem.map.set(bookKey("u1", "t1", "123-456"), mem.map.get(bookKey("u1", "t1", "all")));
        expect(await readPersistedBook("u1", "t1", "123-456", NOW)).toEqual({ miss: "window" });
    });

    it("expires after a day", async () => {
        await save();
        expect(await readPersistedBook("u1", "t1", "all", NOW + BOOK_MAX_AGE_MS + 1)).toEqual({ miss: "expired" });
    });

    it("refuses a copy written by another list shape", async () => {
        await save();
        const k = bookKey("u1", "t1", "all");
        mem.map.set(k, { ...(mem.map.get(k) as object), version: "0:old" });
        expect(await readPersistedBook("u1", "t1", "all", NOW)).toEqual({ miss: "version" });
    });

    it("never saves an empty window, and never serves an empty copy", async () => {
        await save({ rows: [] });
        expect(mem.map.size).toBe(0);
        mem.map.set(bookKey("u1", "t1", "all"), { version: BOOK_VERSION, userId: "u1", tenantId: "t1", windowKey: "all", rows: [], mark: null, savedAt: NOW });
        expect(await readPersistedBook("u1", "t1", "all", NOW)).toEqual({ miss: "empty" });
    });

    it("treats a malformed record or an unreadable store as a miss, with the error", async () => {
        mem.map.set(bookKey("u1", "t1", "all"), { rows: "nope" });
        expect(await readPersistedBook("u1", "t1", "all", NOW)).toEqual({ miss: "corrupt" });
        const boom = new Error("IDB blocked");
        mem.failGet = boom;
        expect(await readPersistedBook("u1", "t1", "all", NOW)).toEqual({ miss: "corrupt", error: boom });
    });

    it(`keeps the ${BOOK_MAX_WINDOWS} newest windows per user and tenant, and drops expired copies`, async () => {
        for (let i = 0; i < BOOK_MAX_WINDOWS + 2; i++) await save({ windowKey: `w${i}`, savedAt: NOW + i });
        await save({ userId: "u9", windowKey: "x", savedAt: NOW - BOOK_MAX_AGE_MS - 10 });
        await save({ windowKey: "latest", savedAt: NOW + 100 });
        const mine = [...mem.map.keys()].filter((k) => k.startsWith("orders-book:u1:t1:"));
        expect(mine).toHaveLength(BOOK_MAX_WINDOWS);
        expect(mine).toContain(bookKey("u1", "t1", "latest"));
        expect(mem.map.has(bookKey("u9", "t1", "x"))).toBe(false);
    });

    it("clearPersistedBooks deletes every book and nothing else", async () => {
        await save();
        await save({ userId: "u2", windowKey: "w" });
        mem.map.set("other-app-key", 1);
        await clearPersistedBooks();
        expect([...mem.map.keys()]).toEqual(["other-app-key"]);
    });
});
