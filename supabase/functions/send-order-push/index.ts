// supabase/functions/send-order-push/index.ts
//
// Web-push sender for ALL notification categories.
//
// Invoked by the `trg_dispatch_notification` trigger on `public.notifications`
// with an `Authorization: Bearer <EDGE_PUSH_SECRET>` header. The dispatcher has
// already resolved WHO should receive this — audience, per-category push
// preference, Do Not Disturb, quiet hours, digest mode, mutes and
// self-suppression are all decided in SQL — so this function only has to turn
// one notification into one message, deliver it, and record what happened.
//
// (It kept its original name so `chat_push_config.order_function_url` and the
// deployed URL stay valid; it is no longer order-specific.)
//
// Inert until VAPID is configured ({skipped:"no_vapid"}).

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
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

interface DispatchPayload {
    notification_id?: string;
    tenant_id?: string;
    type?: string;
    category?: string;
    actor_name?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    entity_label?: string | null;
    payload?: Record<string, unknown> | null;
    priority?: string | null;
    recipients?: string[];
}

interface PushAction {
    action: string;
    title: string;
}

interface Composed {
    title: string;
    body: string;
    url: string;
    actions: PushAction[];
}

/** One notification -> the title/body/target/actions a person actually sees. */
function compose(n: DispatchPayload): Composed {
    const ref = n.entity_label ?? "";
    const who = (n.actor_name ?? "").trim();
    const p = n.payload ?? {};
    const urgent = n.priority === "urgent";
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    const str = (v: unknown) => (typeof v === "string" ? v : "");

    // Acting straight from the notification beats opening the app to act.
    const orderActions: PushAction[] = [
        { action: "open", title: "Open" },
        { action: "confirm", title: "Confirm" },
    ];

    switch (n.type) {
        case "order.created":
            return {
                title: urgent ? "🔥 URGENT order" : "🛒 New order",
                body: who ? `${ref} created by ${who}` : `${ref} created`,
                url: "/orders",
                actions: orderActions,
            };
        case "order.status_changed": {
            const from = str(p.old_status);
            const to = str(p.new_status);
            return {
                title: `Order ${ref}`,
                body: from && to
                    ? `${from} → ${to}${who ? ` · ${who}` : ""}`
                    : `status changed${who ? ` · ${who}` : ""}`,
                url: "/orders",
                actions: [{ action: "open", title: "Open" }],
            };
        }
        case "order.updated":
            return {
                title: `Order ${ref}`,
                body: who ? `updated by ${who}` : "updated",
                url: "/orders",
                actions: [{ action: "open", title: "Open" }],
            };
        case "order.bulk_status_changed":
            return {
                title: "Orders updated",
                body: `${num(p.count)} orders moved to ${str(p.new_status)}`,
                url: "/orders",
                actions: [{ action: "open", title: "Open" }],
            };
        case "order.sla_breached":
            return {
                title: "⏱ Orders waiting",
                body: `${num(p.count)} orders untouched for over ${num(p.hours)}h`,
                url: "/orders",
                actions: [{ action: "open", title: "Review" }],
            };
        case "inventory.out_of_stock":
            return {
                title: "⚠️ Out of stock",
                body: `${ref} has run out`,
                url: "/products",
                actions: [{ action: "open", title: "Restock" }],
            };
        case "inventory.low_stock":
            return {
                title: "Low stock",
                body: `${ref} — ${num(p.stock)} left`,
                url: "/products",
                actions: [{ action: "open", title: "Restock" }],
            };
        case "inventory.bulk_low":
            return {
                title: "Low stock",
                body: `${num(p.count)} products need restocking`,
                url: "/products",
                actions: [{ action: "open", title: "Review" }],
            };
        case "delivery.export_failed":
            return {
                title: "⚠️ Shipping export failed",
                body: `${ref}: ${num(p.order_count)} orders not sent`,
                url: "/orders",
                actions: [{ action: "open", title: "Retry" }],
            };
        case "finance.wallet_empty":
            return {
                title: "⚠️ Wallet empty",
                body: "New orders will stop until it is topped up",
                url: "/settings",
                actions: [{ action: "open", title: "Top up" }],
            };
        case "finance.wallet_low":
            return {
                title: "Wallet running low",
                body: `Balance ${num(p.balance)} IQD`,
                url: "/settings",
                actions: [{ action: "open", title: "Top up" }],
            };
        case "customer.review_created":
            return {
                title: `New ${num(p.rating)}★ review`,
                body: `${ref}${str(p.preview) ? ` — ${str(p.preview)}` : ""}`,
                url: "/store/reviews",
                actions: [{ action: "open", title: "Read" }],
            };
        case "customer.cart_recovered":
            return {
                title: "Cart recovered",
                body: `An abandoned cart came back (${num(p.subtotal)} IQD)`,
                url: "/store/recovery",
                actions: [],
            };
        case "team.member_joined":
            return { title: "New teammate", body: `${ref} joined`, url: "/team", actions: [] };
        case "team.role_changed":
            return {
                title: "Role changed",
                body: `${ref} is now ${str(p.new_role)}`,
                url: "/team",
                actions: [],
            };
        case "chat.mention":
        case "chat.message":
            return {
                title: who ? `${who} mentioned you` : "New mention",
                body: str(p.preview).slice(0, 140) || "You were mentioned",
                url: "/",
                actions: [{ action: "open", title: "Reply" }],
            };
        case "digest":
            return {
                title: "Your summary",
                body: `${num(p.count)} new notifications`,
                url: "/",
                actions: [],
            };
        default:
            return {
                title: "Scheniders",
                body: [who, ref].filter(Boolean).join(" · ") || "New activity",
                url: "/",
                actions: [],
            };
    }
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method" }, 405);

    // Only the database trigger, holding the shared secret, may invoke this.
    const authHeader = req.headers.get("authorization") ?? "";
    if (!EDGE_PUSH_SECRET || authHeader !== `Bearer ${EDGE_PUSH_SECRET}`) {
        return json({ error: "unauthorized" }, 401);
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ skipped: "no_vapid" });

    let n: DispatchPayload;
    try {
        const raw = await req.json();
        n = (raw?.record ?? raw) as DispatchPayload;
    } catch {
        return json({ error: "bad_body" }, 400);
    }

    const recipients = Array.isArray(n.recipients) ? n.recipients.filter(Boolean) : [];
    if (recipients.length === 0) return json({ sent: 0, skipped: "no_recipients" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: subs } = await sb
        .from("chat_push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in("user_id", recipients);

    if (!subs || subs.length === 0) return json({ sent: 0 });

    const { title, body, url, actions } = compose(n);
    const message = JSON.stringify({
        title,
        body,
        url,
        actions,
        // The service worker keeps an urgent notification on screen until it is
        // dismissed (requireInteraction), so it needs the priority.
        priority: n.priority ?? "normal",
        notificationId: n.notification_id ?? null,
        // Collapses repeated alerts about the same thing into one OS notification
        // instead of stacking them.
        tag: n.entity_id ? `${n.entity_type ?? "item"}:${n.entity_id}` : n.notification_id,
    });

    // Recorded so a channel that stops working is visible, rather than only
    // noticed when somebody reports silence.
    const deliveries: Record<string, unknown>[] = [];
    let sent = 0;
    let pruned = 0;

    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                message,
            );
            sent++;
            deliveries.push({
                notification_id: n.notification_id ?? null,
                tenant_id: n.tenant_id ?? null,
                user_id: s.user_id,
                channel: "push",
                status: "sent",
            });
        } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            // 404/410 mean the browser threw the subscription away.
            const dead = code === 404 || code === 410;
            if (dead) {
                await sb.from("chat_push_subscriptions").delete().eq("id", s.id);
                pruned++;
            }
            deliveries.push({
                notification_id: n.notification_id ?? null,
                tenant_id: n.tenant_id ?? null,
                user_id: s.user_id,
                channel: "push",
                status: dead ? "pruned" : "failed",
                detail: `status ${code ?? "unknown"}`,
            });
        }
    }

    if (deliveries.length > 0) {
        // Telemetry must never fail the send it is describing.
        await sb.from("notification_deliveries").insert(deliveries).then(
            () => undefined,
            () => undefined,
        );
    }

    return json({ sent, pruned });
});
