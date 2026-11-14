import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge, taught the storefront theme's custom border widths
 *  (`borderWidth: { bk, "bk-bold" }`). Stock tailwind-merge files any
 *  `border-<word>` under border COLOUR, so `border-bk border-bk-divider`
 *  lost its width and the hairline silently disappeared. Extending the
 *  `borderWidth` theme scale covers every group that reads it
 *  (`border-*`, `border-t-*`, `divide-x-*` …). */
const twMerge = extendTailwindMerge({
  extend: { theme: { borderWidth: ["bk", "bk-bold"] } },
});

/** Merge Tailwind CSS classes (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFormats = new Map<string, Intl.NumberFormat>();

/** Format amount as Iraqi Dinar. Use 'ar-IQ' for Arabic output. */
export function formatIQD(
  amount: number,
  locale: "en-IQ" | "ar-IQ" = "en-IQ",
): string {
  let format = currencyFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "IQD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    currencyFormats.set(locale, format);
  }
  return format.format(amount);
}

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "negative" });

/** A whole IQD amount with Latin digits and no unit: 12500.4 -> "12,500". */
export function formatIqdNumber(amount: number): string {
  return wholeNumber.format(amount);
}

/** The short words after a compact amount, in the reader's language. */
export interface CompactUnits {
  thousand: string;
  million: string;
}

const LATIN_COMPACT: CompactUnits = { thousand: "K", million: "M" };

function oneDecimal(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/**
 * A short IQD amount for tight spaces (chart ticks, banners): 950 -> "950",
 * 1,500 -> "1.5K", 125,000 -> "125K", 999,600 -> "1M", 2,450,000 -> "2.5M".
 * One decimal under 100K, whole thousands above; an amount that would round
 * up to 1000K is written in millions.
 */
export function formatIqdCompact(amount: number, units: CompactUnits = LATIN_COMPACT): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 && Math.round(abs) > 0 ? "-" : "";
  if (Math.round(abs) < 1000) return `${sign}${Math.round(abs)}`;
  const k = abs / 1000;
  const kText = k < 100 ? oneDecimal(k) : String(Math.round(k));
  if (Number(kText) < 1000) return `${sign}${kText}${units.thousand}`;
  return `${sign}${oneDecimal(abs / 1_000_000)}${units.million}`;
}

/** Format price with Arabic currency text (دينار عراقي). */
export function formatIQDArabic(amount: number): string {
  const formattedNumber = new Intl.NumberFormat("ar-IQ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formattedNumber} دينار عراقي`;
}

/** Convert text to a URL-safe slug. Unicode-aware: keeps letters and digits
 *  from ANY script (Arabic, Kurdish, …) so non-Latin names produce a
 *  meaningful slug instead of an empty string. Punctuation, symbols and emoji
 *  are dropped. Returns "" only when the input has no letters/digits at all —
 *  callers then fall back to the row id. */
export function slugify(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A slug is valid exactly when it is already canonical — when `slugify`
 *  would leave it untouched. Defining it against the generator rather than a
 *  hand-written pattern means validation can never reject a slug the system
 *  itself produced, which is how Arabic slugs (رفقات, ويفر) ended up saved in
 *  the database and then refused by the product editor on every subsequent
 *  save. Empty is never valid; callers fall back to the row id. */
export function isCanonicalSlug(slug: string): boolean {
  return slug.length > 0 && slugify(slug) === slug;
}
