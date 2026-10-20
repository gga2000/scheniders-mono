import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { matchParsedRows, calculateSummary } from "@/lib/delivery-import/match-engine";
import type { ParsedDeliveryPDF } from "@/types/delivery-import";
import type { Order } from "@/types/order";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";

/**
 * POST /api/delivery-import/match
 *
 * Match parsed PDF rows against database orders.
 * Accepts JSON body with parsed PDF data.
 * Returns match results with classifications (does NOT modify any DB data).
 */
export async function POST(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const { parsedPDF } = (await request.json()) as { parsedPDF: ParsedDeliveryPDF };

        if (!parsedPDF?.rows?.length) {
            return NextResponse.json(
                { success: false, error: "No parsed PDF data provided" },
                { status: 400 }
            );
        }

        // Extract unique shipment numbers and phones to query specifically
        const shipmentSet = new Set<string>();
        const phoneSet = new Set<string>();

        for (const row of parsedPDF.rows) {
            if (row.shipmentNumber) {
                shipmentSet.add(row.shipmentNumber);
                shipmentSet.add(row.shipmentNumber.replace(/(\d{8})(\d{2})$/, "$1-$2"));
            }
            if (row.phone) {
                const digits = row.phone.replace(/\D/g, "");
                const local = digits.length >= 10 ? digits.slice(-10) : digits;
                phoneSet.add(`0${local}`);
                phoneSet.add(`964${local}`);
                phoneSet.add(`+964${local}`);
                phoneSet.add(row.phone);
            }
        }

        const snArr = Array.from(shipmentSet);
        const phArr = Array.from(phoneSet);

        const supabaseAdmin = createSupabaseServiceClient();
        
        // Fetch matched orders by ID or Phone in parallel to avoid transferring all orders
        const [idRes, phRes, returnRes] = await Promise.all([
            snArr.length > 0 
                ? supabaseAdmin.from("orders").select(ORDER_READ_COLUMNS).in("order_id", snArr).eq("tenant_id", caller.tenantId).eq("is_archived", false)
                : { data: [] as Order[], error: null },
            phArr.length > 0 
                ? supabaseAdmin.from("orders").select(ORDER_READ_COLUMNS).in("phone", phArr).eq("tenant_id", caller.tenantId).eq("is_archived", false)
                : { data: [] as Order[], error: null },
            // Fetch non-archived returns to match RTN-* prefixes safely
            supabaseAdmin.from("orders").select(ORDER_READ_COLUMNS).eq("tenant_id", caller.tenantId).eq("is_archived", false).eq("is_return", true)
        ]);

        if (idRes.error || phRes.error || returnRes.error) {
            const err = idRes.error || phRes.error || returnRes.error;
            return NextResponse.json(
                { success: false, error: `Database error: ${err?.message}` },
                { status: 500 }
            );
        }

        // Combine uniquely by ID
        const orderMap = new Map<string, Order>();
        for (const o of [...(idRes.data || []), ...(phRes.data || []), ...(returnRes.data || [])]) {
            orderMap.set(o.id, o as Order);
        }
        
        const orders = Array.from(orderMap.values());

        // Run matching engine
        const matches = matchParsedRows(parsedPDF.rows, (orders || []) as Order[]);
        const summary = calculateSummary(matches);

        // Check for duplicate import
        const { data: existingImport } = await supabaseAdmin
            .from("delivery_imports")
            .select("id, created_at, status")
            .eq("receipt_number", parsedPDF.header.receiptNumber)
            .eq("tenant_id", caller.tenantId)
            .maybeSingle();

        return NextResponse.json({
            success: true,
            data: {
                matches,
                summary,
                existingImport: existingImport || null,
            },
        });
    } catch (error) {
        console.error("Delivery import match error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to match orders",
            },
            { status: 500 }
        );
    }
}
