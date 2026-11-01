/**
 * Day-first Latin-digit date in Baghdad time ("31/10/2026"), the same in every
 * language: Arabic locale patterns carry RTL marks that scramble inside the
 * app's LTR layout, and the rest of the app (IQD amounts, phones) is Latin.
 */
const BAGHDAD_DATE = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

export function formatBaghdadDate(value: string | number | Date): string {
    return BAGHDAD_DATE.format(new Date(value));
}
