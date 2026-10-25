import { NextResponse } from "next/server";
import { z } from "zod";
import { maskIraqiMobile, normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  UPSELL_WINDOW_MS,
  upsellProofSecret,
  verifyUpsellProof,
} from "@/lib/order-upsell-proof";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Thank-you call card — the order's contact state (GET) and a second
// number (POST)
// =====================================================================
// A COD order is won or lost on one phone call, so the thank-you page
// shows the buyer which number they gave (masked), whether the WhatsApp
// confirmation has gone out, and lets them add a second number. Who may
// do that is the whole design, and it is the post-purchase upsell's:
//
//   - WHO: the caller presents the `x-upsell-proof` the checkout minted in
//     the response that created this order (lib/order-upsell-proof). The
//     order id alone proves nothing (it reaches merchant tools, webhooks
//     and couriers) and the order number is sequential. The tenant comes
//     FROM the proof and scopes every query; the request never names one.
//   - WHAT: the phone only ever leaves masked. "WhatsApp sent" is what the
//     platform's dispatcher logged for THIS order, never a promise.
//   - WHEN (POST): the order still awaits its confirmation call (`new`, or
//     `contacted`, which the WhatsApp bot sets the moment it sends), it is
//     inside the proof window, and it has no second number yet.
//
// Every refusal of WHO is the same 404, so the route cannot be used to
// learn whether an order exists. /api/checkout/orders is not touched.
// =====================================================================

const PROOF_HEADER = "x-upsell-proof";

/** The template the platform's dispatcher sends as the instant order
 *  confirmation (apps/platform/lib/interakt.ts TEMPLATE_NAMES.confirmation)
 *  and logs to whatsapp_logs.template_name. */
const CONFIRMATION_TEMPLATE = "cod_order_confirm";

/** Statuses in which the order is still waiting for its confirmation call. */
const AWAITING_CALL: readonly string[] = ["new", "contacted"];

const backupSchema = z.object({ phone: z.string().trim().min(1).max(32) });

type Svc = ReturnType<typeof createSupabaseServiceClient>;
type Ctx = { params: Promise<{ id: string }> };

interface ContactOrder {
  id: string;
  phone: string;
  /** Null when absent OR blank — a blank string is not a number to call. */
  secondaryPhone: string | null;
  status: string;
  createdAt: string;
  version: number;
}

class ContactReadError extends Error {}

const notFound = () =>
  NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
const unavailable = () =>
  NextResponse.json({ success: false, error: "Try again shortly" }, { status: 503 });

/** The proof's tenant, when the proof is valid for THIS order id. */
function provenTenant(req: Request, orderId: string): string | null {
  const secret = upsellProofSecret();
  if (!secret) return null;
  const proof = verifyUpsellProof(req.headers.get(PROOF_HEADER), secret);
  if (!proof || proof.orderId !== orderId) return null;
  return proof.tenantId;
}

async function loadOrder(
  svc: Svc,
  orderId: string,
  tenantId: string,
): Promise<ContactOrder | null> {
  const { data, error } = await svc
    .from("orders")
    .select("id, phone, secondary_phone, status, created_at, version, deleted_at")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ContactReadError(`order read failed: ${error.message}`);
  if (!data || data.deleted_at) return null;
  return {
    id: data.id,
    phone: data.phone,
    secondaryPhone: data.secondary_phone?.trim() || null,
    status: data.status,
    createdAt: data.created_at,
    version: data.version,
  };
}

/** May this order still take a second number? Checked against the row,
 *  not the proof. */
function acceptsBackup(order: ContactOrder, nowMs: number): boolean {
  return (
    order.secondaryPhone === null &&
    AWAITING_CALL.includes(order.status) &&
    nowMs - new Date(order.createdAt).getTime() <= UPSELL_WINDOW_MS
  );
}

/** True once the platform's dispatcher logged the confirmation as SENT for
 *  this order of this tenant. */
async function confirmationSent(
  svc: Svc,
  orderId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await svc
    .from("whatsapp_logs")
    .select("id")
    .eq("order_uuid", orderId)
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .eq("template_name", CONFIRMATION_TEMPLATE)
    .eq("status", "sent")
    .limit(1);
  if (error) throw new ContactReadError(`send log read failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const svc = createSupabaseServiceClient();
  try {
    const order = await loadOrder(svc, id, tenantId);
    if (!order) return notFound();
    const whatsappSent = await confirmationSent(svc, order.id, tenantId);
    return NextResponse.json({
      success: true,
      phone_masked: maskIraqiMobile(order.phone),
      has_backup: order.secondaryPhone !== null,
      can_add_backup: acceptsBackup(order, Date.now()),
      whatsapp_sent: whatsappSent,
    });
  } catch (e) {
    if (!(e instanceof ContactReadError)) throw e;
    console.error("[order-contact] GET", e.message);
    return unavailable();
  }
}

/** A second number is already on the order: a retry of the SAME number
 *  (a double tap, a lost response) is success; a different one is never
 *  overwritten from a shopper-facing page. */
function backupOutcome(order: ContactOrder, backup: string): NextResponse {
  if (normalizeIraqiMobile(order.secondaryPhone) === backup) {
    return NextResponse.json({ success: true, has_backup: true, already: true });
  }
  return NextResponse.json({ success: false, error: "has_backup" }, { status: 409 });
}

export async function POST(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const backup = normalizeIraqiMobile(parsed.data.phone);
  if (!backup) {
    return NextResponse.json({ success: false, error: "invalid_phone" }, { status: 422 });
  }

  const svc = createSupabaseServiceClient();
  try {
    const order = await loadOrder(svc, id, tenantId);
    if (!order) return notFound();
    if (order.secondaryPhone !== null) return backupOutcome(order, backup);
    if (backup === normalizeIraqiMobile(order.phone)) {
      return NextResponse.json({ success: false, error: "same_as_primary" }, { status: 422 });
    }
    if (!acceptsBackup(order, Date.now())) {
      return NextResponse.json({ success: false, error: "closed" }, { status: 409 });
    }

    // Optimistic on `version` (bumped by the BEFORE UPDATE trigger on every
    // write) with the awaiting-call statuses re-asserted in the same
    // statement: anything that changed the order since the read — staff,
    // the WhatsApp bot, a second tab — makes this match zero rows.
    const { data: updated, error: updateErr } = await svc
      .from("orders")
      .update({ secondary_phone: backup })
      .eq("id", order.id)
      .eq("tenant_id", tenantId)
      .eq("version", order.version)
      .in("status", [...AWAITING_CALL])
      .select("secondary_phone")
      .maybeSingle();
    if (updateErr) {
      console.error("[order-contact] POST update failed", updateErr.message);
      return unavailable();
    }
    if (!updated) {
      const current = await loadOrder(svc, id, tenantId);
      if (current && current.secondaryPhone !== null) return backupOutcome(current, backup);
      return NextResponse.json({ success: false, error: "changed" }, { status: 409 });
    }
    return NextResponse.json({ success: true, has_backup: true });
  } catch (e) {
    if (!(e instanceof ContactReadError)) throw e;
    console.error("[order-contact] POST", e.message);
    return unavailable();
  }
}
