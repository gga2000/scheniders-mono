/** This device's till settings: text size and sound. Kept in the browser, per device. */

export type TextSize = "normal" | "large" | "xl";
export interface TillPrefs {
    textSize: TextSize;
    sound: boolean;
}

export const DEFAULT_PREFS: TillPrefs = { textSize: "normal", sound: true };

/** How much the whole till grows for each text size. */
export const TEXT_ZOOM: Record<TextSize, number> = { normal: 1, large: 1.12, xl: 1.25 };

const KEY = "till.prefs";

export function readPrefs(): TillPrefs {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT_PREFS;
        const v: unknown = JSON.parse(raw);
        if (typeof v !== "object" || v === null) return DEFAULT_PREFS;
        const o = v as Record<string, unknown>;
        return {
            textSize: o.textSize === "large" || o.textSize === "xl" ? o.textSize : "normal",
            sound: o.sound !== false,
        };
    } catch {
        return DEFAULT_PREFS;
    }
}

export function writePrefs(p: TillPrefs): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        // A private window can refuse storage; the setting then lasts until the page closes.
    }
}
