import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { fetchOrders, getSavedAccessToken } from "@/lib/lightfunnels-api";
import { parseAdAttribution } from "@/lib/ad-attribution";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backfill ad attribution for LightFunnels orders created before capture existed.
 *
 * Pages LightFunnels newest-first and matches on order *name*, because that is
 * what `orders.order_id` holds for LF orders ("7402") — not their node id. Paging
 * also costs one request per 50 orders instead of one per order.
 *
 * Call repeatedly with the returned `cursor` until `hasMore` is false. Operator
 * tool: cron-authenticated, since it spends LightFunnels API quota.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const pages = Math.min(Number(url.searchParams.get("pages") ?? 5), 20);
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const token = await getSavedAccessToken(supabaseAdmin());
    if (!token) {
        return NextResponse.json({ error: "No LightFunnels access token configured" }, { status: 400 });
    }

    let nextCursor: string | undefined = cursor;
    let hasMore = true;
    let scanned = 0;
    let updated = 0;
    let withoutAttribution = 0;

    for (let page = 0; page < pages && hasMore; page++) {
        const result = await fetchOrders(token, { limit: 50, cursor: nextCursor });
        nextCursor = result.endCursor;
        hasMore = result.hasNextPage;

        for (const lfOrder of result.orders) {
            scanned++;
            const attribution = parseAdAttribution(lfOrder.utm);
            if (!attribution) {
                withoutAttribution++;
                continue;
            }

            // `name` is what we store as order_id for LightFunnels orders.
            const { error, count } = await supabaseAdmin()
                .from("orders")
                .update(
                    { attribution, ad_channel: attribution.channel },
                    { count: "exact" },
                )
                .eq("order_id", String(lfOrder.name).replace(/^#/, ""))
                .eq("source", "lightfunnels")
                // Never overwrite a channel we already resolved: re-running this
                // must be free of side effects.
                .is("ad_channel", null);

            if (error) {
                console.error(`[backfill-attribution] Update failed for ${lfOrder.name}:`, error);
                continue;
            }
            updated += count ?? 0;
        }
    }

    const { count: remaining } = await supabaseAdmin()
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("source", "lightfunnels")
        .is("ad_channel", null);

    return NextResponse.json({
        success: true,
        scanned,
        updated,
        lf_orders_without_attribution: withoutAttribution,
        remaining_unresolved: remaining ?? 0,
        hasMore,
        cursor: nextCursor ?? null,
    });
}
