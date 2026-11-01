// =====================================================================
// Marketing-pixel client tracker (app-agnostic)
// =====================================================================
// Fires standard events on whatever pixels the host page initialised (Meta
// `fbq`, TikTok `ttq`, Snap `snaptr`). Pure window guards — in the platform
// editor preview none of the globals exist, so every call is a safe no-op.
// The pixel <Script> init + first PageView live in the storefront layout;
// this adds the funnel events (ViewContent / AddToCart / InitiateCheckout /
// Purchase) and the client-navigation PageView re-fire (P2-29).
// =====================================================================

import {
  PENDING_PURCHASE_KEY,
  parsePendingPurchase,
  pixelExternalIdSource,
  pixelPhoneDigits,
  type PendingPurchase,
  type PixelEventData,
} from "@scheniders/shared";

export type PixelEvent =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

// TikTok names its purchase event "CompletePayment"; the rest match Meta.
const TIKTOK_EVENT: Record<PixelEvent, string> = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "CompletePayment",
};

type Fbq = (...args: unknown[]) => void;
interface Ttq {
  track: (name: string, data?: unknown, opts?: unknown) => void;
  page?: () => void;
  identify?: (data: Record<string, string>) => void;
}
type Snaptr = (...args: unknown[]) => void;

function getFbq(): Fbq | undefined {
  const f = (globalThis as { fbq?: unknown }).fbq;
  return typeof f === "function" ? (f as Fbq) : undefined;
}
function getTtq(): Ttq | undefined {
  const t = (globalThis as { ttq?: { track?: unknown } }).ttq;
  return t && typeof t.track === "function" ? (t as Ttq) : undefined;
}
function getSnaptr(): Snaptr | undefined {
  const s = (globalThis as { snaptr?: unknown }).snaptr;
  return typeof s === "function" ? (s as Snaptr) : undefined;
}

/**
 * Page-view re-fire for client-side navigations. The inline pixel scripts
 * already send the first PageView on document load, so callers must skip
 * the initial render and only call this on a real route change. Each
 * pixel is fired only when its global was initialised — a store with no
 * TikTok id never sees `ttq` on window, so nothing fires for it.
 */
export function trackPageView(): void {
  if (typeof window === "undefined") return;
  getFbq()?.("track", "PageView");
  const ttq = getTtq();
  if (ttq && typeof ttq.page === "function") ttq.page();
  getSnaptr()?.("track", "PAGE_VIEW");
}

/* ── First-party funnel ─────────────────────────────────────────────── */

export type FunnelEventType = "page_view" | "view_product" | "add_to_cart" | "initiate_checkout";
export interface FunnelEvent {
  type: FunnelEventType;
  page_id?: string;
  product_id?: string;
}

// The storefront's FunnelBeacon installs a sink; sections stay app-agnostic
// and simply forward the pixel events they already fire. No sink (editor
// preview, tests) → nothing recorded. page_view and view_product are NOT
// forwarded: the beacon records those itself on every page render, and
// forwarding PageView / ViewContent as well would count each one twice.
let funnelSink: ((e: FunnelEvent) => void) | null = null;
export function setFunnelSink(sink: ((e: FunnelEvent) => void) | null): void {
  funnelSink = sink;
}

const FUNNEL_OF: Partial<Record<PixelEvent, FunnelEventType>> = {
  AddToCart: "add_to_cart",
  InitiateCheckout: "initiate_checkout",
  // Purchase is recorded by the checkout server with its own total.
};

export function trackPixel(
  event: PixelEvent,
  data: PixelEventData,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;

  const funnelType = FUNNEL_OF[event];
  if (funnelSink && funnelType) {
    funnelSink({ type: funnelType, product_id: data.content_ids[0] });
  }

  const fbq = getFbq();
  if (fbq) {
    fbq(
      "track",
      event,
      {
        content_ids: data.content_ids,
        content_type: "product",
        contents: data.contents.map((c) => ({
          id: c.id,
          quantity: c.quantity,
          item_price: c.item_price,
        })),
        value: data.value,
        currency: data.currency,
        num_items: data.num_items,
      },
      eventId ? { eventID: eventId } : undefined,
    );
  }

  const ttq = getTtq();
  if (ttq) {
    // TikTok's Events API wants `content_id` + `content_type` on every
    // event (its console warns "missing content_id" otherwise, and the
    // catalogue match for Purchase/ViewContent silently fails). Single-item
    // events carry the product id at the top level; multi-line carts are a
    // `product_group` whose ids live in `contents[]`.
    const single =
      data.content_ids.length === 1 ? data.content_ids[0] : undefined;
    ttq.track(
      TIKTOK_EVENT[event],
      {
        ...(single ? { content_id: single } : {}),
        content_type: single ? "product" : "product_group",
        contents: data.contents.map((c) => ({
          content_id: c.id,
          content_type: "product",
          quantity: c.quantity,
          price: c.item_price,
        })),
        value: data.value,
        currency: data.currency,
      },
      eventId ? { event_id: eventId } : undefined,
    );
  }
}

