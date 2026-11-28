import { NextRequest, NextResponse } from "next/server";
import { requireMeteredCaller } from "@/lib/auth/require-metered-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { voiceKind } from "@/lib/support/voice";
import { extractOrderFromVoice } from "@/lib/voice/order-from-voice";
import { VOICE_ORDER_DAILY_LIMIT, VOICE_ORDER_MAX_BYTES } from "@/lib/voice/voice-order-limits";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * «احجي الطلب» on New Order: one recording in, the order's fields out. Each
 * call is a paid Gemini listen, so it is metered per store per day and, like
 * the screenshot reader, only a member who may create orders may spend.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireMeteredCaller(request, {
        bucket: "analyze-voice",
        limit: VOICE_ORDER_DAILY_LIMIT,
        windowSeconds: DAY_SECONDS,
        permission: "orders.create",
    });
    if (!caller.ok) return caller.response;

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        // Not a multipart body: the caller's mistake, not a server failure.
        return NextResponse.json({ error: "No recording" }, { status: 400 });
    }
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json({ error: "No recording" }, { status: 400 });
    }
    if (audio.size > VOICE_ORDER_MAX_BYTES) {
        return NextResponse.json({ error: "Recording too long" }, { status: 413 });
    }

    // Trust the bytes, not the type the browser declared.
    const bytes = Buffer.from(await audio.arrayBuffer());
    const kind = voiceKind(bytes);
    if (!kind) {
        return NextResponse.json({ error: "Not a recording" }, { status: 415 });
    }

    try {
        const data = await extractOrderFromVoice(bytes, kind.contentType);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        // Log the detail; never return it. Upstream messages can carry model
        // names and key-configuration state.
        console.error("[analyze-voice] Gemini listen failed:", err);
        return NextResponse.json({ error: "Failed to read the recording" }, { status: 502 });
    }
}

export const POST = withFailureReport("api/orders/analyze-voice POST", handlePOST);
