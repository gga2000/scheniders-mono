import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { parsePrimeDeliveryPDF } from "@/lib/delivery-import/pdf-parser";

/**
 * POST /api/delivery-import/parse
 *
 * Upload and parse a Prime delivery company PDF.
 * Accepts multipart/form-data with a "file" field.
 * Returns structured ParsedDeliveryPDF data (does NOT modify any DB data).
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

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: "No file provided" },
                { status: 400 }
            );
        }

        if (!file.name.toLowerCase().endsWith(".pdf")) {
            return NextResponse.json(
                { success: false, error: "File must be a PDF" },
                { status: 400 }
            );
        }

        // Convert to buffer and parse
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const parsed = await parsePrimeDeliveryPDF(buffer);

        return NextResponse.json({
            success: true,
            data: parsed,
            filename: file.name,
        });
    } catch (error) {
        console.error("Delivery import parse error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to parse PDF",
            },
            { status: 500 }
        );
    }
}
