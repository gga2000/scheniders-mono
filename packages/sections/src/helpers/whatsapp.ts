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

import { parseStoreContact } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export interface WhatsappProductInfo {
  name: string;
  /** EC26: the chosen variant (e.g. "Red / L") — appended to the product name. */
  variant?: string | null;
  price?: string | number | null;
  url?: string;
}

/** A line in a full-order WhatsApp message. */
export interface WhatsappOrderItem {
  name: string;
  variant?: string | null;
  quantity: number;
}

/** Optional delivery details to include in a full-order WhatsApp message. */
export interface WhatsappCustomerInfo {
  name?: string;
  phone?: string;
  governorate?: string;
  area?: string;
  address?: string;
}

const TEMPLATES: Record<"en" | "ar", string> = {
  en: "Hi! I want to order:\n{product_name}\n{product_url}\nPrice: {price}",
  ar: "مرحبًا! أريد طلب:\n{product_name}\n{product_url}\nالسعر: {price}",
};

function pickTemplate(locale: LocaleCode): string {
  if (locale !== "en") return TEMPLATES.ar;
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
 * The contact shape we read off the tenant. The storefront passes the full
 * tenant (which carries `store_config`), but sections are typed against
 * `BaseTenant` (no `store_config`), so we read defensively via `unknown`.
 */
/**
 * The V2 commerce number, or null when it is unset or blank. A blank string
 * means "not configured" (the health rule reads it the same way), so it must
 * fall through to the older sources instead of ending the `??` chain.
 */
function commerceWhatsapp(t: TenantContactShape): string | null {
  const n = t.store_config_v2?.commerce?.whatsapp_number;
  return n && n.trim().length > 0 ? n : null;
}

interface TenantContactShape {
  /** V2 config — the store builder's single source of truth (S3-01).
   *  `contact` is the structured "who contacts you" config (P4), validated
   *  by `parseStoreContact`; the raw jsonb is never trusted as-is. */
  store_config_v2?: {
    commerce?: {
      whatsapp_number?: string | null;
      contact?: unknown;
    } | null;
  } | null;
  store_config?: {
    contact?: {
      whatsapp_number?: string | null;
      phone_number?: string | null;
    } | null;
  } | null;
  contact_phone?: string | null;
}

/**
 * The single, canonical WhatsApp number for a storefront.
 *
 * Every WhatsApp CTA across the store resolves through this so a tenant sets
 * their number ONCE and it applies everywhere. The store builder's
 * `store_config_v2.commerce.whatsapp_number` (what the onboarding wizard and
 * the launch checklist write) wins; the V1 `store_config.contact` numbers and
 * then `contact_phone` are fallbacks for stores that predate it. Pass a
 * per-section `override` to point an individual button at a different number.
 * Returns `null` when nothing plausible is configured — the caller must then
 * not render the CTA (never deep-link to a dead number).
 */
export function resolveTenantWhatsapp(
  tenant: unknown,
  override?: string | null,
): string | null {
  if (override && isPlausiblePhone(override)) return override;
  const t = (tenant ?? {}) as TenantContactShape;
  const candidate =
    commerceWhatsapp(t) ??
    t.store_config?.contact?.whatsapp_number ??
    t.store_config?.contact?.phone_number ??
    t.contact_phone ??
    null;
  return isPlausiblePhone(candidate) ? candidate : null;
}

/**
 * The number that calls the buyer to confirm an order. The order tracker
 * writes it into `{contact}` and dials it, and the thank-you call card shows
 * it. It is the structured `commerce.contact.call_number` (the number the PDP
 * "who contacts you" line names) when that parses as an Iraqi mobile, else
 * the store's configured call number, else its WhatsApp number. The store
 * builder's "Order tracking messages" preview resolves through this too, so
 * the merchant sees exactly which lines survive on the storefront.
 */
export function resolveTrackerContact(tenant: unknown): string | null {
  const t = (tenant ?? {}) as TenantContactShape;
  const structured = parseStoreContact(t.store_config_v2?.commerce?.contact);
  if (structured) return structured.call_number;
  const phone = t.store_config?.contact?.phone_number;
  if (phone && isPlausiblePhone(phone)) return phone;
  return resolveTenantWhatsapp(tenant);
}

/**
 * Resolve a tenant's voice-call number. Prefers an explicit `contact_phone`,
 * then the configured WhatsApp number, then a per-section override. Same
 * plausibility guard as {@link resolveTenantWhatsapp}.
 */
export function resolveTenantPhone(
  tenant: unknown,
  override?: string | null,
): string | null {
  if (override && isPlausiblePhone(override)) return override;
  const t = (tenant ?? {}) as TenantContactShape;
  const candidate =
    t.contact_phone ??
    t.store_config?.contact?.phone_number ??
    t.store_config?.contact?.whatsapp_number ??
    commerceWhatsapp(t) ??
    null;
  return isPlausiblePhone(candidate) ? candidate : null;
}

/**
 * Normalise a phone number to the international digits `wa.me` expects.
 * The market is Iraq (country code 964), and merchants typically store local
 * numbers (leading 0, e.g. `0780 123 4567`). `wa.me` needs the international
 * form with no `+`/`0` (`9647801234567`), so:
 *   - `00964…`  → strip the `00` IDD prefix
 *   - `0XXXXXXXXXX` (local) → drop the leading 0, prepend `964`
 *   - already `964…` → unchanged
 *   - anything else → left as-is (assume already international)
 */
export function whatsappDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("964")) return digits;
  if (digits.startsWith("0")) return "964" + digits.slice(1);
  return digits;
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
  const digits = whatsappDigits(phone!);

  const template = pickTemplate(locale);
  // EC26: fold the chosen variant into the product name so the merchant sees
  // exactly which option was selected.
  const namePart = product.variant
    ? `${product.name} — ${product.variant}`
    : (product.name ?? "");
  const message = template
    .replace("{product_name}", namePart)
    .replace("{product_url}", product.url ?? "")
    .replace("{price}", formatPrice(product.price));

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * EC26: a `wa.me` link carrying the FULL order — every line (with variant +
 * quantity), an optional delivery block, and the total — so the merchant
 * receives the whole order instead of a bare "Hi" ping with zero context. Used
 * by the cart + checkout WhatsApp CTAs (one source of truth). Returns null when
 * no usable phone is configured.
 */
