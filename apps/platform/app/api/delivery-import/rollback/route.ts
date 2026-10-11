import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";

/**
 * POST /api/delivery-import/rollback
 *
 * Reverse a CONFIRMED delivery import: restore every order that this import
 * changed back to the state captured at confirm time (status, price, delivery
 * provenance, delivered_at, learned tracking number), then mark the import
 * "cancelled". Allowed only while the import is still "confirmed" (not yet
 * "completed"). Best-effort per order — one failure doesn't abort the rest.
 */
export async function POST(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const { importId } = (await request.json()) as { importId?: string };
        if (!importId) {
            return NextResponse.json({ success: false, error: "Missing importId" }, { status: 400 });
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // 1. Verify the import is reversible
        const { data: importRecord, error: fetchError } = await supabaseAdmin
            .from("delivery_imports")
            .select("id, status")
            .eq("id", importId)
            .eq("tenant_id", caller.tenantId)
            .single();

        if (fetchError || !importRecord) {
            return NextResponse.json({ success: false, error: "Import record not found" }, { status: 404 });
        }
        if (importRecord.status !== "confirmed") {
            return NextResponse.json(
                { success: false, error: `Import is "${importRecord.status}" — only confirmed imports can be rolled back` },
                { status: 400 }
            );
        }

        // 2. The items that actually changed an order
        const { data: items, error: itemsError } = await supabaseAdmin
            .from("delivery_import_items")
            .select("order_id, previous_status, previous_price, previous_delivered_source, previous_delivered_at, previous_delivery_order_id")
            .eq("import_id", importId)
            .eq("action", "confirmed")
            .not("order_id", "is", null);

        if (itemsError) {
            return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 });
        }

        // 3. Restore each order to its snapshot
        let restored = 0;
        let failed = 0;
        const errors: string[] = [];

        const results = await Promise.allSettled(
            (items || []).map(async (it) => {
                if (!it.order_id || !it.previous_status) return; // nothing safe to restore to
                const { error } = await supabaseAdmin
                    .from("orders")
                    .update({
                        status: it.previous_status,
                        price: it.previous_price,
                        delivered_source: it.previous_delivered_source,
                        delivered_at: it.previous_delivered_at,
                        delivery_order_id: it.previous_delivery_order_id,
                    })
                    .eq("id", it.order_id)
                    .eq("tenant_id", caller.tenantId);
                if (error) throw new Error(`${it.order_id}: ${error.message}`);
            })
        );

        for (const r of results) {
            if (r.status === "fulfilled") restored++;
            else {
                failed++;
                errors.push(r.reason instanceof Error ? r.reason.message : "Unknown error");
            }
        }

        // 4. Mark the import cancelled (rolled back)
        await supabaseAdmin
            .from("delivery_imports")
            .update({ status: "cancelled" })
            .eq("id", importId);

        return NextResponse.json({
            success: true,
            data: { importId, restored, failed, errors },
        });
    } catch (error) {
        console.error("Delivery import rollback error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to roll back import" },
            { status: 500 }
        );
    }
}
