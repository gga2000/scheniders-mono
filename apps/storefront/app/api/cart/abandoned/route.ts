import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  IRAQ_GOVERNORATES,
  cartItemsSubtotal,
  normalizeIraqiMobile,
  type AbandonedCartItem,
  type GovernorateCode,
} from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { resolveStoreTenant } from "@/lib/route-guards";
import { storeKeyFromRequest } from "@/lib/store-host";
import { catalogueUnitPrice, type CatalogueVariant } from "@/lib/catalogue-line";
import { productsSoldByVariant, VariantReadError } from "@/lib/variant-products";
import { DUPLICATE_ORDER_WINDOW_MINUTES } from "@/lib/order-duplicate-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Half-filled phone capture. The storefront beacons this when a shopper
// has typed a valid phone on an order form and has not ordered yet. One
// live row per (tenant, phone). Staff work it from the orders «متروكة» tab.
// An automatic WhatsApp may only ever go to a row that carries consent_at.
//
// This route is unauthenticated by nature and writes with the service role,
// so everything it stores is decided here, not by the caller:
//   * the store comes from the request's host (lib/store-host), never from
//     the body, and must be publicly live. A draft-view session is the
//     merchant, so nothing is captured.
//   * every line must be one of that store's orderable products, by the
//     checkout's own rule (lib/catalogue-line); its name and unit price come
//     from the catalogue.
//   * volume is bounded per IP and per (store, phone). This fails closed:
//     a row here can later drive a WhatsApp to that number, and when the
//     limiter cannot answer, the database behind this route cannot either.
//     A limiter outage therefore also answers 429, not 503.
//   * consent is recorded when the caller sends a consent line, as
//     consent_at + a version hash of that text. The text is the caller's
//     claim: nothing here checks it against the line this store's config
//     renders. The automatic reminder is OFF; before it is turned on, the
//     sweep has to accept only versions of the configured line.
//   * what a capture does to an existing (store, phone) row, including one
//     an order already recovered, is decided atomically in SQL
//     (capture_abandoned_cart, migration 20261022000000).

const GOVERNORATE_CODES = IRAQ_GOVERNORATES.map((g) => g.code) as [
  GovernorateCode,
  ...GovernorateCode[],
];

/** Tenant statuses whose storefront is publicly live (as /api/events). */
const LIVE_TENANT_STATUSES: ReadonlySet<string> = new Set(["active", "trial"]);

/** A shopper editing the form beacons a handful of times. The per-IP cap is
 *  loose because Iraqi carriers put many shoppers behind one CGNAT address. */
const CAPTURE_WINDOW_SECONDS = 600;
const CAPTURE_LIMIT_PER_IP = 120;
const CAPTURE_LIMIT_PER_PHONE = 20;

/** A capture landing this soon after an order recovered the row is a late
 *  beacon from that same visit, and leaves the recovery as it is. Later, it
 *  is a new abandonment and reopens the row. The same window inside which a
 *  repeat order from this phone counts as the order just placed. */
const CAPTURE_REOPEN_AFTER_SECONDS = DUPLICATE_ORDER_WINDOW_MINUTES * 60;

// Names and prices are not read from the client. Zod strips any it sends.
const itemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(100),
});

const bodySchema = z.object({
  phone: z.string().min(1).max(40),
  items: z.array(itemSchema).min(1).max(50),
  governorate: z.enum(GOVERNORATE_CODES).optional().catch(undefined),
  locale: z.string().max(8).optional(),
  /** The consent line exactly as the shopper saw it under the phone field. */
  consent_text: z.string().trim().min(1).max(300).optional(),
});

type CaptureItem = z.infer<typeof itemSchema>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** One stored line: the shared AbandonedCartItem shape the platform reads
 *  back. A type alias, not the interface itself, because only an object
 *  type literal is assignable to the jsonb `items` column's `Json` type
 *  (an interface has no implicit index signature, so `AbandonedCartItem[]`
 *  is rejected there). */
type CaptureLine = {
  product_id: AbandonedCartItem["product_id"];
  variant_id: string | null;
  name: AbandonedCartItem["name"];
  quantity: AbandonedCartItem["quantity"];
  price: AbandonedCartItem["price"];
};

/** "sha256:" + 16 hex of the consent line, so a capture can be matched to
 *  the config revision that rendered it. */
function consentVersion(text: string): string {
  return `sha256:${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}`;
}

/** Seconds to wait when the IP or the (store, phone) bucket is exhausted,
 *  else null. The phone key is an unsalted hash: it keeps the number out of
 *  the key as written, but over ~10^8 Iraqi mobiles it is reversible. It is
 *  no more sensitive than abandoned_carts.phone in the same database. */
