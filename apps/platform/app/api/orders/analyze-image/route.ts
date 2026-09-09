import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase-server";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";
import { validateImageUpload } from "@/lib/order-image-upload";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { reportOrderError } from "@/lib/order-telemetry";

/**
 * Per-user ceiling on image analyses. Bulk upload sends one request per image,
 * and a merchant photographing a stack of receipts is a normal burst, so the
 * window is generous enough not to interrupt real work while still bounding
 * what a single account can spend against the Gemini key.
 */
const ANALYZE_IMAGE_LIMIT = 60;
const ANALYZE_IMAGE_WINDOW_SECONDS = 60;

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

    // Each analysis is a billed Gemini call, so cap how fast one account can
    // spend. Postgres backs the counter, so the limit holds across instances.
    const limit = await consumeRateLimit(
      `analyze-image:${user.id}`,
      ANALYZE_IMAGE_LIMIT,
      ANALYZE_IMAGE_WINDOW_SECONDS,
    );
    if (limit.error) {
      // Fails open rather than taking the feature down, but never silently.
      reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), {
        operation: "orders-analyze-image-rate-limit",
      });
    }
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Too many image analyses. Try again in ${limit.retryAfterSeconds}s.`,
        },
        { status: 429, headers: rateLimitHeaders(limit, ANALYZE_IMAGE_LIMIT) },
      );
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
