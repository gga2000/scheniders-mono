// =============================================
// FOLLOW-UP SEND WINDOW
//
// Automatic reminders must not wake a customer at 4 a.m. A reminder is due
// REMINDER_DELAY_HOURS after the order; when that moment falls outside the
// store's daytime window it waits for the window to open. Iraq has no DST
// (UTC+3 all year), so the window is plain Asia/Baghdad wall-clock hours.
// Pure, no I/O.
// =============================================

import { z } from "zod";

const BAGHDAD_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const HOUR_MS = 3_600_000;
/** Orders pushed to the opening are spread over this long so they don't all go out in one burst. */
const OPENING_SPREAD_MS = 30 * 60_000;

export const followUpWindowSchema = z
    .object({
        /** Hour (0-23, Baghdad) the window opens. */
        start_hour: z.number().int().min(0).max(23),
        /** Hour (1-24, Baghdad) the window closes; a send is allowed before it. */
        end_hour: z.number().int().min(1).max(24),
    })
    .refine((w) => w.end_hour > w.start_hour, { message: "end_hour must be after start_hour" });

export type FollowUpWindow = z.infer<typeof followUpWindowSchema>;

export const DEFAULT_FOLLOW_UP_WINDOW: FollowUpWindow = { start_hour: 10, end_hour: 20 };

/** Read the window from a stored settings value; anything invalid falls back to the default. */
export function parseFollowUpWindow(raw: unknown): FollowUpWindow {
    const parsed = followUpWindowSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_FOLLOW_UP_WINDOW;
}

function hash(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h;
}

/**
 * The first moment at or after `earliest` that is inside the window. Inside the
 * window it is `earliest` itself; otherwise the next opening plus a small
 * per-order spread (`seed`, the order id) so the morning isn't one burst.
 */
export function nextSendTime(earliest: Date, window: FollowUpWindow, seed: string): Date {
    const local = earliest.getTime() + BAGHDAD_OFFSET_MS;
    const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
    const openToday = dayStart + window.start_hour * HOUR_MS;
    const closeToday = dayStart + window.end_hour * HOUR_MS;

    if (local >= openToday && local < closeToday) return earliest;

    const opening = local < openToday ? openToday : openToday + DAY_MS;
    const spread = hash(seed) % OPENING_SPREAD_MS;
    return new Date(opening + spread - BAGHDAD_OFFSET_MS);
}

/** True when `at` is inside the window. */
export function isInsideWindow(at: Date, window: FollowUpWindow): boolean {
    return nextSendTime(at, window, "") === at;
}
