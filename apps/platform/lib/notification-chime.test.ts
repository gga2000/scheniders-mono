import { describe, expect, it } from "vitest";
import {
    chimeUrlFor,
    isWithinQuietHours,
    minutesOfDay,
    shouldChime,
} from "@/lib/notification-chime";
import type { CategoryPref, QuietHours } from "@/hooks/use-notification-settings";

const audible: CategoryPref = { in_app: true, push: true, sound: true };
const muted: CategoryPref = { in_app: true, push: true, sound: false };
const noQuiet: QuietHours = { enabled: false, start: 1320, end: 420 };

const input = (over: Partial<Parameters<typeof shouldChime>[0]> = {}) =>
    shouldChime({
        category: "orders",
        priority: "normal",
        isOwnAction: false,
        prefs: { orders: audible },
        quietHours: noQuiet,
        nowMinutes: 12 * 60,
        ...over,
    });

describe("minutesOfDay", () => {
    it("counts from local midnight", () => {
        expect(minutesOfDay(new Date(2026, 9, 4, 0, 0))).toBe(0);
        expect(minutesOfDay(new Date(2026, 9, 4, 22, 30))).toBe(1350);
    });
});

describe("isWithinQuietHours", () => {
    const wrapping: QuietHours = { enabled: true, start: 1320, end: 420 }; // 22:00 → 07:00

    it("is never inside the window when quiet hours are off", () => {
        expect(isWithinQuietHours(0, { ...wrapping, enabled: false })).toBe(false);
    });

    it("covers both sides of midnight for a wrapping window", () => {
        expect(isWithinQuietHours(1380, wrapping)).toBe(true); // 23:00
        expect(isWithinQuietHours(60, wrapping)).toBe(true); //  01:00
        expect(isWithinQuietHours(720, wrapping)).toBe(false); // 12:00
    });

    it("includes the start minute and excludes the end minute", () => {
        expect(isWithinQuietHours(1320, wrapping)).toBe(true);
        expect(isWithinQuietHours(420, wrapping)).toBe(false);
    });

    it("handles a same-day window", () => {
        const daytime: QuietHours = { enabled: true, start: 540, end: 1020 }; // 09:00 → 17:00
        expect(isWithinQuietHours(600, daytime)).toBe(true);
        expect(isWithinQuietHours(1100, daytime)).toBe(false);
        expect(isWithinQuietHours(300, daytime)).toBe(false);
    });

    it("treats a zero-length window as no window, not as silence forever", () => {
        expect(isWithinQuietHours(600, { enabled: true, start: 600, end: 600 })).toBe(false);
    });
});

describe("shouldChime", () => {
    it("sounds for someone else's action on an audible category", () => {
        expect(input()).toBe(true);
    });

    it("stays silent when the category's sound switch is off", () => {
        expect(input({ prefs: { orders: muted } })).toBe(false);
    });

    it("stays silent for the reader's own action", () => {
        expect(input({ isOwnAction: true })).toBe(false);
    });

    it("stays silent inside quiet hours even for an urgent notification", () => {
        expect(input({
            priority: "urgent",
            quietHours: { enabled: true, start: 1320, end: 420 },
            nowMinutes: 1380,
        })).toBe(false);
    });

    it("falls back to audible for a category with no stored preference", () => {
        expect(input({ category: "system", prefs: {} })).toBe(true);
    });

    it("respects a stored preference for a category the dialog does not list", () => {
        expect(input({ category: "system", prefs: { system: muted } })).toBe(false);
    });
});

describe("chimeUrlFor", () => {
    it("gives urgent its own file", () => {
        expect(chimeUrlFor("urgent")).toBe("/sounds/urgent.mp3");
        expect(chimeUrlFor("normal")).toBe("/sounds/notification.mp3");
    });
});
