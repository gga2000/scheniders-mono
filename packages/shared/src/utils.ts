import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format amount as Iraqi Dinar. Use 'ar-IQ' for Arabic output. */
export function formatIQD(
  amount: number,
  locale: "en-IQ" | "ar-IQ" = "en-IQ",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "IQD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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
