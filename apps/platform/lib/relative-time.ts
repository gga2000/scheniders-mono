import type { LocaleCode } from "@scheniders/shared";

/**
 * "3 days ago" / "in 2 hours" in the editor's language, via
 * Intl.RelativeTimeFormat so Arabic and Kurdish get correct plurals
 * ("قبل 5 أيام", not "قبل 5 يوم"). Latin digits to match the rest of the UI.
 */
export function formatRelativeTime(target: Date, now: Date, locale: LocaleCode): string {
    const fmt = new Intl.RelativeTimeFormat(
        `${locale === "ku" ? "ckb" : locale}-u-nu-latn`,
        { numeric: "auto" },
    );
    const sign = target.getTime() >= now.getTime() ? 1 : -1;
    const mins = Math.floor(Math.abs(target.getTime() - now.getTime()) / 60_000);
    if (mins < 60) return fmt.format(sign * mins, "minute");
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return fmt.format(sign * hrs, "hour");
    return fmt.format(sign * Math.floor(hrs / 24), "day");
}
