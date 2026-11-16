import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { SUPPORT_SHOT_BUCKET, SUPPORT_SHOT_MAX_BYTES } from "@/lib/support/schema";
import { supportUploadsFull } from "@/lib/support/upload-limit";

export const dynamic = "force-dynamic";

/** Every JPEG starts with these three bytes. */
const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * POST /api/support/shot — body: the JPEG picture of the merchant's screen.
 * Stores it under the shop's own folder in the private support bucket and
 * answers its path, which the next message carries in its context. The shop
 * comes from the session.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > SUPPORT_SHOT_MAX_BYTES) {
        return NextResponse.json({ success: false, error: "support_shot_too_big" }, { status: 413 });
    }
    if (!isJpeg(bytes)) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const db = createSupabaseServiceClient();
    if (await supportUploadsFull(db, SUPPORT_SHOT_BUCKET, caller.tenantId)) {
        return NextResponse.json({ success: false, error: "support_rate_limited" }, { status: 429 });
    }

    const path = `${caller.tenantId}/${randomUUID()}.jpg`;
    const { error } = await db.storage.from(SUPPORT_SHOT_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`Support picture upload failed: ${error.message}`);

    return NextResponse.json({ success: true, data: { path } });
}

export const POST = withFailureReport("api/support/shot POST", handlePOST);
