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
//   * every line must be one of that store's orderable products; its name
//     and unit price come from the catalogue.
//   * volume is bounded per IP and per (store, phone). This fails closed:
//     a row here can later drive a WhatsApp to that number, and when the
//     limiter cannot answer, the database behind this route cannot either.
//   * consent is recorded only when the caller sends the consent line the
//     shopper was shown, as consent_at + a version hash of that text.

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
 *  else null. The phone is hashed so the limiter never holds a raw number. */
async function captureRateLimited(
  req: Request,
  tenantId: string,
  phone: string,
): Promise<number | null> {
  const phoneKey = createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
  // "unknown" only happens off the edge (local dev). One shared bucket for
  // every such caller would throttle them together, so it is skipped.
  const ip = clientIp(req.headers);
  const mode = "fail-closed";
  const checks = await Promise.all([
    ip !== "unknown"
      ? consumeRateLimit(`cart-capture:ip:${ip}`, CAPTURE_LIMIT_PER_IP, CAPTURE_WINDOW_SECONDS, mode)
      : null,
    consumeRateLimit(`cart-capture:phone:${phoneKey}`, CAPTURE_LIMIT_PER_PHONE, CAPTURE_WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

/** The lines that are this store's orderable products, named and priced
 *  from the catalogue (the variant's price, else the product's). It ignores
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

  const variantIds = items
    .map((i) => i.variant_id)
    .filter((v): v is string => typeof v === "string");
  const variants = new Map<string, { product_id: string; price: number | null; is_enabled: boolean | null }>();
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
  for (const i of items) {
    const p = byId.get(i.product_id);
    if (!p || p.is_archived || p.status !== "active" || !p.is_visible || p.is_supply) continue;
    let unitPrice: number;
    if (i.variant_id) {
      const v = variants.get(i.variant_id);
      if (!v || v.product_id !== i.product_id || v.is_enabled === false) continue;
      unitPrice = Number(v.price ?? p.website_price ?? p.price) || 0;
    } else {
      unitPrice = Number(p.website_price ?? p.price) || 0;
    }
    if (unitPrice <= 0) continue;
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

  const now = new Date().toISOString();
  // reminded_at, recovered_at and, for a capture without consent, the
  // consent columns are left out, so an update preserves them. A beacon
  // must never reset a cart that was already reminded or recovered, or
  // withdraw consent the shopper gave earlier. A fresh insert defaults
  // all of them to null.
  const { error } = await service.from("abandoned_carts").upsert(
    {
      tenant_id: tenant.id,
      phone,
      items: lines,
      subtotal_iqd: cartItemsSubtotal(lines),
      governorate: governorate ?? null,
      locale: locale ?? null,
      updated_at: now,
      ...(consent_text
        ? { consent_at: now, consent_text_version: consentVersion(consent_text) }
        : {}),
    },
    { onConflict: "tenant_id,phone" },
  );

  if (error) {
    console.error("[cart/abandoned] upsert failed:", error);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
