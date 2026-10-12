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
 * A category with no stored preference falls back to audible, matching the
 * `DEFAULT_PREF` the settings hook resolves to — silence is something a person
 * chooses, never something they inherit from a missing row.
 */
export function shouldChime(input: ChimeInput): boolean {
    if (input.isOwnAction) return false;
    if (isWithinQuietHours(input.nowMinutes, input.quietHours)) return false;
    return input.prefs[input.category]?.sound ?? true;
}

/** Urgent gets its own, more insistent file; everything else shares one. */
export const chimeUrlFor = (priority: string): string =>
    priority === "urgent" ? "/sounds/urgent.mp3" : "/sounds/notification.mp3";
