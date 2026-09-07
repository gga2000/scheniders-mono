// =====================================================================
// Marketing-pixel client tracker (app-agnostic)
// =====================================================================
// Fires standard events on whatever pixels the host page initialised (Meta
// `fbq`, TikTok `ttq`). Pure window guards — in the platform editor preview
// neither global exists, so every call is a safe no-op. The pixel <Script>
// init + PageView live in the storefront layout; this only adds the funnel
// events (ViewContent / AddToCart / InitiateCheckout / Purchase).
// =====================================================================

import type { PixelEventData } from "@scheniders/shared";

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
}

function getFbq(): Fbq | undefined {
  const f = (globalThis as { fbq?: unknown }).fbq;
  return typeof f === "function" ? (f as Fbq) : undefined;
}
function getTtq(): Ttq | undefined {
  const t = (globalThis as { ttq?: { track?: unknown } }).ttq;
  return t && typeof t.track === "function" ? (t as Ttq) : undefined;
}

export function trackPixel(
  event: PixelEvent,
  data: PixelEventData,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;

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
