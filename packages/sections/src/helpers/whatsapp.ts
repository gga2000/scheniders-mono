// =====================================================================
// WhatsApp deep-link helper
// =====================================================================
// Builds `https://wa.me/<phone>?text=<encoded message>` links so product
// cards + PDP buy boxes can offer a one-tap "Order via WhatsApp" CTA.
//
// Phone is normalised to digits-only (the wa.me redirect ignores
// punctuation but mobile WhatsApp clients are pickier).
//
// Templates are locale-aware: Arabic locale gets the Arabic copy, every
// other locale falls back to English.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";

export interface WhatsappProductInfo {
  name: string;
  price?: string | number | null;
  url?: string;
}

const TEMPLATES: Record<"en" | "ar", string> = {
  en: "Hi! I want to order:\n{product_name}\n{product_url}\nPrice: {price}",
  ar: "مرحبًا! أريد طلب:\n{product_name}\n{product_url}\nالسعر: {price}",
};

function pickTemplate(locale: LocaleCode): string {
  if (locale === "ar") return TEMPLATES.ar;
  return TEMPLATES.en;
}

function formatPrice(price: WhatsappProductInfo["price"]): string {
  if (price === null || price === undefined || price === "") return "";
  if (typeof price === "number") {
    // No currency code — the caller is expected to pass a formatted
    // string when they want a currency. Sections that already produce
    // "12,000 IQD" pass the formatted string directly.
    return String(price);
  }
  return price;
}

/**
 * True when `phone` is a usable number. Rejects empty, too-short, and
 * obviously-placeholder values — e.g. a seed like `9647700000000` whose
 * long run of zeros marks it as fake. Conservative: only < 8 digits or a
 * run of 6+ identical digits is treated as a placeholder, so real numbers
 * are never dropped. Use this before rendering any WhatsApp/call CTA so it
 * never deep-links to a dead number.
 */
export function isPlausiblePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return false;
  if (/(\d)\1{5,}/.test(digits)) return false;
  return true;
}

/**
 * Returns a `https://wa.me/...` URL with a pre-filled order message.
 * Returns `null` when no usable phone number is provided (caller should
 * not render the button in that case).
 */
export function whatsappOrderLink(
  phone: string | null | undefined,
  product: WhatsappProductInfo,
  locale: LocaleCode,
): string | null {
  if (!isPlausiblePhone(phone)) return null;
  const digits = phone!.replace(/\D/g, "");

  const template = pickTemplate(locale);
  const message = template
    .replace("{product_name}", product.name ?? "")
    .replace("{product_url}", product.url ?? "")
    .replace("{price}", formatPrice(product.price));

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
