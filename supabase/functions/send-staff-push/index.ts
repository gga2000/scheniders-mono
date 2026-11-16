// supabase/functions/send-staff-push/index.ts
//
// Web-push sender for the staff console. Three messages:
//   - "a merchant wrote to support": from the `trg_support_notify_staff`
//     trigger on `public.support_messages` (merchant messages only);
//   - "a merchant has waited past 5 minutes" (kind "late"): from
//     `public.support_alert_late()`, run every minute by pg_cron, to the
//     supervisor;
//   - the week in numbers (kind "weekly"): from
//     `public.support_weekly_report()`, Sundays 10 AM Baghdad, to super admins.
// All call with an `Authorization: Bearer <EDGE_PUSH_SECRET>` header and have
// already picked the recipients (staff with at least one device in
// `admin_push_subscriptions`); this function only builds the message, delivers
// it and drops subscriptions the browser threw away.
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
    kind: "new" | "late";
    caseId: string;
    shop: string;
    sender: string;
    preview: string;
    waitedMin: number;
    recipients: string[];
}

interface WeeklyPayload {
    kind: "weekly";
    opened: number;
    firstReplyMedianS: number | null;
    solved: number;
    ratedNo: number;
    recipients: string[];
}

type Payload = StaffPushPayload | WeeklyPayload;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

function parse(raw: unknown): Payload | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const recipients = Array.isArray(r.recipients)
        ? r.recipients.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
        : [];
    if (r.kind === "weekly") {
        return {
            kind: "weekly",
            opened: count(r.opened),
            firstReplyMedianS:
                typeof r.first_reply_median_s === "number" && Number.isFinite(r.first_reply_median_s)
                    ? Math.max(0, r.first_reply_median_s)
                    : null,
            solved: count(r.solved),
            ratedNo: count(r.rated_no),
            recipients,
        };
    }
    const caseId = str(r.case_id);
    if (!UUID_RE.test(caseId)) return null;
    const waited = typeof r.waited_min === "number" && Number.isFinite(r.waited_min) ? Math.max(0, Math.floor(r.waited_min)) : 0;
    return {
        kind: r.kind === "late" ? "late" : "new",
        caseId,
        shop: str(r.shop),
        sender: str(r.sender),
        preview: str(r.preview),
        waitedMin: waited,
        recipients,
    };
}

/** "45 s", "3 min", "1 h 20 min" for the weekly first-reply time. */
function duration(seconds: number): string {
    const whole = Math.round(seconds);
    if (whole < 60) return `${whole} s`;
    const minutes = Math.round(whole / 60);
    if (minutes < 60) return `${minutes} min`;
    const rest = minutes % 60;
    return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** Staff console copy is English, like the rest of the console. */
function compose(p: Payload): string {
    if (p.kind === "weekly") {
        const reply = p.firstReplyMedianS === null ? "no replies yet" : `first reply ${duration(p.firstReplyMedianS)}`;
        return JSON.stringify({
            title: "Support this week",
            body: `${p.opened} questions · ${reply} · ${p.solved} solved · ${p.ratedNo} said not solved`,
            url: "/support?view=scoreboard",
            tag: "support-weekly",
        });
    }
    if (p.kind === "late") {
        return JSON.stringify({
            title: `No reply for ${p.waitedMin} min${p.shop ? ` · ${p.shop}` : ""}`,
            body: [p.sender, p.preview].filter(Boolean).join(": ") || "A merchant is still waiting for a reply.",
            url: `/support?case=${p.caseId}`,
            tag: `support-late:${p.caseId}`,
        });
    }
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

    let payload: Payload | null;
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
                // The weekly report waits for a phone that is off at 10 AM; alerts go stale in an hour.
                payload.kind === "weekly" ? { TTL: 12 * 60 * 60, urgency: "normal" } : { TTL: 60 * 60, urgency: "high" },
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
