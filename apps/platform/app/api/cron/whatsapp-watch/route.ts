import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";
import { whatsappAlerts, whatsappWatchSchema } from "@/lib/whatsapp-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron: watch WhatsApp across every shop, every 15 minutes (handoff B2 items
 * 7 and 10). Every shop sends from one number on one Interakt account, so:
 *   - Interakt's own balance runs out: nobody's messages go out;
 *   - many messages fail in an hour: a template or the number is in trouble;
 *   - one shop's messages mostly fail: that shop alone is paused, so it
 *     cannot get the shared number limited for everyone.
 * The database decides and pauses (whatsapp_watch); this job emails the team
 * through Sentry, one email per incident. The staff console shows the same
 * state on its WhatsApp page and in the bell.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const { data, error } = await createSupabaseServiceClient().rpc("whatsapp_watch");
    if (error) {
        console.error("[whatsapp-watch] whatsapp_watch failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const watch = whatsappWatchSchema.safeParse(data);
    if (!watch.success) {
        console.error("[whatsapp-watch] Unexpected whatsapp_watch result", watch.error.message);
        return NextResponse.json({ error: "Unexpected whatsapp_watch result" }, { status: 500 });
    }

    const alerts = whatsappAlerts(watch.data, new Date());
    for (const alert of alerts) {
        console.warn(`[whatsapp-watch] ${alert.message}`);
        Sentry.captureMessage(alert.message, {
            level: "error",
            tags: { job: "whatsapp-watch", alert: alert.kind },
            fingerprint: alert.fingerprint,
            extra: alert.extra,
        });
    }

    return NextResponse.json({
        success: true,
        hour: watch.data.hour,
        paused: watch.data.paused.map((p) => p.tenant_id),
        alerts: alerts.map((a) => a.kind),
    });
}

export const GET = withCronMonitor(CRON_MONITORS.whatsappWatch, runScheduled);
