// supabase/functions/send-chat-push/index.ts
//
// Web-push sender for the team chat. Invoked on a chat_notifications INSERT by a
// DB trigger (pg_net) with an `Authorization: Bearer <EDGE_PUSH_SECRET>` header.
// Reads the recipient's push subscriptions, honours mute / DND / per-kind prefs,
// sends a Web Push to each, and prunes expired (404/410) subscriptions.
//
// REQUIRED EDGE SECRETS (set via `supabase secrets set` — NOT in this repo):
//   EDGE_PUSH_SECRET           shared secret the DB trigger sends in the header
//   VAPID_PUBLIC_KEY           VAPID public key
//   VAPID_PRIVATE_KEY          VAPID private key
//   VAPID_SUBJECT              e.g. mailto:ops@yourdomain  (optional)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Until VAPID is set, the function is inert (returns {skipped:"no_vapid"}).

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

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface NotificationRow {
    recipient_id?: string;
    actor_name?: string;
    preview?: string;
    conversation_id?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method" }, 405);

    // Auth: only the DB trigger (with the shared secret) may invoke this.
    const authHeader = req.headers.get("authorization") ?? "";
    if (!EDGE_PUSH_SECRET || authHeader !== `Bearer ${EDGE_PUSH_SECRET}`) {
        return json({ error: "unauthorized" }, 401);
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ skipped: "no_vapid" });

    let payloadIn: { record?: NotificationRow } & NotificationRow;
    try {
        payloadIn = await req.json();
    } catch {
        return json({ error: "bad_body" }, 400);
    }
    // pg_net sends the row directly; a DB webhook would wrap it in { record }.
    const row: NotificationRow = payloadIn.record ?? payloadIn;
    const { recipient_id, actor_name, preview, conversation_id } = row;
    if (!recipient_id || !conversation_id) return json({ skipped: "incomplete" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // DND
    const { data: status } = await sb
        .from("chat_user_status").select("dnd").eq("user_id", recipient_id).maybeSingle();
    if (status?.dnd) return json({ skipped: "dnd" });

    // Muted this conversation
    const { data: member } = await sb
        .from("chat_members").select("muted")
        .eq("conversation_id", conversation_id).eq("user_id", recipient_id).maybeSingle();
    if (member?.muted) return json({ skipped: "muted" });

    // Per-kind notification preference (level 'none' silences). 'mentions'-level
    // refinement (push only on mentions) needs a mention flag on the row — a
    // follow-up; for now 'all' and 'mentions' both notify, 'none' does not.
    const { data: conv } = await sb
        .from("chat_conversations").select("kind, tenant_id").eq("id", conversation_id).maybeSingle();
    if (conv) {
        const { data: pref } = await sb
            .from("chat_notification_prefs").select("level")
            .eq("user_id", recipient_id).eq("tenant_id", conv.tenant_id).eq("kind", conv.kind).maybeSingle();
        if (pref?.level === "none") return json({ skipped: "pref_none" });
    }

    const { data: subs } = await sb
        .from("chat_push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", recipient_id);
    if (!subs || subs.length === 0) return json({ sent: 0 });

    const body = JSON.stringify({
        title: actor_name ?? "New message",
        body: preview ?? "",
        conversationId: conversation_id,
    });

    let sent = 0;
    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                body,
            );
            sent++;
        } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) {
                await sb.from("chat_push_subscriptions").delete().eq("id", s.id);
            }
        }
    }
    return json({ sent });
});
