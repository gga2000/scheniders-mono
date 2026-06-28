import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Returns ONLY a points balance integer for (tenant, phone). customer_points is
// member-RLS, so this reads via the service client. No PII is exposed — just a
// number the shopper uses to decide how many points to redeem at checkout.
const querySchema = z.object({
  tenant_id: z.string().uuid(),
  phone: z.string().min(1),
});

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id"),
    phone: url.searchParams.get("phone"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) return NextResponse.json({ balance: 0 });

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("customer_points")
    .select("balance")
    .eq("tenant_id", parsed.data.tenant_id)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  return NextResponse.json({ balance: data?.balance ?? 0 });
}