async function captureRateLimited(
  req: Request,
  tenantId: string,
  phone: string,
): Promise<number | null> {
  const phoneKey = createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
  // A request with no forwarded address (off the edge) shares one "unknown"
  // bucket, so the per-IP limit always applies.
  const ip = clientIp(req.headers);
  const mode = "fail-closed";
  const checks: RateLimitResult[] = await Promise.all([
    consumeRateLimit(`cart-capture:ip:${ip}`, CAPTURE_LIMIT_PER_IP, CAPTURE_WINDOW_SECONDS, mode),
    consumeRateLimit(`cart-capture:phone:${phoneKey}`, CAPTURE_LIMIT_PER_PHONE, CAPTURE_WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c) => !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

/** The lines that are this store's orderable products, named and priced
 *  from the catalogue (lib/catalogue-line). A repeated product + variant
 *  keeps its first line only, as the checkout refuses repeats. It ignores
 *  quantity breaks: this is a lead record, not a charge. Null when the
 *  catalogue could not be read. */
async function catalogueLines(
  svc: ServiceClient,
  tenantId: string,
  items: CaptureItem[],
): Promise<CaptureLine[] | null> {
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  const { data: products, error: productsErr } = await svc
    .from("products")
    .select("id, name, price, website_price, status, is_visible, is_archived, is_supply")
    .in("id", productIds)
    .eq("tenant_id", tenantId);
  if (productsErr || !products) {
    console.error("[cart/abandoned] product lookup failed:", productsErr);
    return null;
  }

  let soldByVariant: Set<string>;
  try {
    soldByVariant = await productsSoldByVariant(svc, tenantId, productIds);
  } catch (e) {
    if (!(e instanceof VariantReadError)) throw e;
    console.error("[cart/abandoned]", e.message);
    return null;
  }

  const variantIds = items
    .map((i) => i.variant_id)
    .filter((v): v is string => typeof v === "string");
  const variants = new Map<string, CatalogueVariant>();
  if (variantIds.length > 0) {
    const { data: rows, error: variantsErr } = await svc
      .from("product_variants")
      .select("id, product_id, price, is_enabled")
      .in("id", variantIds)
      .eq("tenant_id", tenantId);
    if (variantsErr || !rows) {
      console.error("[cart/abandoned] variant lookup failed:", variantsErr);
      return null;
    }
    for (const v of rows) variants.set(v.id, v);
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: CaptureLine[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    const lineKey = `${i.product_id}:${i.variant_id ?? ""}`;
    if (seen.has(lineKey)) continue;
    const p = byId.get(i.product_id);
    const unitPrice = catalogueUnitPrice(i, p, variants, soldByVariant);
    if (p === undefined || unitPrice === null) continue;
    seen.add(lineKey);
    lines.push({
      product_id: p.id,
      variant_id: i.variant_id ?? null,
      name: p.name,
      quantity: i.quantity,
      price: unitPrice,
    });
  }
  return lines;
}

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  }
  const { items, governorate, locale, consent_text } = parsed.data;

  // A malformed phone means we can never reach them. This is a silent
  // no-op, so the client beacon never surfaces an error.
  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ success: true, skipped: "phone" });
  }

  const storeKey = storeKeyFromRequest(req.headers);
  if (!storeKey) {
    return NextResponse.json({ error: "Unknown store" }, { status: 400 });
  }
  const tenant = await resolveStoreTenant(storeKey);
  if (!tenant || !LIVE_TENANT_STATUSES.has(tenant.status)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  }
  if (tenant.is_draft_view) {
    return NextResponse.json({ success: true, skipped: "draft" });
  }

  const limited = await captureRateLimited(req, tenant.id, phone);
  if (limited !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited) } },
    );
  }

  const service = createSupabaseServiceClient();
  const lines = await catalogueLines(service, tenant.id, items);
  if (lines === null) {
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  if (lines.length === 0) {
    return NextResponse.json({ success: true, skipped: "items" });
  }

  // The function keeps an open row's reminder, earlier consent, governorate
  // and locale when this capture has none; leaves a row an order recovered
  // moments ago untouched; and reopens one recovered longer ago as a fresh
  // capture (see the migration). Absent optionals are omitted, not null.
  const { data: written, error } = await service.rpc("capture_abandoned_cart", {
    _tenant_id: tenant.id,
    _phone: phone,
    _items: lines,
    _subtotal_iqd: cartItemsSubtotal(lines),
    _reopen_after_seconds: CAPTURE_REOPEN_AFTER_SECONDS,
    ...(governorate ? { _governorate: governorate } : {}),
    ...(locale ? { _locale: locale } : {}),
    ...(consent_text ? { _consent_text_version: consentVersion(consent_text) } : {}),
  });

  if (error) {
    console.error("[cart/abandoned] capture write failed:", error);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  if (written === false) {
    return NextResponse.json({ success: true, skipped: "recovered" });
  }
  return NextResponse.json({ success: true });
}
