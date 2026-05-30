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
 * Returns a `https://wa.me/...` URL with a pre-filled order message.
 * Returns `null` when no phone number is provided (caller should not
 * render the button in that case).
 */
export function whatsappOrderLink(
  phone: string | null | undefined,
  product: WhatsappProductInfo,
  locale: LocaleCode,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;

  const template = pickTemplate(locale);
  const message = template
    .replace("{product_name}", product.name ?? "")
    .replace("{product_url}", product.url ?? "")
    .replace("{price}", formatPrice(product.price));

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
