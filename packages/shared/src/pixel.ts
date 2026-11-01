// =====================================================================
// Marketing-pixel event payloads (Meta / TikTok standard events)
// =====================================================================
// Pure builders shared by the client tracker (fbq/ttq) and the server-side
// Conversions API sender, so a browser event and its server twin carry the
// IDENTICAL content/value — required for event deduplication via event_id.
// =====================================================================

import { normalizeIraqiMobile } from "./phone";

/**
 * The phone as the ad networks match it, before hashing: Iraqi mobile in
 * E.164 digits, «9647XXXXXXXXX». Meta hashes it without the plus; TikTok
 * with it («+9647…»). Null when the number is not a reachable Iraqi mobile,
 * so nothing unmatched is ever sent.
 */
export function pixelPhoneDigits(raw: string | null | undefined): string | null {
  const national = normalizeIraqiMobile(raw);
  return national ? `964${national.slice(1)}` : null;
}

/**
 * The plaintext behind the hashed `external_id` both the browser pixels and
 * the server events send, so Meta and TikTok join the two to one person.
 * Scoped to the store so one shopper is not one id across every tenant.
 */
export function pixelExternalIdSource(tenantId: string, phoneDigits: string): string {
  return `${tenantId}:${phoneDigits}`;
}

/** sessionStorage key: the Purchase the checkout hands to the next page. */
export const PENDING_PURCHASE_KEY = "schn:pending-purchase";

/**
 * A Purchase the order form could not safely fire itself: it navigates to
 * the thank-you page the moment the order is accepted, which can cancel a
 * pixel request still in flight. The form writes this; the pixel layer on
 * the next page fires it once, with the same event id the server sent.
 * Identifiers are already SHA-256 hashed — the raw phone is never stored.
 */
export interface PendingPurchase {
  event_id: string;
  data: PixelEventData;
  /** sha256(pixelPhoneDigits) — Meta `ph`. */
  ph: string | null;
  /** sha256("+" + pixelPhoneDigits) — TikTok `phone_number`. */
  ph_plus: string | null;
  /** sha256(pixelExternalIdSource). */
  external_id: string | null;
  /** ms epoch; a stale handoff (older than an hour) is dropped. */
  ts: number;
}

const PENDING_PURCHASE_TTL_MS = 60 * 60 * 1000;
const HEX64 = /^[a-f0-9]{64}$/;

function hashOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX64.test(v) ? v : null;
}

/** Parse a stored handoff defensively; null when malformed or stale. */
export function parsePendingPurchase(raw: string | null, now: number): PendingPurchase | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    // Browser-held text that is not JSON is simply not a handoff.
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const d = r.data as Record<string, unknown> | undefined;
  if (typeof r.event_id !== "string" || !r.event_id) return null;
  if (typeof r.ts !== "number" || now - r.ts > PENDING_PURCHASE_TTL_MS || r.ts > now + 60_000) return null;
  if (!d || !Array.isArray(d.contents) || typeof d.value !== "number") return null;
  const contents = d.contents.filter(
    (c): c is PixelContent =>
      !!c &&
      typeof c === "object" &&
      typeof (c as PixelContent).id === "string" &&
      typeof (c as PixelContent).quantity === "number" &&
      typeof (c as PixelContent).item_price === "number",
  );
  if (contents.length === 0) return null;
  return {
    event_id: r.event_id,
    data: {
      content_ids: contents.map((c) => c.id),
      contents,
      value: d.value,
      currency: "IQD",
      num_items: contents.reduce((s, c) => s + c.quantity, 0),
    },
    ph: hashOrNull(r.ph),
    ph_plus: hashOrNull(r.ph_plus),
    external_id: hashOrNull(r.external_id),
    ts: r.ts,
  };
}

export interface PixelContent {
  id: string;
  quantity: number;
  item_price: number;
}

export interface PixelEventData {
  content_ids: string[];
  contents: PixelContent[];
  value: number;
  /** Iraq market — always IQD. */
  currency: "IQD";
  num_items: number;
}

export function pixelContentsFromItems(
  items: ReadonlyArray<{ product_id: string; price: number; quantity: number }>,
): PixelEventData {
  const contents: PixelContent[] = items.map((i) => ({
    id: i.product_id,
    quantity: Math.max(0, Math.floor(i.quantity)),
    item_price: Math.max(0, i.price),
  }));
  return {
    content_ids: contents.map((c) => c.id),
    contents,
    value: contents.reduce((s, c) => s + c.item_price * c.quantity, 0),
    currency: "IQD",
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
  };
}

export function pixelContentFromProduct(p: {
  id: string;
  price: number;
}): PixelEventData {
  return pixelContentsFromItems([
    { product_id: p.id, price: p.price, quantity: 1 },
  ]);
}

/**
 * CAPI access tokens are stored in `globals.analytics_pixels.base` but are
 * SERVER-ONLY secrets. The full store config is serialized into the client
 * section tree, so strip the tokens before any config crosses to the browser.
 * (Pixel IDs stay — they're public by design.) Returns the config unchanged
 * when there's nothing to redact.
 */
const CAPI_SECRET_KEYS = [
  "meta_capi_token",
  "tiktok_capi_token",
  "capi_test_event_code",
] as const;

export function redactServerOnlyConfig<
  T extends { globals?: { analytics_pixels?: { base?: Record<string, unknown> } } } | null | undefined,
>(config: T): T {
  const base = config?.globals?.analytics_pixels?.base;
  if (!base || !CAPI_SECRET_KEYS.some((k) => k in base)) return config;
  const cleanBase: Record<string, unknown> = { ...base };
  for (const k of CAPI_SECRET_KEYS) delete cleanBase[k];
  return {
    ...config,
    globals: {
      ...config!.globals,
      analytics_pixels: { ...config!.globals!.analytics_pixels, base: cleanBase },
    },
  } as T;
}
