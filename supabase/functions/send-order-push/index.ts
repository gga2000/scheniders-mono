// supabase/functions/send-order-push/index.ts
//
// Web-push sender for NEW ORDER alerts. Invoked on an orders INSERT by a DB
// trigger (pg_net) with an `Authorization: Bearer <EDGE_PUSH_SECRET>` header.
// Fans the push out to every ACTIVE tenant member of the order's tenant who has
// a push subscription (push is opt-in per user), honours global DND, sends a
// Web Push to each, and prunes expired (404/410) subscriptions.
//
// Reuses the chat push secrets (EDGE_PUSH_SECRET / VAPID_*) and the
// chat_push_subscriptions table. Inert until VAPID is set ({skipped:"no_vapid"}).

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

interface OrderRow {
    id?: string;
    tenant_id?: string;
    customer_name?: string | null;
    sequence_number?: number | string | null;
    price?: number | string | null;
    priority?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method" }, 405);

    // Auth: only the DB trigger (with the shared secret) may invoke this.
    const authHeader = req.headers.get("authorization") ?? "";
    if (!EDGE_PUSH_SECRET || authHeader !== `Bearer ${EDGE_PUSH_SECRET}`) {
        return json({ error: "unauthorized" }, 401);
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ skipped: "no_vapid" });

    let payloadIn: { record?: OrderRow } & OrderRow;
    try {
        payloadIn = await req.json();
    } catch {
        return json({ error: "bad_body" }, 400);
    }
    // pg_net sends the row directly; a DB webhook would wrap it in { record }.
    const row: OrderRow = payloadIn.record ?? payloadIn;
    const { tenant_id, customer_name, sequence_number, price, priority } = row;
    if (!tenant_id) return json({ skipped: "no_tenant" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Recipients: active members of this tenant.
    const { data: members } = await sb
        .from("tenant_members").select("user_id").eq("tenant_id", tenant_id).eq("status", "active");
    const userIds = (members ?? []).map((m) => m.user_id as string);
    if (userIds.length === 0) return json({ sent: 0 });

    // Drop users in global Do-Not-Disturb.
    const { data: dndRows } = await sb
        .from("chat_user_status").select("user_id").eq("dnd", true).in("user_id", userIds);
    const dnd = new Set((dndRows ?? []).map((r) => r.user_id as string));
    const recipients = userIds.filter((u) => !dnd.has(u));
    if (recipients.length === 0) return json({ sent: 0, skipped: "all_dnd" });

    const { data: subs } = await sb
        .from("chat_push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", recipients);
    if (!subs || subs.length === 0) return json({ sent: 0 });

    const who = (customer_name ?? "").trim() || "A customer";
    const num = sequence_number !== null && sequence_number !== undefined ? ` #${sequence_number}` : "";
    const amount = price !== null && price !== undefined && `${price}` !== "" ? ` · IQD ${price}` : "";
    const title =
        priority === "urgent" ? "🔥 URGENT Order!" : priority === "high" ? "⚡ High Priority Order!" : "🛒 New Order!";

    const body = JSON.stringify({
        title,
        body: `${who} placed order${num}${amount}`,
        url: "/orders",
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
