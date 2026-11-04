import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient, isPrimeUnreachable, PrimeApiError } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { primeStateOf } from "@/lib/prime/district";
import { primeDistrictsOf } from "@/lib/prime/districts-load";

export const dynamic = "force-dynamic";

const querySchema = z.object({
    city: z.string().trim().max(100).default(""),
    governorate: z.string().trim().max(10).default(""),
});

/**
 * GET /api/prime/districts?city=…&governorate=… — Prime's districts for the
 * order's governorate, for the new-order form's picker. Read only; any member.
 */
export async function GET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = querySchema.safeParse({
        city: request.nextUrl.searchParams.get("city") ?? undefined,
        governorate: request.nextUrl.searchParams.get("governorate") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid governorate" }, { status: 400 });

    const client = getPrimeClient();
    const merchant = client ? await loadPrimeMerchant(createSupabaseServiceClient(), caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, connected: false });

    const state = primeStateOf({ city: parsed.data.city, governorate_code: parsed.data.governorate, validated_governorate_code: undefined, address_details: undefined });
    if (!state) return NextResponse.json({ success: true, connected: true, state: null, districts: [] });

    try {
        return NextResponse.json({ success: true, connected: true, state, districts: await primeDistrictsOf(client, state) });
    } catch (err) {
        if (isPrimeUnreachable(err) || err instanceof PrimeApiError) {
            return NextResponse.json({ success: false, reason: "prime_unreachable" }, { status: 502 });
        }
        throw err;
    }
}
