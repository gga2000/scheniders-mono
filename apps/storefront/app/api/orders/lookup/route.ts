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
  status: z.string(),
  customer_name: z.string().nullable(),
  governorate: z.string().nullable(),
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

// POST, not GET: the request carries a customer's phone number, and a query
// string is written to edge access logs and leaks via Referer. The body is not.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const parsed = querySchema.safeParse(body);

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
    });
  } catch (e) {
    console.error("[api/orders/lookup]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
