// =====================================================================
// Article dates
// =====================================================================
// One formatter for the date on a guide, in the reader's language.
// =====================================================================

/** Bare calendar date, as a date input produces it. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const BAGHDAD = "Asia/Baghdad";

/**
 * Latin digits everywhere, on purpose.
 *
 * `Intl` renders Arabic with Arabic-Indic numerals by default, which would
 * put ٢٠٢٦ beside prices and order numbers that this app writes in Latin
 * digits. The `-u-nu-latn` extension keeps one numeral system across the
 * whole store.
 */
function localeTag(locale: string): string {
    if (locale.startsWith("ar")) return "ar-IQ-u-nu-latn";
    if (locale.startsWith("ku")) return "ckb-IQ-u-nu-latn";
    return "en-GB";
}

/**
 * Format an article's publish date for display, or `""` when there is none.
 *
 * A bare `YYYY-MM-DD` is formatted from its own parts with no time-zone
 * conversion at all. Reading it as an instant would put it at midnight UTC,
 * which is the previous evening in some zones and the next morning in others
 * — so the date a merchant typed could render as the day before it.
 */
export function formatArticleDate(
    value: string | undefined | null,
    locale: string,
): string {
    if (!value) return "";
    const tag = localeTag(locale);

    const bare = BARE_DATE.exec(value.trim());
    if (bare) {
        const [, y, m, d] = bare;
        return new Intl.DateTimeFormat(tag, {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
        }).format(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }

    const t = Date.parse(value);
    if (Number.isNaN(t)) return "";
    return new Intl.DateTimeFormat(tag, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: BAGHDAD,
    }).format(new Date(t));
}
