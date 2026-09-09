import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  order_number: z.string().min(1),
  phone: z.string().min(1),
});

const lookupRowSchema = z.object({
  order_number: z.string(),
  /** Coarse bucket (placed/confirmed/shipped/delivered) — kept for older clients. */
  status: z.string(),
  customer_name: z.string().nullable(),
  governorate: z.string().nullable(),
  /** Customer-facing stage (ten values). Optional so the row still validates
   *  against the RPC as deployed before migration 20260910010000. */
  stage: z.string().nullish(),
  /** First ordered product's slug, for a "rate your order" link. */
  review_product_slug: z.string().nullish(),
});

// lookup_order is a newly-added RPC (migration 20260606194612) that is not yet
// regenerated into database.types.ts. We use an untyped client so that the call
// compiles without any/ts-ignore; Zod validates the response shape at runtime.
function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      tenant_id: searchParams.get("tenant_id") ?? "",
      order_number: searchParams.get("order_number") ?? "",
      phone: searchParams.get("phone") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { tenant_id, order_number, phone } = parsed.data;

    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("lookup_order", {
      p_tenant_id: tenant_id,
      p_phone: phone,
      p_order_number: order_number,
    });

    if (error) {
      console.error("[api/orders/lookup]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    const rows = z.array(lookupRowSchema).safeParse(data);
    if (!rows.success || rows.data.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = rows.data[0];
    return NextResponse.json({
      order_number: row.order_number,
      status: row.status,
      customer_name: row.customer_name ?? undefined,
      governorate: row.governorate ?? undefined,
      stage: row.stage ?? undefined,
      review_product_slug: row.review_product_slug ?? undefined,
    });
  } catch (e) {
    console.error("[api/orders/lookup]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
