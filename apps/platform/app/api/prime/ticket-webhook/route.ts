import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getPrimeClient, primeConfigFromEnv } from "@/lib/prime/client";
import { handlePrimeTicketMessage, type PrimeTicketReplyOutcome } from "@/lib/prime/ticket-reply";
import { isPrimeWebhookCall, parsePrimeTicketBody, PRIME_WEBHOOK_HEADER, primeWebhookSecret } from "@/lib/prime/webhook";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/prime/ticket-webhook: Prime says a message was written in a
 * ticket (TICKET_NEW_CHAT_MESSAGE). Only Prime holds the header secret
 * (lib/prime/webhook). The chat is read back from Prime and a reply from its
 * support becomes a notice for the store (lib/prime/ticket-reply). A failure
 * answers 500 so Prime tries again; the tickets tab still refreshes on its own.
 */
async function handlePost(request: NextRequest) {
    const config = primeConfigFromEnv();
    const client = getPrimeClient();
    if (!config || !client) return NextResponse.json({ success: false, error: "Prime is not configured" }, { status: 503 });
    if (!isPrimeWebhookCall(request.headers.get(PRIME_WEBHOOK_HEADER), primeWebhookSecret(config))) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: "bad body" }, { status: 400 });
    }
    const events = parsePrimeTicketBody(body);
    if (!events) return NextResponse.json({ success: false, error: "bad body" }, { status: 400 });

    const db = createSupabaseServiceClient();
    try {
        const outcomes: PrimeTicketReplyOutcome[] = [];
        for (const event of events) outcomes.push(await handlePrimeTicketMessage(db, client, event));
        return NextResponse.json({ success: true, noticed: outcomes.filter((o) => o === "noticed").length });
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-ticket-webhook" } });
        return NextResponse.json({ success: false, error: "failed" }, { status: 500 });
    }
}

export const POST = withFailureReport("webhook-prime-ticket", handlePost);
