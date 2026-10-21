// =============================================
// PERSISTED ORDER BOOK (IndexedDB)
//
// The list cache (`orderKeys.lists()`) is kept on the device between visits,
// so opening /orders paints the window from disk and then asks the server only
// for what changed since (a delta from the saved sync watermark), instead of
// re-reading the whole window. A full read happens only when there is no
// usable copy: first visit on a device, another window, a copy older than
// BOOK_MAX_AGE_MS, or one written by a different list shape (BOOK_VERSION).
//
// The copy holds customer names, phones and addresses, so it is keyed to the
// signed-in user and tenant, expires after a day, and every copy is deleted on
// sign-out (`clearPersistedBooks`).
//
// Storage is behind `BookStorage` so the rules here are unit-tested without a
// browser; the default is an idb-keyval store of its own.
// =============================================

import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import type { Order } from "@/types/order";
import { LIST_COLUMNS } from "@/lib/repositories/order-columns";

/** A saved copy older than this is not used: the next visit re-reads the window. */
export const BOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Saved windows kept per user and tenant (the newest by save time); older ones are deleted on write. */
export const BOOK_MAX_WINDOWS = 3;
const KEY_PREFIX = "orders-book";

/**
 * Bumped by hand when what a cached row means changes; LIST_COLUMNS changes on
 * its own, because a copy read with other columns lacks fields the page reads.
 */
const BOOK_SCHEMA = 1;
export const BOOK_VERSION = `${BOOK_SCHEMA}:${hashString(LIST_COLUMNS.replace(/\s+/g, ""))}`;

export interface PersistedBook {
    version: string;
    userId: string;
    tenantId: string;
    windowKey: string;
    rows: Order[];
    /** Server `updated_at` the rows are complete up to (the coverage sync watermark when saved). */
    mark: string | null;
    savedAt: number;
}

/** The subset of idb-keyval the book uses. */
export interface BookStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    del(key: string): Promise<void>;
    keys(): Promise<IDBValidKey[]>;
}

/** No IndexedDB (server render, some private modes, jsdom): nothing is saved, every read misses. */
const NO_STORAGE: BookStorage = {
    get: async () => undefined,
    set: async () => undefined,
    del: async () => undefined,
    keys: async () => [],
};

let idbStore: UseStore | null = null;
function defaultStorage(): BookStorage {
    if (typeof indexedDB === "undefined") return NO_STORAGE;
    idbStore ??= createStore("scheniders-orders", "books");
    const store = idbStore;
    return {
        get: (key) => get(key, store),
        set: (key, value) => set(key, value, store),
        del: (key) => del(key, store),
        keys: () => keys(store),
    };
}

let storageOverride: BookStorage | null = null;
/** Tests: swap the backend. */
export function setBookStorageForTests(storage: BookStorage | null): void {
    storageOverride = storage;
}
function storage(): BookStorage {
    return storageOverride ?? defaultStorage();
}

export function bookKey(userId: string, tenantId: string, windowKey: string): string {
    return `${KEY_PREFIX}:${userId}:${tenantId}:${windowKey}`;
}

/** Why a saved copy was not used — reported by the caller so a miss is never silent. */
export type BookMiss = "none" | "version" | "expired" | "owner" | "window" | "empty" | "corrupt";

/**
 * The saved copy of `windowKey`, or why there is none to use. Never throws: an
 * unreadable store is a miss (`corrupt`) and the page reads the server.
 */
export async function readPersistedBook(
    userId: string,
    tenantId: string,
    windowKey: string,
    now: number = Date.now(),
): Promise<{ book: PersistedBook } | { miss: BookMiss; error?: unknown }> {
    const key = bookKey(userId, tenantId, windowKey);
    let raw: unknown;
    try {
        raw = await storage().get(key);
    } catch (error) {
        return { miss: "corrupt", error };
    }
    if (raw === undefined) return { miss: "none" };
    // Not deleted here: the next save of this window overwrites it.
    if (!isBook(raw)) return { miss: "corrupt" };
    if (raw.version !== BOOK_VERSION) return { miss: "version" };
    if (raw.userId !== userId || raw.tenantId !== tenantId) return { miss: "owner" };
    if (raw.windowKey !== windowKey) return { miss: "window" };
    if (now - raw.savedAt > BOOK_MAX_AGE_MS) return { miss: "expired" };
    // An empty copy says nothing a fetch would not: showing it would read as
    // "no orders" while the window may have some. See readSwrCache's history.
    if (raw.rows.length === 0) return { miss: "empty" };
    return { book: raw };
}

/**
 * Save the window's rows. Empty windows are not saved. Older windows of the
 * same user and tenant beyond BOOK_MAX_WINDOWS, and any expired copy, are
 * deleted. Rejects on a storage error so the caller can report it.
 */
export async function writePersistedBook(book: Omit<PersistedBook, "version">): Promise<void> {
    if (book.rows.length === 0) return;
    const s = storage();
    await s.set(bookKey(book.userId, book.tenantId, book.windowKey), { ...book, version: BOOK_VERSION } satisfies PersistedBook);
    await pruneBooks(book.userId, book.tenantId, book.savedAt);
}

async function pruneBooks(userId: string, tenantId: string, now: number): Promise<void> {
    const s = storage();
    const prefix = `${KEY_PREFIX}:${userId}:${tenantId}:`;
    const mine: Array<{ key: string; savedAt: number }> = [];
    for (const k of await s.keys()) {
        if (typeof k !== "string" || !k.startsWith(`${KEY_PREFIX}:`)) continue;
        const value = await s.get(k);
        const savedAt = isBook(value) ? value.savedAt : 0;
        if (now - savedAt > BOOK_MAX_AGE_MS) {
            await s.del(k);
            continue;
        }
        if (k.startsWith(prefix)) mine.push({ key: k, savedAt });
    }
    mine.sort((a, b) => b.savedAt - a.savedAt);
    for (const old of mine.slice(BOOK_MAX_WINDOWS)) await s.del(old.key);
}

/** Delete every saved order book on this device (sign-out). */
export async function clearPersistedBooks(): Promise<void> {
    const s = storage();
    for (const k of await s.keys()) {
        if (typeof k === "string" && k.startsWith(`${KEY_PREFIX}:`)) await s.del(k);
    }
}

function isBook(value: unknown): value is PersistedBook {
    if (typeof value !== "object" || value === null) return false;
    const b = value as Record<string, unknown>;
    return typeof b.version === "string" && typeof b.userId === "string" && typeof b.tenantId === "string"
        && typeof b.windowKey === "string" && Array.isArray(b.rows) && typeof b.savedAt === "number"
        && (b.mark === null || typeof b.mark === "string");
}

/** FNV-1a, enough to tell two column lists apart. */
function hashString(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
