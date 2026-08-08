// Shared formatting helpers for the customers page (card, list, drawer).

/** Compact IQD amount: 2_400_000 → "2.4M", 340_000 → "340K", 950 → "950". */
export function formatCompactIQD(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return Math.round(value).toLocaleString('en-US');
}

/** Iraqi phone for display: any input → "0780 230 1677" (LTR, Western digits). */
export function formatPhoneDisplay(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('964') && digits.length > 10) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.padStart(10, '0');
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Normalise any Iraqi phone to E.164 digits without "+": "07802301677" → "9647802301677". */
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
