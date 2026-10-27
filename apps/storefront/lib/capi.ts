// =====================================================================
// Server-side Conversions API (Meta + TikTok) — Purchase dedup
// =====================================================================
// Mirrors the browser Purchase pixel with a server event carrying the SAME
// event_id, so Meta/TikTok deduplicate the pair (iOS/adblock resilience). All
// PII (phone/email/name) is SHA-256 hashed before it ever leaves the server —
// raw identifiers are never sent. Best-effort: a CAPI failure never fails the
// order. Tokens come from the tenant's analytics config (server-only).
// =====================================================================

import { createHash } from "crypto";
import type { AnalyticsConfig } from "@scheniders/shared";
import { providerBaseUrls } from "./provider-env";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Normalize an Iraqi mobile to E.164 digits (9647XXXXXXXXX) for hashing. */
function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return `964${d}`;
}

export interface CapiPurchaseInput {
  analytics: AnalyticsConfig;
  eventId: string;
  customer: { phone: string; name?: string | null; email?: string | null };
  value: number;
  contents: ReadonlyArray<{ id: string; quantity: number; item_price: number }>;
  eventSourceUrl?: string;
  eventTime?: number; // unix seconds (injectable for tests)
}

interface MetaEvent {
  data: Array<Record<string, unknown>>;
  test_event_code?: string;
}

export function buildMetaPurchaseEvent(input: CapiPurchaseInput): MetaEvent {
  const em = input.customer.email?.trim().toLowerCase();
  const fn = input.customer.name?.trim().toLowerCase();
  const user_data: Record<string, string[]> = {
    ph: [sha256(normalizePhone(input.customer.phone))],
  };
  if (em) user_data.em = [sha256(em)];
  if (fn) user_data.fn = [sha256(fn)];

  const event: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    user_data,
    custom_data: {
      currency: "IQD",
      value: input.value,
      content_type: "product",
      content_ids: input.contents.map((c) => c.id),
      contents: input.contents.map((c) => ({
        id: c.id,
        quantity: c.quantity,
        item_price: c.item_price,
      })),
      num_items: input.contents.reduce((s, c) => s + c.quantity, 0),
    },
  };
  if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;

  const payload: MetaEvent = { data: [event] };
  if (input.analytics.capi_test_event_code) {
    payload.test_event_code = input.analytics.capi_test_event_code;
  }
  return payload;
}

interface TikTokEvent {
  event_source: "web";
  event_source_id: string;
  data: Array<Record<string, unknown>>;
}

export function buildTikTokPurchaseEvent(input: CapiPurchaseInput): TikTokEvent {
  const em = input.customer.email?.trim().toLowerCase();
  const user: Record<string, string> = {
    phone: sha256(normalizePhone(input.customer.phone)),
  };
  if (em) user.email = sha256(em);

  return {
    event_source: "web",
    event_source_id: input.analytics.tiktok_pixel_id ?? "",
    data: [
      {
        event: "CompletePayment",
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        user,
        properties: {
          currency: "IQD",
          value: input.value,
          contents: input.contents.map((c) => ({
            content_id: c.id,
            quantity: c.quantity,
            price: c.item_price,
          })),
        },
        ...(input.eventSourceUrl ? { page: { url: input.eventSourceUrl } } : {}),
      },
    ],
  };
}

const META_API = `${providerBaseUrls.META_API_BASE_URL}/v19.0`;
const TIKTOK_API = `${providerBaseUrls.TIKTOK_API_BASE_URL}/open_api/v1.3/event/track/`;

/** Fire Purchase to whichever Conversions APIs are configured. Best-effort. */
export async function sendPurchaseCapi(input: CapiPurchaseInput): Promise<void> {
  const a = input.analytics;
  const tasks: Promise<unknown>[] = [];

  if (a.meta_pixel_id && a.meta_capi_token) {
    const url = `${META_API}/${encodeURIComponent(a.meta_pixel_id)}/events?access_token=${encodeURIComponent(a.meta_capi_token)}`;
    tasks.push(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildMetaPurchaseEvent(input)),
      }).catch(() => undefined),
    );
  }

  if (a.tiktok_pixel_id && a.tiktok_capi_token) {
    tasks.push(
      fetch(TIKTOK_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Access-Token": a.tiktok_capi_token,
        },
        body: JSON.stringify(buildTikTokPurchaseEvent(input)),
      }).catch(() => undefined),
    );
  }

  await Promise.allSettled(tasks);
}