/** A stable id shared by the browser event and its CAPI twin (dedup, R2). */
export function newPixelEventId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ── Purchase handoff ───────────────────────────────────────────────── */
// The order forms navigate to the thank-you page the moment the order is
// accepted. A pixel request still in flight at that moment can be cancelled
// with the page, and the ad network never sees the sale. So the form hands
// the Purchase to the next page instead (sessionStorage, same tab), where
// the pixel layer fires it once with the same event id the server sent to
// the Conversions APIs. With storage blocked, the form fires it itself.

async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashed match keys for the buyer, as the pixels and the server send them. */
async function buyerHashes(
  tenantId: string,
  phone: string,
): Promise<Pick<PendingPurchase, "ph" | "ph_plus" | "external_id">> {
  const digits = pixelPhoneDigits(phone);
  if (!digits) return { ph: null, ph_plus: null, external_id: null };
  const [ph, ph_plus, external_id] = await Promise.all([
    sha256Hex(digits),
    sha256Hex(`+${digits}`),
    sha256Hex(pixelExternalIdSource(tenantId, digits)),
  ]);
  return { ph, ph_plus, external_id };
}

/** TikTok advanced matching: who the next event is about (hashed). */
function identifyTikTok(p: Pick<PendingPurchase, "ph_plus" | "external_id">): void {
  const ttq = getTtq();
  if (!ttq || typeof ttq.identify !== "function") return;
  const data: Record<string, string> = {};
  if (p.ph_plus) data.phone_number = p.ph_plus;
  if (p.external_id) data.external_id = p.external_id;
  if (Object.keys(data).length > 0) ttq.identify(data);
}

/**
 * Called by an order form once the order is accepted, before it navigates.
 * Never throws: a lost handoff costs one browser event, the server event
 * still counts the sale.
 */
export async function handOffPurchase(input: {
  tenantId: string;
  phone: string;
  data: PixelEventData;
  eventId: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  let hashes: Pick<PendingPurchase, "ph" | "ph_plus" | "external_id">;
  try {
    hashes = await buyerHashes(input.tenantId, input.phone);
  } catch (e) {
    console.warn("[pixels] buyer hashing failed", e);
    hashes = { ph: null, ph_plus: null, external_id: null };
  }
  const pending: PendingPurchase = {
    event_id: input.eventId,
    data: input.data,
    ...hashes,
    ts: Date.now(),
  };
  try {
    window.sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(pending));
  } catch {
    // Storage refused (private mode): fire here, before the navigation.
    identifyTikTok(pending);
    trackPixel("Purchase", pending.data, pending.event_id);
  }
}

/**
 * Fire the Purchase an order form handed over, once. Run by the storefront's
 * pixel layer on the page after the order, after the pixel scripts have
 * initialised. Meta's advanced matching for it is applied at that page's
 * `fbq('init')`, which reads the same handoff.
 */
export function firePendingPurchase(): void {
  if (typeof window === "undefined") return;
  // No pixel on this page to fire into: leave the handoff for one that has.
  if (!getFbq() && !getTtq()) return;
  let pending: PendingPurchase | null = null;
  try {
    pending = parsePendingPurchase(window.sessionStorage.getItem(PENDING_PURCHASE_KEY), Date.now());
    window.sessionStorage.removeItem(PENDING_PURCHASE_KEY);
  } catch {
    // Storage unreadable: the form already fired the event itself.
    return;
  }
  if (!pending) return;
  identifyTikTok(pending);
  trackPixel("Purchase", pending.data, pending.event_id);
}
