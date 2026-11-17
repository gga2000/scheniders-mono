import { describe, expect, it } from "vitest";
import { isNewStep, readMark, writeMark } from "./use-bell-read-mark";

/*
 * The bell's "Mark all read" lived in component state: every page load
 * counted the 20 newest steps as new again, so the badge said "9+" forever.
 * It is now one time per staff member, kept in the browser.
 */

function memoryStorage(): Storage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (n) => [...items.keys()][n] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const NOOR = "user-noor";
const KARRAR = "user-karrar";

describe("the bell's read mark", () => {
  it("counts every step as new before the person marks any", () => {
    expect(readMark(memoryStorage(), NOOR)).toBeNull();
    expect(isNewStep("2026-11-17T03:00:00Z", null)).toBe(true);
  });

  it("keeps the mark across page loads, so marked steps stay read", () => {
    const storage = memoryStorage();
    writeMark(storage, NOOR, "2026-11-17T03:00:00Z");
    const readUpTo = readMark(storage, NOOR);
    expect(isNewStep("2026-11-17T03:00:00Z", readUpTo)).toBe(false);
    expect(isNewStep("2026-11-17T02:59:00Z", readUpTo)).toBe(false);
    expect(isNewStep("2026-11-17T03:00:01Z", readUpTo)).toBe(true);
  });

  it("keeps one mark per staff member sharing a browser", () => {
    const storage = memoryStorage();
    writeMark(storage, NOOR, "2026-11-17T03:00:00Z");
    expect(readMark(storage, KARRAR)).toBeNull();
  });

  it("never moves back, so a tab with an older list cannot undo a newer mark", () => {
    const storage = memoryStorage();
    writeMark(storage, NOOR, "2026-11-17T03:00:00Z");
    writeMark(storage, NOOR, "2026-11-16T20:00:00Z");
    expect(readMark(storage, NOOR)).toBe("2026-11-17T03:00:00Z");
  });

  it("reads a broken or refused storage as no mark", () => {
    const storage = memoryStorage();
    storage.items.set(`adminBellReadUpTo:${NOOR}`, "not a time");
    expect(readMark(storage, NOOR)).toBeNull();
    const refusing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
    expect(readMark(refusing, NOOR)).toBeNull();
    expect(() => writeMark(refusing, NOOR, "2026-11-17T03:00:00Z")).not.toThrow();
  });
});
