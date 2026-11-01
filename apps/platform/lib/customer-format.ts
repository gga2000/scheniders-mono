// Shared formatting helpers for the customers page (card, list, drawer).

/**
 * Iraqi phone for display: any input → "0780 123 4567" (LTR, Western digits).
 * A number that is not 10 national digits is shown as typed, not padded with
 * zeros into something that looks real.
 */
export function formatPhoneDisplay(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('964') && digits.length > 10) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length !== 10) return (raw || '').trim();
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Normalise any Iraqi phone to E.164 digits without "+": "07801234567" → "9647801234567". */
export function toIraqE164(raw: string): string {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('964')) d = d.slice(3);
    if (d.startsWith('0')) d = d.slice(1);
    return `964${d}`;
}

/** Up-to-two-letter monogram from a (possibly Arabic) name. */
export function monogram(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return '؟';
    return trimmed.slice(0, 2);
}

/** Safe whole-number percentage. */
export function pct(part: number, whole: number): number {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
}

/** A timestamp as its Baghdad calendar day, e.g. "Oct 31, 2026" / Arabic with Western digits. */
export function formatBaghdadDate(iso: string, language: string): string {
    return new Date(iso).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Baghdad",
    });
}

/** "Sep 2025" / "سبتمبر 2025" in Baghdad time: the "customer since" date on every customer surface. */
export function formatBaghdadMonthYear(iso: string, language: string): string {
    return new Date(iso).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
        month: "short",
        year: "numeric",
        timeZone: "Asia/Baghdad",
    });
}

/** A calendar month ("2026-06" or "2026-06-01") as its short name: "Jun" / "حزيران". */
export function formatMonthShort(month: string, language: string): string {
    return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
        month: "short",
        timeZone: "UTC",
    });
}

/** The Baghdad calendar month a moment falls in, as "YYYY-MM". */
export function baghdadMonthKey(at: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit" }).format(at);
}
