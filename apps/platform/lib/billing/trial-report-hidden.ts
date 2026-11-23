import { baghdadDayKey } from "@/lib/order-window";

/*
 * The merchant can hide the trial report for the rest of the Baghdad day
 * (Fermi B12 item 2). Only this browser remembers it: it is a convenience,
 * and the card comes back the next day either way.
 */

const storageKey = (tenantId: string) => `trial-report-hidden:${tenantId}`;
const CHANGED = "trial-report-hidden";

/** The Baghdad day the report was hidden on in this browser, or null. */
export function readTrialReportHiddenDay(tenantId: string): string | null {
    try {
        return window.localStorage.getItem(storageKey(tenantId));
    } catch {
        // Storage is blocked (private window, site data off): nothing was remembered.
        return null;
    }
}

/** Whether the report is hidden today, by the day read from this browser. */
export function isTrialReportHiddenToday(hiddenDay: string | null, now: Date | number = Date.now()): boolean {
    return hiddenDay === baghdadDayKey(now);
}

/** Hide the report until the next Baghdad day. */
export function hideTrialReportToday(tenantId: string): void {
    try {
        window.localStorage.setItem(storageKey(tenantId), baghdadDayKey());
    } catch {
        // Not remembered when storage is blocked; the card the merchant closed stays closed until the page reloads.
    }
    window.dispatchEvent(new Event(CHANGED));
}

/** Calls back when the hidden day changes here or in another tab. */
export function subscribeTrialReportHidden(onChange: () => void): () => void {
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGED, onChange);
    return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(CHANGED, onChange);
    };
}
