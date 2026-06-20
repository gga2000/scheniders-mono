import { NextResponse } from "next/server";
import { z } from "zod";
import { cartItemsSubtotal, normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Best-effort cart capture: the storefront beacons this when a customer reaches
// checkout with a valid phone + items but hasn't ordered yet. Upserts one live
// row per (tenant, phone); the reminder sweep (R2) nudges them over WhatsApp.
const itemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  phone: z.string().min(1),
  items: z.array(itemSchema).min(1).max(50),
  governorate: z.string().max(8).optional(),
  locale: z.string().max(8).optional(),
});

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
  const { tenant_id, items, governorate, locale } = parsed.data;

  // A malformed phone means we can never message them — silently no-op so the
  // client beacon never surfaces an error.
  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ success: true, skipped: "phone" });
  }

  const service = createSupabaseServiceClient();
  // Omit reminded_at/recovered_at so an update preserves them (a beacon must not
  // reset a cart that was already reminded or recovered); a fresh insert
  // defaults both to null.
  const { error } = await service.from("abandoned_carts").upsert(
    {
      tenant_id,
      phone,
      items,
      subtotal_iqd: cartItemsSubtotal(items),
      governorate: governorate ?? null,
      locale: locale ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,phone" },
  );

  if (error) {
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
