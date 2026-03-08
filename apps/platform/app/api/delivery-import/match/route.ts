import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { matchParsedRows, calculateSummary } from "@/lib/delivery-import/match-engine";
import type { ParsedDeliveryPDF } from "@/types/delivery-import";
import type { Order } from "@/types/order";

/**
 * POST /api/delivery-import/match
 *
 * Match parsed PDF rows against database orders.
 * Accepts JSON body with parsed PDF data.
 * Returns match results with classifications (does NOT modify any DB data).
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

        const { parsedPDF } = (await request.json()) as { parsedPDF: ParsedDeliveryPDF };

        if (!parsedPDF?.rows?.length) {
            return NextResponse.json(
                { success: false, error: "No parsed PDF data provided" },
                { status: 400 }
            );
        }

        // Fetch all non-archived orders from DB for matching
        const supabaseAdmin = createSupabaseServiceClient();
        const { data: orders, error: dbError } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("is_archived", false)
            .order("created_at", { ascending: false });

        if (dbError) {
            return NextResponse.json(
                { success: false, error: `Database error: ${dbError.message}` },
                { status: 500 }
            );
        }

        // Run matching engine
        const matches = matchParsedRows(parsedPDF.rows, (orders || []) as Order[]);
        const summary = calculateSummary(matches);

        // Check for duplicate import
        const { data: existingImport } = await supabaseAdmin
            .from("delivery_imports")
            .select("id, created_at, status")
            .eq("receipt_number", parsedPDF.header.receiptNumber)
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
