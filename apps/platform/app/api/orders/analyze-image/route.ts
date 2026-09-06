import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";
import { validateImageUpload } from "@/lib/order-image-upload";

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
    // Validate before reading the body into memory or forwarding it: the upload
    // is base64-encoded and billed to the Gemini account, and the declared MIME
    // type is client-supplied. A wrong field type used to reach `file.type` as
    // an unchecked cast and fail deeper as a 500.
    const image = formData.get("image");
    const validation = validateImageUpload(image);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    // Narrow for `arrayBuffer()` without casting. validateImageUpload has
    // already checked size and type; this satisfies the compiler honestly.
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());

    try {
      // Forward the normalized type, never the raw client header.
      const data = await extractOrderFromImage(buffer, validation.mimeType);
      return NextResponse.json({ success: true, data });
    } catch (err) {
      // Log the detail; do not return it. The upstream message can carry model
      // names and key-configuration state, which the browser has no use for.
      console.error("[analyze-image] Gemini extraction failed:", err);
      return NextResponse.json({ error: "Failed to analyze image" }, { status: 502 });
    }
  } catch (error) {
    const err = error as Error;
    console.error("[analyze-image] route error:", err.message, err.stack);
    return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}
