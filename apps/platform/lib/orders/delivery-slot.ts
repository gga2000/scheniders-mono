import { z } from "zod";

/**
 * When the customer wants the parcel. Staff pick one of three default windows
 * or the customer's exact time (Ali, 2026-11-01). Stored in
 * `orders.delivery_slot` as the preset key or a 24h "HH:MM"; the database
 * CHECK `orders_delivery_slot_valid` enforces the same shape.
 */

export const DELIVERY_SLOT_PRESETS = ["morning", "afternoon", "evening"] as const;
export type DeliverySlotPreset = (typeof DELIVERY_SLOT_PRESETS)[number];

/** A 24h clock time, "00:00" to "23:59". */
export type DeliveryExactTime = `${string}:${string}`;
export type DeliverySlot = DeliverySlotPreset | DeliveryExactTime;

const EXACT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DeliverySlotSchema = z.union([
    z.enum(DELIVERY_SLOT_PRESETS),
    z.string().regex(EXACT_TIME).transform((v) => v as DeliveryExactTime),
]);

/** Hours of each default window, 24h. */
export const PRESET_HOURS: Record<DeliverySlotPreset, { from: number; to: number }> = {
    morning: { from: 9, to: 12 },
    afternoon: { from: 12, to: 16 },
    evening: { from: 16, to: 20 },
};

export function isPresetSlot(slot: string | null | undefined): slot is DeliverySlotPreset {
    return slot === "morning" || slot === "afternoon" || slot === "evening";
}

export function isExactTime(slot: string | null | undefined): slot is DeliveryExactTime {
    return !!slot && EXACT_TIME.test(slot);
}

/** A stored value read back, or undefined when it is not a valid slot. */
export function parseDeliverySlot(raw: string | null | undefined): DeliverySlot | undefined {
    if (isPresetSlot(raw) || isExactTime(raw)) return raw;
    return undefined;
}

type Lang = "ar" | "en";

/** 13 -> "1", 0 -> "12": hour on a 12h clock. */
const hour12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** "16:30" -> "4:30 م" / "4:30 PM". */
export function formatExactTime(time: DeliveryExactTime, lang: Lang): string {
    const [h, m] = time.split(":").map(Number);
    const clock = `${hour12(h)}:${String(m).padStart(2, "0")}`;
    const pm = h >= 12;
    return lang === "ar" ? `${clock} ${pm ? "م" : "ص"}` : `${clock} ${pm ? "PM" : "AM"}`;
}

const PRESET_NAME: Record<Lang, Record<DeliverySlotPreset, string>> = {
    ar: { morning: "صباحاً", afternoon: "ظهراً", evening: "مساءً" },
    en: { morning: "Morning", afternoon: "Noon", evening: "Evening" },
};

/** "9–12" on a 12h clock, the way the slot is said aloud. */
function presetRange(slot: DeliverySlotPreset): string {
    const { from, to } = PRESET_HOURS[slot];
    return `${hour12(from)}–${hour12(to)}`;
}

/**
 * Short text for chips and the shipping label: "مساءً 4–8" or "4:30 م"
 * ("Evening 4–8" / "4:30 PM").
 */
export function formatDeliverySlot(slot: DeliverySlot, lang: Lang): string {
    if (isPresetSlot(slot)) return `${PRESET_NAME[lang][slot]} ${presetRange(slot)}`;
    return formatExactTime(slot, lang);
}
