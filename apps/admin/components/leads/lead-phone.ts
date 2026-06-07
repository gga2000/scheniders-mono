import type { Lead } from "@/types/leads";

// Iraqi phone normalizer — handles Arabic-Indic numerals, +964 / 00964 / leading-0.
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeIraqiPhone(input: string): string {
  if (!input) return "";
  let d = input
    .replace(/[٠-٩]/g, (x) => String(AR_DIGITS.indexOf(x)))
    .replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.startsWith("7")) d = "0" + d;
  return d;
}

export const isValidIraqiPhone = (v: string) => /^07\d{8,9}$/.test(normalizeIraqiPhone(v));

/** First usable phone for a lead (page phone, else first additional number). */
export function leadPhone(lead: Lead): string | null {
  return (
    lead.page_phone?.trim() ||
    lead.phone_numbers?.find((p) => p.number?.trim())?.number?.trim() ||
    null
  );
}

/** Convert an Iraqi number to international digits (9647XXXXXXXX) for wa.me. */
export function toIntlIraqi(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("964")) return d;
  const n = d.replace(/^0+/, "");
  return n.startsWith("7") ? `964${n}` : null;
}
