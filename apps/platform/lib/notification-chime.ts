// apps/platform/lib/notification-chime.ts
//
// Whether an arriving notification should make a sound.
//
// The settings dialog has offered a per-category "Sound" switch since the
// notification overhaul, but nothing on the feed side ever read it: the only
// code that played audio was the old order-realtime path, which fires on new
// orders alone. Every other notification — a status change, a mention, a
// low-stock warning — arrived silently however the switch was set.
//
// The decision is kept here, away from the audio element, so it can be tested
// without a browser.

import type { CategoryPref, QuietHours } from "@/hooks/use-notification-settings";

/** Minutes elapsed since local midnight — the unit quiet hours are stored in. */
export const minutesOfDay = (date: Date): number =>
    date.getHours() * 60 + date.getMinutes();

/**
 * Quiet hours are two minute-of-day marks, and the window may wrap midnight
 * (the default, 22:00 → 07:00, does). `start === end` is treated as no window
 * rather than as a silent 24 hours: someone who drags both handles together has
 * not asked to be deafened forever.
 */
export function isWithinQuietHours(nowMinutes: number, quiet: QuietHours): boolean {
    if (!quiet.enabled) return false;
    const { start, end } = quiet;
    if (start === end) return false;
    return start < end
        ? nowMinutes >= start && nowMinutes < end
        : nowMinutes >= start || nowMinutes < end;
}

/**
 * Only these groups are audible until someone turns another one on: new
 * orders and order changes ("orders") and customer messages ("chat"). Stock,
 * delivery, finance, customer and team events stay silent by default.
 */
const AUDIBLE_BY_DEFAULT: ReadonlySet<string> = new Set(["orders", "chat"]);

export const soundOnByDefault = (category: string): boolean =>
    AUDIBLE_BY_DEFAULT.has(category);

export interface ChimeInput {
    category: string;
    priority: string;
    /** The reader did this themselves — their own click shouldn't ping back. */
    isOwnAction: boolean;
    prefs: Partial<Record<string, CategoryPref>>;
    quietHours: QuietHours;
    nowMinutes: number;
}

/**
 * A category with no stored preference follows `soundOnByDefault`, matching
 * what the settings hook resolves to, so the dialog and the feed never
 * disagree about a missing row.
 */
export function shouldChime(input: ChimeInput): boolean {
    if (input.isOwnAction) return false;
    if (isWithinQuietHours(input.nowMinutes, input.quietHours)) return false;
    return input.prefs[input.category]?.sound ?? soundOnByDefault(input.category);
}

export const SOUND_URLS = {
    newOrder: "/sounds/order.mp3",
    orderChange: "/sounds/change.mp3",
    orderCancelled: "/sounds/order-cancelled.mp3",
    orderConfirmed: "/sounds/order-confirm.mp3",
    message: "/sounds/message.mp3",
    other: "/sounds/others.mp3",
} as const;

export interface SoundSubject {
    /** Dotted event name, e.g. "order.created". */
    type: string;
    payload: Record<string, unknown>;
}

/**
 * Which file a notification plays. Moving an order to confirmed sounds the same
 * whether the customer answered on WhatsApp or a teammate did it by hand.
 */
export function soundUrlFor(subject: SoundSubject): string {
    const { type, payload } = subject;
    if (type === "order.created") return SOUND_URLS.newOrder;
    if (type === "order.status_changed" || type === "order.bulk_status_changed") {
        const next = payload.new_status;
        if (next === "cancelled") return SOUND_URLS.orderCancelled;
        if (next === "confirmed") return SOUND_URLS.orderConfirmed;
        return SOUND_URLS.orderChange;
    }
    if (type === "order.updated") return SOUND_URLS.orderChange;
    if (type.startsWith("chat.")) return SOUND_URLS.message;
    return SOUND_URLS.other;
}
