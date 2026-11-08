import { NextRequest, NextResponse } from "next/server";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";
import { validateImageUpload } from "@/lib/order-image-upload";
import { requireMeteredCaller } from "@/lib/auth/require-metered-caller";

/**
 * Per-store ceiling on image analyses. Bulk upload sends one request per image,
 * and a merchant photographing a stack of receipts is a normal burst, so the
 * window is generous enough not to interrupt real work while still bounding
 * what a single store can spend against the Gemini key.
 */
const ANALYZE_IMAGE_LIMIT = 60;
const ANALYZE_IMAGE_WINDOW_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    // Each analysis is a billed Gemini call: only an active store member may
    // spend, the store's spend is capped, and the cap fails closed.
    const caller = await requireMeteredCaller(request, {
      bucket: "analyze-image",
      limit: ANALYZE_IMAGE_LIMIT,
      windowSeconds: ANALYZE_IMAGE_WINDOW_SECONDS,
    });
    if (!caller.ok) return caller.response;

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
