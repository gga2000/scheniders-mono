import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import type { ParsedDeliveryPDF, MatchedRow } from "@/types/delivery-import";

interface ConfirmRequest {
    parsedPDF: ParsedDeliveryPDF;
    confirmedItems: Array<{
        pdfRowNumber: number;
        orderId: string;
        matchCategory: string;
        matchDetails: string;
        previousStatus: string;
    }>;
    skippedItems: Array<{
        pdfRowNumber: number;
        orderId: string | null;
        matchCategory: string;
        matchDetails: string;
    }>;
    filename: string;
}

const BATCH_SIZE = 15;

/**
 * POST /api/delivery-import/confirm
 *
 * Confirm a delivery import: create audit records and update order statuses to "delivered".
 * Processes in batches. Individual failures don't rollback the entire import.
 */
export async function POST(request: NextRequest) {
    try {
        // Auth
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
            .upsert(
                {
                    receipt_number: parsedPDF.header.receiptNumber,
                    payment_date: parsedPDF.header.paymentDate,
                    receiving_agent: parsedPDF.header.receivingAgent,
                    total_orders: parsedPDF.rows.length,
                    total_amount: parsedPDF.footerTotal,
                    status: "confirmed",
                    imported_by: user.id,
                    confirmed_by: user.id,
                    confirmed_at: new Date().toISOString(),
                    pdf_filename: filename,
                    raw_data: parsedPDF,
                },
                { onConflict: "receipt_number" }
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

        // 2. Process confirmed items in batches
        let processedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];
        const now = new Date().toISOString();

        for (let i = 0; i < confirmedItems.length; i += BATCH_SIZE) {
            const batch = confirmedItems.slice(i, i + BATCH_SIZE);

            for (const item of batch) {
                try {
                    // Update order status to delivered
                    const { error: updateError } = await supabaseAdmin
                        .from("orders")
                        .update({
                            status: "delivered",
                            delivered_at: now,
                        })
                        .eq("id", item.orderId);

                    if (updateError) {
                        throw new Error(updateError.message);
                    }

                    // Create audit item record
                    const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
                    await supabaseAdmin.from("delivery_import_items").insert({
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
                        match_details: { details: item.matchDetails },
                        action: "confirmed",
                        previous_status: item.previousStatus,
                        new_status: "delivered",
                    });

                    processedCount++;
                } catch (err) {
                    failedCount++;
                    const msg = err instanceof Error ? err.message : "Unknown error";
                    errors.push(`Row #${item.pdfRowNumber}: ${msg}`);
                    console.error(`[DeliveryImport] Failed to update order for row #${item.pdfRowNumber}:`, msg);

                    // Still create audit item but mark as failed
                    const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
                    await supabaseAdmin
                        .from("delivery_import_items")
                        .insert({
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
                            match_details: { details: item.matchDetails, error: msg },
                            action: "failed",
                            previous_status: item.previousStatus,
                            new_status: null,
                        })
                        .catch(() => {}); // Best effort
                }
            }
        }

        // 3. Create audit records for skipped items
        if (skippedItems?.length) {
            const skippedRecords = skippedItems.map((item) => {
                const pdfRow = parsedPDF.rows.find((r) => r.rowNumber === item.pdfRowNumber);
                return {
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
                    action: "skipped" as const,
                    previous_status: null,
                    new_status: null,
                };
            });

            await supabaseAdmin
                .from("delivery_import_items")
                .insert(skippedRecords)
                .catch((err) => {
                    console.error("[DeliveryImport] Failed to insert skipped items:", err);
                });
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
