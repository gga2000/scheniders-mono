import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import type { ParsedDeliveryPDF } from "@/types/delivery-import";

interface ConfirmRequest {
    parsedPDF: ParsedDeliveryPDF;
    confirmedItems: Array<{
        pdfRowNumber: number;
        orderId: string;
        matchCategory: string;
        matchDetails: string;
        previousStatus: string;
        resolutionAction?: string;
        resolutionNote?: string;
        pdfAmount?: number;
    }>;
    skippedItems: Array<{
        pdfRowNumber: number;
        orderId: string | null;
        matchCategory: string;
        matchDetails: string;
        resolutionAction?: string;
        resolutionNote?: string;
    }>;
    filename: string;
}



/**
 * POST /api/delivery-import/confirm
 *
 * Confirm a delivery import: create audit records and update order statuses to "delivered".
 * Processes in batches. Individual failures don't rollback the entire import.
 */
export async function POST(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const body = (await request.json()) as ConfirmRequest;
        const { parsedPDF, confirmedItems, skippedItems, filename } = body;

        if (!parsedPDF || !confirmedItems) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabaseAdmin = createSupabaseServiceClient();

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
        }> = [];

        const updatePromises = confirmedItems.map(async (item) => {
            const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
            const resAction = item.resolutionAction;

            const orderUpdate: Record<string, unknown> = {
                delivered_at: now,
            };

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
                newStatus = item.previousStatus;
                delete orderUpdate.delivered_at;
                deliveryNotes.push(`Refund acknowledged: ${pdfRow?.netToMerchant?.toLocaleString()} IQD`);
            } else if (resAction === "process_with_pdf_price" && item.pdfAmount != null) {
                orderUpdate.price = item.pdfAmount;
                orderUpdate.status = "delivered";
                deliveryNotes.push(`Price updated from delivery PDF: ${item.pdfAmount.toLocaleString()} IQD`);
                attentionReasons.push(`delivery_price_changed`);
            } else if (resAction === "force_deliver") {
                orderUpdate.status = "delivered";
                deliveryNotes.push(`Force delivered (was: ${item.previousStatus})`);
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

            if (resAction !== "acknowledge_refund") {
                const { error: updateError } = await supabaseAdmin
                    .from("orders")
                    .update(orderUpdate)
                    .eq("id", item.orderId)
                    .eq("tenant_id", caller.tenantId);

                if (updateError) {
                    throw new Error(updateError.message);
                }
            }

            return { item, newStatus, pdfRow, resAction };
        });

        const updateResults = await Promise.allSettled(updatePromises);

        for (let i = 0; i < updateResults.length; i++) {
            const result = updateResults[i];
            const item = confirmedItems[i];

            if (result.status === "fulfilled") {
                processedCount++;
                const { newStatus, pdfRow, resAction } = result.value;
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
                    previous_status: item.previousStatus,
                    new_status: newStatus,
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
                    previous_status: item.previousStatus,
                    new_status: null,
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
                    console.error("[DeliveryImport] Failed to insert audit items batch:", insertError);
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
