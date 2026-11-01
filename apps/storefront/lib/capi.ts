// =====================================================================
// Server-side Conversions API (Meta + TikTok) — Purchase dedup
// =====================================================================
// Mirrors the browser Purchase pixel with a server event carrying the SAME
// event_id, so Meta/TikTok deduplicate the pair (iOS/adblock resilience).
//
// Match quality: besides the hashed phone/name, each event carries what
// the networks join a click to a buyer by — the browser's first-party ad
// cookies (Meta `_fbp`/`_fbc`, TikTok `_ttp`), the click id from the ad
// link when present, the shopper's IP and user agent, the page URL, and a
// hashed per-store `external_id` that the browser pixels send too. PII
// (phone/name/email/city) is SHA-256 hashed before it leaves the server;
// IP, user agent and the cookie values are sent as-is, as both APIs
// require.
//
// Best-effort: a CAPI failure never fails the order. It is not silent: a
// rejected request is logged with the network's answer. Tokens come from
// the tenant's analytics config (server-only).
// =====================================================================

import { createHash } from "crypto";
import {
  governorateLabel,
  pixelExternalIdSource,
  pixelPhoneDigits,
  type AnalyticsConfig,
} from "@scheniders/shared";
import { providerBaseUrls } from "./provider-env";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** What the request itself says about the buyer's browser. */
export interface CapiRequestContext {
  ip?: string | null;
  userAgent?: string | null;
  /** The page the order was placed on (the request's Referer). */
  url?: string | null;
  /** Meta browser id cookie `_fbp`. */
  fbp?: string | null;
  /** Meta click id cookie `_fbc` («fb.1.<ms>.<fbclid>»). */
  fbc?: string | null;
  /** TikTok browser id cookie `_ttp`. */
  ttp?: string | null;
  /** TikTok click id from the ad link, when the store kept it. */
  ttclid?: string | null;
}

export interface CapiPurchaseInput {
  analytics: AnalyticsConfig;
  tenantId: string;
  eventId: string;
  customer: {
    phone: string;
    name?: string | null;
    email?: string | null;
    /** Governorate code (BG / BGD …); sent as the hashed city. */
    governorate?: string | null;
  };
  value: number;
  contents: ReadonlyArray<{ id: string; quantity: number; item_price: number }>;
  context?: CapiRequestContext;
  eventTime?: number; // unix seconds (injectable for tests)
}

/** Lowercase, no spaces or punctuation: Meta's normalisation for name/city. */
function normalizeToken(v: string): string {
  return v.trim().toLowerCase().replace(/[\s\p{P}]+/gu, "");
}

/** First and last name tokens of a typed full name. */
function splitName(name: string | null | undefined): { fn: string | null; ln: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fn: null, ln: null };
  const fn = normalizeToken(parts[0] ?? "");
  const ln = parts.length > 1 ? normalizeToken(parts[parts.length - 1] ?? "") : "";
  return { fn: fn || null, ln: ln || null };
}

/** The governorate's English name as a Meta city token, or null. */
function cityToken(code: string | null | undefined): string | null {
  if (!code) return null;
  const en = governorateLabel(code, "en");
  // governorateLabel echoes an unknown input back; only a resolved name counts.
  if (en === code) return null;
  return normalizeToken(en) || null;
}

/** A plausible `_fbc`/`_fbp` value («fb.<n>.<ts>.<id>»), else null. */
function metaCookie(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t && /^fb\.\d\.\d+\.[\w.-]+$/.test(t) ? t : null;
}

function nonEmpty(v: string | null | undefined, max = 512): string | null {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

/** The comma / whitespace separated TikTok pixel list, as the browser loads it. */
export function tiktokPixelIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => /^[A-Z0-9]{12,}$/i.test(v));
}

interface MetaEvent {
  data: Array<Record<string, unknown>>;
  test_event_code?: string;
}

