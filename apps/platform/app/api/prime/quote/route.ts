import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { getPrimeClient, isPrimeUnreachable, PrimeApiError } from "@/lib/prime/client";
import { loadPrimeMerchant } from "@/lib/prime/connection";
import { primeStateOf } from "@/lib/prime/district";
import { primeFeeQuote } from "@/lib/prime/desk-preview";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    city: z.string().trim().max(100).default(""),
    governorate: z.string().trim().max(10).default(""),
    districtId: z.number().int().positive().max(999_999_999).optional(),
    /** What Prime collects (IQD); 0 for a prepaid parcel. */
    amount: z.number().int().min(0).max(5_000_000),
});

/**
 * POST /api/prime/quote — Prime's fee for a parcel of this amount to this
 * governorate (and district), for the new-order form's live fee. Read only;
 * cached with the dispatch desk's look-ups. Any member.
 */
export async function POST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

    const client = getPrimeClient();
    const merchant = client ? await loadPrimeMerchant(createSupabaseServiceClient(), caller.tenantId) : null;
    if (!client || !merchant) return NextResponse.json({ success: true, connected: false });

    const { city, governorate, districtId, amount } = parsed.data;
    const state = primeStateOf({ city, governorate_code: governorate, validated_governorate_code: undefined, address_details: undefined });
    if (!state) return NextResponse.json({ success: true, connected: true, state: null, fee: null });

    try {
        const fee = await primeFeeQuote(client, merchant.merchantLoginId, state, amount, districtId);
        return NextResponse.json({ success: true, connected: true, state, fee });
    } catch (err) {
        if (isPrimeUnreachable(err) || err instanceof PrimeApiError) {
            return NextResponse.json({ success: false, reason: "prime_unreachable" }, { status: 502 });
        }
        throw err;
    }
}
