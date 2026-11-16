import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { SUPPORT_VOICE_BUCKET, SUPPORT_VOICE_MAX_BYTES } from "@/lib/support/schema";
import { supportUploadsFull } from "@/lib/support/upload-limit";
import { voiceKind } from "@/lib/support/voice";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/voice — body: the merchant's recorded voice note (WebM,
 * MP4 or Ogg; the kind is read from the bytes). Stores it under the shop's own
 * folder in the private voice bucket and answers its path, which the next
 * message carries in its context. The shop comes from the session.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > SUPPORT_VOICE_MAX_BYTES) {
        return NextResponse.json({ success: false, error: "support_voice_too_big" }, { status: 413 });
    }
    const kind = voiceKind(bytes);
    if (!kind) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const db = createSupabaseServiceClient();
    if (await supportUploadsFull(db, SUPPORT_VOICE_BUCKET, caller.tenantId)) {
        return NextResponse.json({ success: false, error: "support_rate_limited" }, { status: 429 });
    }

    const path = `${caller.tenantId}/${randomUUID()}.${kind.ext}`;
    const { error } = await db.storage.from(SUPPORT_VOICE_BUCKET).upload(path, bytes, { contentType: kind.contentType, upsert: false });
    if (error) throw new Error(`Support voice upload failed: ${error.message}`);

    return NextResponse.json({ success: true, data: { path } });
}

export const POST = withFailureReport("api/support/voice POST", handlePOST);
