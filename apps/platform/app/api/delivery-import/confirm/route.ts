import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";

const MAX_ROWS = 2000;
const note = z.string().max(2000);

// The parsed receipt is stored whole as raw_data, so unknown row fields are kept.
const pdfRowSchema = z.looseObject({
    rowNumber: z.number().int(),
    shipmentNumber: z.string().optional(),
    phone: z.string().optional(),
    shipmentAmount: z.number(),
    deliveryFee: z.number().optional(),
    netToMerchant: z.number().optional(),
    status: z.string().optional(),
    itemCount: z.number().optional(),
    notes: z.string().optional(),
});

const confirmSchema = z.object({
    filename: z.string().max(255).optional(),
    parsedPDF: z.looseObject({
        header: z.looseObject({
            receiptNumber: z.string().trim().min(1).max(100),
            paymentDate: z.string().max(100).optional(),
            receivingAgent: z.string().max(200).optional(),
        }),
        rows: z.array(pdfRowSchema).max(MAX_ROWS),
        footerTotal: z.number().optional(),
    }),
    confirmedItems: z.array(z.object({
        pdfRowNumber: z.number().int(),
        orderId: z.uuid(),
        matchCategory: z.string().max(50),
        matchDetails: note,
        resolutionAction: z.enum([
            "process_with_pdf_price",
            "process_with_system_price",
            "force_deliver",
            "acknowledge_refund",
            "mark_refund_delivered",
            "mark_refund_failed",
            "skip",
        ]).optional(),
        resolutionNote: note.optional(),
    })).max(MAX_ROWS),
    skippedItems: z.array(z.object({
        pdfRowNumber: z.number().int(),
        orderId: z.uuid().nullable(),
        matchCategory: z.string().max(50),
        matchDetails: note,
    })).max(MAX_ROWS).optional(),
});

/** The order fields an import may overwrite, read before it writes them (for the undo). */
const SNAPSHOT_COLUMNS = "id, status, price, delivered_at, needs_attention, attention_reasons, delivery_note";
type OrderSnapshot = {
    id: string;
    status: string;
    price: number | null;
    delivered_at: string | null;
    needs_attention: boolean | null;
    attention_reasons: string[] | null;
    delivery_note: string | null;
};

/**
 * POST /api/delivery-import/confirm
 *
 * Confirm a delivery import: create audit records and update order statuses to "delivered".
 * Each order's current status and fields are read here, never taken from the browser, and
 * kept on its audit row so the import can be undone. A receipt already imported (and not
 * undone) is refused. Individual failures don't roll back the entire import.
 */