export function whatsappCartLink(
  phone: string | null | undefined,
  order: {
    items: WhatsappOrderItem[];
    customer?: WhatsappCustomerInfo;
    total?: string | null;
  },
  locale: LocaleCode,
): string | null {
  if (!isPlausiblePhone(phone)) return null;
  const ar = locale !== "en";
  const parts: string[] = [
    ar ? "هلا، أريد أكمل طلبي:" : "Hi! I'd like to complete my order:",
  ];
  for (const i of order.items) {
    const variant = i.variant ? ` — ${i.variant}` : "";
    parts.push(`• ${i.name}${variant} × ${i.quantity}`);
  }
  if (order.total) {
    parts.push(ar ? `المجموع: ${order.total}` : `Total: ${order.total}`);
  }
  const c = order.customer;
  if (c && (c.name || c.phone || c.governorate || c.area || c.address)) {
    parts.push(ar ? "— بيانات التوصيل —" : "— Delivery —");
    if (c.name) parts.push(ar ? `الاسم: ${c.name}` : `Name: ${c.name}`);
    if (c.phone) parts.push(ar ? `الهاتف: ${c.phone}` : `Phone: ${c.phone}`);
    if (c.governorate)
      parts.push(ar ? `المحافظة: ${c.governorate}` : `Governorate: ${c.governorate}`);
    if (c.area) parts.push(ar ? `المنطقة: ${c.area}` : `Area: ${c.area}`);
    if (c.address) parts.push(ar ? `العنوان: ${c.address}` : `Address: ${c.address}`);
  }
  return `https://wa.me/${whatsappDigits(phone!)}?text=${encodeURIComponent(parts.join("\n"))}`;
}
