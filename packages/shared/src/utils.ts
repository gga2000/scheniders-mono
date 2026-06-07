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
