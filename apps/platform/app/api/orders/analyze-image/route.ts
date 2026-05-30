import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, error: authError } = await verifyAccessToken(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const data = await extractOrderFromImage(buffer, file.type);
      return NextResponse.json({ success: true, data });
    } catch (err) {
      const message = (err as Error).message || "Failed to analyze image";
      console.error("[analyze-image] Gemini extraction failed:", err);
      return NextResponse.json(
        { error: "Failed to analyze image", details: message },
        { status: 500 }
      );
    }
  } catch (error) {
    const err = error as Error;
    console.error("[analyze-image] route error:", err.message, err.stack);
    return NextResponse.json(
      { error: "Failed to analyze image", details: err.message },
      { status: 500 }
    );
  }
}