export async function POST(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const parsedBody = confirmSchema.safeParse(await request.json().catch(() => null));
        if (!parsedBody.success) {
            return NextResponse.json(
                { success: false, error: `Invalid import: ${parsedBody.error.issues[0]?.message ?? "bad body"}` },
                { status: 400 }
            );
        }
        const { parsedPDF, confirmedItems, skippedItems, filename } = parsedBody.data;

        const supabaseAdmin = createSupabaseServiceClient();

        // The orders as they are now, in the caller's store only.
        const orderIds = [...new Set(confirmedItems.map((i) => i.orderId))];
        const current = new Map<string, OrderSnapshot>();
        for (let i = 0; i < orderIds.length; i += 500) {
            const { data: rows, error: readError } = await supabaseAdmin
                .from("orders")
                .select(SNAPSHOT_COLUMNS)
                .eq("tenant_id", caller.tenantId)
                .in("id", orderIds.slice(i, i + 500));
            if (readError) {
                return NextResponse.json({ success: false, error: `Failed to read orders: ${readError.message}` }, { status: 500 });
            }
            for (const r of (rows ?? []) as OrderSnapshot[]) current.set(r.id, r);
        }

        // 1. Create the delivery_imports audit record
        const { data: importRecord, error: importError } = await supabaseAdmin
            .from("delivery_imports")
            .insert(
                {
                    tenant_id: caller.tenantId,
                    receipt_number: parsedPDF.header.receiptNumber,
                    payment_date: parsedPDF.header.paymentDate,
                    receiving_agent: parsedPDF.header.receivingAgent,
                    total_orders: parsedPDF.rows.length,
                    total_amount: parsedPDF.footerTotal,
                    status: "confirmed",
                    imported_by: caller.userId,
                    confirmed_by: caller.userId,
                    confirmed_at: new Date().toISOString(),
                    pdf_filename: filename,
                    raw_data: parsedPDF,
                }
            )
            .select()
            .single();

        if (importError?.code === "23505") {
            return NextResponse.json(
                { success: false, error: `Receipt ${parsedPDF.header.receiptNumber} was already imported. Undo that import first to import it again.` },
                { status: 409 }
            );
        }
        if (importError || !importRecord) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Failed to create import record: ${importError?.message || "unknown"}`,
                },
                { status: 500 }
            );
        }

        // 2. Process all confirmed items concurrently
        let processedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];
        const now = new Date().toISOString();
        // Every audit row carries the caller's tenant: delivery_import_items is
        // tenant-scoped by RLS, and rows written without it (1,201 live) are
        // invisible to the merchant who imported them (NEW-P1-13).
        const auditItemsToInsert: Array<{
            tenant_id: string;
            import_id: string;
            order_id: string | null;
            pdf_row_number: number;
            pdf_shipment_number?: string;
            pdf_phone?: string;
            pdf_amount?: number;
            pdf_delivery_fee?: number;
            pdf_net_amount?: number;
            pdf_status?: string;
            pdf_item_count?: number;
            pdf_notes?: string;
            match_category: string;
            match_details: Record<string, unknown>;
            action: string;
            previous_status: string | null;
            new_status: string | null;
            previous_values: Record<string, unknown> | null;
        }> = [];

        const updatePromises = confirmedItems.map(async (item) => {
            const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
            const resAction = item.resolutionAction;
            const before = current.get(item.orderId);
            if (!before) throw new Error("order not found in this store");
            const previousStatus = before.status;

            // An order already delivered (e.g. by the Prime link) keeps its real delivery time.
            const orderUpdate: Record<string, unknown> = previousStatus === "delivered" ? {} : { delivered_at: now };

            const deliveryNotes: string[] = [];
            const attentionReasons: string[] = [];
            let newStatus = "delivered";

            if (resAction === "mark_refund_delivered") {
                newStatus = "refund_delivered";
                orderUpdate.status = "refund_delivered";
                deliveryNotes.push(`Refund delivered via delivery import: ${pdfRow?.netToMerchant?.toLocaleString()} IQD`);
            } else if (resAction === "mark_refund_failed") {
                newStatus = "refund_failed";
                orderUpdate.status = "refund_failed";
                delete orderUpdate.delivered_at;
                deliveryNotes.push(`Refund failed via delivery import: ${pdfRow?.netToMerchant?.toLocaleString()} IQD`);
                attentionReasons.push("refund_failed");
            } else if (resAction === "acknowledge_refund") {
                newStatus = previousStatus;
                delete orderUpdate.delivered_at;
                deliveryNotes.push(`Refund acknowledged: ${pdfRow?.netToMerchant?.toLocaleString()} IQD`);
            } else if (resAction === "process_with_pdf_price" && pdfRow) {
                // The amount comes from the receipt row itself, which is stored as raw_data.
                orderUpdate.price = pdfRow.shipmentAmount;
                orderUpdate.status = "delivered";
                deliveryNotes.push(`Price updated from delivery PDF: ${pdfRow.shipmentAmount.toLocaleString()} IQD`);
                attentionReasons.push(`delivery_price_changed`);
            } else if (resAction === "force_deliver") {
                orderUpdate.status = "delivered";
                deliveryNotes.push(`Force delivered (was: ${previousStatus})`);
                attentionReasons.push(`delivery_force_delivered`);
            } else {
                orderUpdate.status = "delivered";
            }

            if (item.resolutionNote) {
                deliveryNotes.push(item.resolutionNote);
            }

            if (item.matchCategory !== "clean" && item.matchCategory !== "reorder") {
                attentionReasons.push(`delivery_${item.matchCategory}`);
                if (!deliveryNotes.length) {
                    deliveryNotes.push(item.matchDetails);
                }
            }

            if (attentionReasons.length > 0) {
                orderUpdate.needs_attention = true;
                orderUpdate.attention_reasons = attentionReasons;
            }

            if (deliveryNotes.length > 0) {
                orderUpdate.delivery_note = deliveryNotes.join(" | ");
            }

            let previousValues: Record<string, unknown> | null = null;
            if (resAction !== "acknowledge_refund") {
                // Only if nobody changed the order since it was read above.
                const { data: moved, error: updateError } = await supabaseAdmin
                    .from("orders")
                    .update(orderUpdate)
                    .eq("id", item.orderId)
                    .eq("tenant_id", caller.tenantId)
                    .eq("status", previousStatus)
                    .select("id");

                if (updateError) {
                    throw new Error(updateError.message);
                }
                if (!moved || moved.length === 0) {
                    throw new Error("order changed while importing; match the receipt again");
                }
                previousValues = Object.fromEntries(
                    Object.keys(orderUpdate).map((key) => [key, before[key as keyof OrderSnapshot] ?? null]),
                );
                // The undo matches on status; an update that left it unchanged still records it.
                previousValues.status = previousStatus;
            }

            return { item, newStatus, pdfRow, resAction, previousStatus, previousValues };
        });

        const updateResults = await Promise.allSettled(updatePromises);

        for (let i = 0; i < updateResults.length; i++) {
            const result = updateResults[i];
            const item = confirmedItems[i];

            if (result.status === "fulfilled") {
                processedCount++;
                const { newStatus, pdfRow, resAction, previousStatus, previousValues } = result.value;
                auditItemsToInsert.push({
                    tenant_id: caller.tenantId,
                    import_id: importRecord.id,
                    order_id: item.orderId,
                    pdf_row_number: item.pdfRowNumber,
                    pdf_shipment_number: pdfRow?.shipmentNumber,
                    pdf_phone: pdfRow?.phone,
                    pdf_amount: pdfRow?.shipmentAmount,
                    pdf_delivery_fee: pdfRow?.deliveryFee,
                    pdf_net_amount: pdfRow?.netToMerchant,
                    pdf_status: pdfRow?.status,
                    pdf_item_count: pdfRow?.itemCount,
                    pdf_notes: pdfRow?.notes,
                    match_category: item.matchCategory,
                    match_details: {
                        details: item.matchDetails,
                        resolutionAction: resAction,
                        resolutionNote: item.resolutionNote,
                    },
                    action: "confirmed",
                    previous_status: previousStatus,
                    new_status: newStatus,
                    previous_values: previousValues,
                });
            } else {
                failedCount++;
                const msg = result.reason instanceof Error ? result.reason.message : "Unknown error";
                errors.push(`Row #${item.pdfRowNumber}: ${msg}`);
                console.error(`[DeliveryImport] Failed to update order for row #${item.pdfRowNumber}:`, msg);

                const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
                auditItemsToInsert.push({
                    tenant_id: caller.tenantId,
                    import_id: importRecord.id,
                    order_id: item.orderId,
                    pdf_row_number: item.pdfRowNumber,
                    pdf_shipment_number: pdfRow?.shipmentNumber,
                    pdf_phone: pdfRow?.phone,
                    pdf_amount: pdfRow?.shipmentAmount,
                    pdf_delivery_fee: pdfRow?.deliveryFee,
                    pdf_net_amount: pdfRow?.netToMerchant,
                    pdf_status: pdfRow?.status,
                    pdf_item_count: pdfRow?.itemCount,
                    pdf_notes: pdfRow?.notes,
                    match_category: item.matchCategory,
                    match_details: {
                        details: item.matchDetails,
                        resolutionAction: item.resolutionAction,
                        error: msg,
                    },
                    action: "failed",
                    previous_status: current.get(item.orderId)?.status ?? null,
                    new_status: null,
                    previous_values: null,
                });
            }
        }

        // 3. Add skipped items to the audit insert array
        if (skippedItems?.length) {
            for (const item of skippedItems) {
                const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
                auditItemsToInsert.push({
                    tenant_id: caller.tenantId,
                    import_id: importRecord.id,
                    order_id: item.orderId || null,
                    pdf_row_number: item.pdfRowNumber,
                    pdf_shipment_number: pdfRow?.shipmentNumber,
                    pdf_phone: pdfRow?.phone,
                    pdf_amount: pdfRow?.shipmentAmount,
                    pdf_delivery_fee: pdfRow?.deliveryFee,
                    pdf_net_amount: pdfRow?.netToMerchant,
                    pdf_status: pdfRow?.status,
                    pdf_item_count: pdfRow?.itemCount,
                    pdf_notes: pdfRow?.notes,
                    match_category: item.matchCategory,
                    match_details: { details: item.matchDetails },
                    action: "skipped",
                    previous_status: null,
                    new_status: null,
                    previous_values: null,
                });
            }
        }

        // Insert all audit items in bulk
        if (auditItemsToInsert.length > 0) {
            for (let i = 0; i < auditItemsToInsert.length; i += 500) {
                const { error: insertError } = await supabaseAdmin
                    .from("delivery_import_items")
                    .insert(auditItemsToInsert.slice(i, i + 500));
                    
                if (insertError) {
                    // These rows are what an undo restores from: say so instead of reporting a clean import.
                    console.error("[DeliveryImport] Failed to insert audit items batch:", insertError);
                    errors.push(`Audit rows ${i + 1}-${Math.min(i + 500, auditItemsToInsert.length)} were not saved (${insertError.message}); this import cannot be fully undone.`);
                }
            }
        }

        // 4. Update import record with final counts
        const skippedCount = (skippedItems?.length || 0);
        await supabaseAdmin
            .from("delivery_imports")
            .update({
                processed_count: processedCount,
                skipped_count: skippedCount,
                failed_count: failedCount,
            })
            .eq("id", importRecord.id);

        return NextResponse.json({
            success: true,
            data: {
                importId: importRecord.id,
                processed: processedCount,
                failed: failedCount,
                skipped: skippedCount,
                errors,
            },
        });
    } catch (error) {
        console.error("Delivery import confirm error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to confirm import",
            },
            { status: 500 }
        );
    }
}
