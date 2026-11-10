import { formatIQD as formatIQDLocale } from "@scheniders/shared";

/** IQD in whole numbers with Latin digits, as on every other money screen. */
export function formatIQD(amount: number): string {
    return formatIQDLocale(Math.round(amount));
}

/** A day like "10 Nov 2026", in the app's language with Latin digits. */
export function formatBillingDate(iso: string, language: string): string {
    return new Date(iso).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `iso`, never below 0. */
export function daysUntil(iso: string, now: number = Date.now()): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY_MS));
}
