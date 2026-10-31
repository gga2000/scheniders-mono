/**
 * One date format for every vault surface: numeric day/month/year and a 24-hour
 * clock, Latin digits, no seconds. It reads the same in Arabic and English and,
 * having no am/pm or month words, cannot reorder inside right-to-left text.
 */
export function formatVaultDate(value: string | number | Date): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Baghdad",
    }).format(new Date(value));
}
