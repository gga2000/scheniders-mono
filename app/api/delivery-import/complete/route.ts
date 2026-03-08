import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/delivery-import/complete
 *
 * Mark a confirmed delivery import as "completed" — updates all delivered orders
 * from that import batch to "completed" status and records the actual amount received.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json(
                { success: false, error: "Missing Authorization header" },
                { status: 401 }
            );
        }

        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { importId, actualAmountReceived } = body;

        if (!importId) {
            return NextResponse.json(
                { success: false, error: "Missing importId" },
                { status: 400 }
            );
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // 1. Get the import record
        const { data: importRecord, error: fetchError } = await supabaseAdmin
            .from("delivery_imports")
            .select("*")
            .eq("id", importId)
            .single();

        if (fetchError || !importRecord) {
            return NextResponse.json(
                { success: false, error: "Import record not found" },
                { status: 404 }
            );
        }

        if (importRecord.status !== "confirmed") {
            return NextResponse.json(
                { success: false, error: `Import is "${importRecord.status}", not "confirmed"` },
                { status: 400 }
            );
        }

        // 2. Get all confirmed items from this import
        const { data: items, error: itemsError } = await supabaseAdmin
            .from("delivery_import_items")
            .select("order_id")
            .eq("import_id", importId)
            .eq("action", "confirmed")
            .not("order_id", "is", null);

        if (itemsError) {
            return NextResponse.json(
                { success: false, error: itemsError.message },
                { status: 500 }
            );
        }

        const orderIds = (items || [])
            .map((item) => item.order_id)
            .filter(Boolean) as string[];

        // 3. Update all delivered orders to completed
        let updatedCount = 0;
        const now = new Date().toISOString();

        if (orderIds.length > 0) {
            const { data: updated, error: updateError } = await supabaseAdmin
                .from("orders")
                .update({ status: "completed" })
                .in("id", orderIds)
                .eq("status", "delivered")
                .select("id");

            if (updateError) {
                return NextResponse.json(
                    { success: false, error: updateError.message },
                    { status: 500 }
                );
            }

            updatedCount = updated?.length || 0;
        }

        // 4. Update the import record
        await supabaseAdmin
            .from("delivery_imports")
            .update({
                status: "completed",
                actual_amount_received: actualAmountReceived ?? null,
            })
            .eq("id", importId);

        return NextResponse.json({
            success: true,
            data: {
                updatedCount,
                totalItems: orderIds.length,
                actualAmountReceived: actualAmountReceived ?? null,
            },
        });
    } catch (error) {
        console.error("Delivery import complete error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to complete import",
            },
            { status: 500 }
        );
    }
}