export function buildMetaPurchaseEvent(input: CapiPurchaseInput): MetaEvent {
  const ctx = input.context ?? {};
  const phone = pixelPhoneDigits(input.customer.phone);
  const em = input.customer.email?.trim().toLowerCase();
  const { fn, ln } = splitName(input.customer.name);
  const ct = cityToken(input.customer.governorate);

  const user_data: Record<string, string | string[]> = { country: [sha256("iq")] };
  if (phone) {
    user_data.ph = [sha256(phone)];
    user_data.external_id = [sha256(pixelExternalIdSource(input.tenantId, phone))];
  }
  if (em) user_data.em = [sha256(em)];
  if (fn) user_data.fn = [sha256(fn)];
  if (ln) user_data.ln = [sha256(ln)];
  if (ct) user_data.ct = [sha256(ct)];
  const ip = nonEmpty(ctx.ip, 64);
  if (ip && ip !== "unknown") user_data.client_ip_address = ip;
  const ua = nonEmpty(ctx.userAgent);
  if (ua) user_data.client_user_agent = ua;
  const fbp = metaCookie(ctx.fbp);
  if (fbp) user_data.fbp = fbp;
  const fbc = metaCookie(ctx.fbc);
  if (fbc) user_data.fbc = fbc;

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
  const url = nonEmpty(ctx.url, 1024);
  if (url) event.event_source_url = url;

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

/** One Events API body per configured TikTok pixel. */
export function buildTikTokPurchaseEvents(input: CapiPurchaseInput): TikTokEvent[] {
  const ctx = input.context ?? {};
  const phone = pixelPhoneDigits(input.customer.phone);
  const em = input.customer.email?.trim().toLowerCase();
  const user: Record<string, string> = {};
  // TikTok hashes the phone in E.164 WITH the plus.
  if (phone) {
    user.phone = sha256(`+${phone}`);
    user.external_id = sha256(pixelExternalIdSource(input.tenantId, phone));
  }
  if (em) user.email = sha256(em);
  const ttp = nonEmpty(ctx.ttp, 256);
  if (ttp) user.ttp = ttp;
  const ttclid = nonEmpty(ctx.ttclid, 512);
  if (ttclid) user.ttclid = ttclid;
  const ip = nonEmpty(ctx.ip, 64);
  if (ip && ip !== "unknown") user.ip = ip;
  const ua = nonEmpty(ctx.userAgent);
  if (ua) user.user_agent = ua;
  const url = nonEmpty(ctx.url, 1024);
  const single = input.contents.length === 1 ? input.contents[0] : undefined;

  const event = {
    event: "CompletePayment",
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    user,
    properties: {
      currency: "IQD",
      value: input.value,
      content_type: single ? "product" : "product_group",
      ...(single ? { content_id: single.id } : {}),
      contents: input.contents.map((c) => ({
        content_id: c.id,
        content_type: "product",
        quantity: c.quantity,
        price: c.item_price,
      })),
    },
    ...(url ? { page: { url } } : {}),
  };

  return tiktokPixelIds(input.analytics.tiktok_pixel_id).map((id) => ({
    event_source: "web",
    event_source_id: id,
    data: [event],
  }));
}

const META_API = `${providerBaseUrls.META_API_BASE_URL}/v21.0`;
const TIKTOK_API = `${providerBaseUrls.TIKTOK_API_BASE_URL}/open_api/v1.3/event/track/`;

/** POST one event body; log (never throw) when the network refuses it. */
async function post(label: string, url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[capi] ${label} rejected: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return;
    }
    // TikTok answers 200 with a non-zero `code` when it drops the event.
    if (label.startsWith("tiktok")) {
      const json = (await res.json()) as { code?: number; message?: string };
      if (json.code !== 0) console.error(`[capi] ${label} refused: ${json.code} ${json.message ?? ""}`);
    }
  } catch (e) {
    console.error(`[capi] ${label} unreachable:`, e);
  }
}

/** Fire Purchase to whichever Conversions APIs are configured. Best-effort. */
export async function sendPurchaseCapi(input: CapiPurchaseInput): Promise<void> {
  const a = input.analytics;
  const tasks: Promise<void>[] = [];

  if (a.meta_pixel_id && a.meta_capi_token) {
    const url = `${META_API}/${encodeURIComponent(a.meta_pixel_id.trim())}/events?access_token=${encodeURIComponent(a.meta_capi_token)}`;
    tasks.push(post("meta", url, {}, buildMetaPurchaseEvent(input)));
  }

  if (a.tiktok_capi_token) {
    for (const body of buildTikTokPurchaseEvents(input)) {
      tasks.push(post(`tiktok ${body.event_source_id}`, TIKTOK_API, { "Access-Token": a.tiktok_capi_token }, body));
    }
  }

  await Promise.all(tasks);
}
