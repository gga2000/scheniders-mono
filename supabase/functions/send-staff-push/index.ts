// supabase/functions/send-staff-push/index.ts
//
// Web-push sender for the staff console: "a merchant wrote to support".
//
// Invoked by the `trg_support_notify_staff` trigger on `public.support_messages`
// (merchant messages only) with an `Authorization: Bearer <EDGE_PUSH_SECRET>`
// header. The trigger has already picked the recipients (active staff with at
// least one device in `admin_push_subscriptions`); this function only builds
// the message, delivers it and drops subscriptions the browser threw away.
//
// Uses the same VAPID keys as `send-order-push`. Inert until they are set.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EDGE_PUSH_SECRET = Deno.env.get("EDGE_PUSH_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:ops@scheniders.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

interface StaffPushPayload {
    caseId: string;
    shop: string;
    sender: string;
    preview: string;
    recipients: string[];
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function parse(raw: unknown): StaffPushPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const caseId = str(r.case_id);
    if (!UUID_RE.test(caseId)) return null;
    const recipients = Array.isArray(r.recipients)
        ? r.recipients.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
        : [];
    return { caseId, shop: str(r.shop), sender: str(r.sender), preview: str(r.preview), recipients };
}

/** Staff console copy is English, like the rest of the console. */
function compose(p: StaffPushPayload): string {
    return JSON.stringify({
        title: p.shop ? `Support · ${p.shop}` : "Support · new message",
        body: [p.sender, p.preview].filter(Boolean).join(": ") || "A merchant is waiting for a reply.",
        url: `/support?case=${p.caseId}`,
        // One notification per conversation: a second message replaces the
        // first instead of stacking, and still rings (renotify in the worker).
        tag: `support:${p.caseId}`,
    });
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const authHeader = req.headers.get("authorization") ?? "";
    if (!EDGE_PUSH_SECRET || authHeader !== `Bearer ${EDGE_PUSH_SECRET}`) {
        return json({ error: "unauthorized" }, 401);
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ skipped: "no_vapid" });

    let payload: StaffPushPayload | null;
    try {
        payload = parse(await req.json());
    } catch {
        return json({ error: "bad_body" }, 400);
    }
    if (!payload) return json({ error: "bad_body" }, 400);
    if (payload.recipients.length === 0) return json({ sent: 0, skipped: "no_recipients" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: subs, error } = await sb
        .from("admin_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("admin_user_id", payload.recipients);
    if (error) return json({ error: "load_failed", detail: error.message }, 500);
    if (!subs || subs.length === 0) return json({ sent: 0 });

    const message = compose(payload);
    let sent = 0;
    let pruned = 0;
    const failures: string[] = [];
    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                message,
                { TTL: 60 * 60, urgency: "high" },
            );
            sent++;
        } catch (e) {
            const err = e as { statusCode?: number; body?: unknown; message?: string };
            // 404/410: the browser dropped this subscription; forget it.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await sb.from("admin_push_subscriptions").delete().eq("id", s.id);
                pruned++;
            } else {
                const reason = typeof err.body === "string" && err.body.trim() ? err.body.trim() : err.message ?? "";
                failures.push(`status ${err.statusCode ?? "unknown"}${reason ? ` — ${reason.slice(0, 200)}` : ""}`);
            }
        }
    }

    // pg_net keeps this response, so a channel that stops working is visible.
    return json({ sent, pruned, failed: failures.length, failures });
});
