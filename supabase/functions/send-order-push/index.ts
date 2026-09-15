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

type Locale = "ar" | "en";

/** Copy for the channels composed server-side, where the browser's language is
 *  not available. Keyed the same way as the in-app feed's i18n. */
const COPY = {
    en: {
        newOrder: "🛒 New order", urgentOrder: "🔥 URGENT order",
        createdBy: (r: string, w: string) => w ? `${r} created by ${w}` : `${r} created`,
        order: (r: string) => `Order ${r}`,
        statusChanged: "status changed", updatedBy: (w: string) => w ? `updated by ${w}` : "updated",
        ordersUpdated: "Orders updated",
        movedTo: (c: number, s: string) => `${c} orders moved to ${s}`,
        waiting: "⏱ Orders waiting",
        untouched: (c: number, h: number) => `${c} orders untouched for over ${h}h`,
        outOfStock: "⚠️ Out of stock", ranOut: (r: string) => `${r} has run out`,
        lowStock: "Low stock", leftOf: (r: string, n: number) => `${r} — ${n} left`,
        needRestock: (c: number) => `${c} products need restocking`,
        exportFailed: "⚠️ Shipping export failed",
        notSent: (r: string, c: number) => `${r}: ${c} orders not sent`,
        walletEmpty: "⚠️ Wallet empty", walletEmptyBody: "New orders will stop until it is topped up",
        walletLow: "Wallet running low", balance: (n: number) => `Balance ${n} IQD`,
        review: (n: number) => `New ${n}★ review`,
        cartRecovered: "Cart recovered",
        cartBody: (n: number) => `An abandoned cart came back (${n} IQD)`,
        newTeammate: "New teammate", joined: (r: string) => `${r} joined`,
        roleChanged: "Role changed", isNow: (r: string, x: string) => `${r} is now ${x}`,
        mentionedYou: (w: string) => w ? `${w} mentioned you` : "New mention",
        wereMentioned: "You were mentioned",
        summary: "Your summary", summaryBody: (n: number) => `${n} new notifications`,
        fallback: "New activity",
        open: "Open", confirm: "Confirm", review_: "Review", restock: "Restock",
        retry: "Retry", topUp: "Top up", read: "Read", reply: "Reply",
    },
    ar: {
        newOrder: "🛒 طلب جديد", urgentOrder: "🔥 طلب عاجل",
        createdBy: (r: string, w: string) => w ? `${r} أنشأه ${w}` : `تم إنشاء ${r}`,
        order: (r: string) => `الطلب ${r}`,
        statusChanged: "تغيّرت الحالة", updatedBy: (w: string) => w ? `حدّثه ${w}` : "تم التحديث",
        ordersUpdated: "تم تحديث الطلبات",
        movedTo: (c: number, s: string) => `تم نقل ${c} طلب إلى ${s}`,
        waiting: "⏱ طلبات بالانتظار",
        untouched: (c: number, h: number) => `${c} طلب دون معالجة منذ أكثر من ${h} ساعة`,
        outOfStock: "⚠️ نفد المخزون", ranOut: (r: string) => `نفد مخزون ${r}`,
        lowStock: "مخزون منخفض", leftOf: (r: string, n: number) => `${r} — بقي ${n}`,
        needRestock: (c: number) => `${c} منتج بحاجة إلى تجديد المخزون`,
        exportFailed: "⚠️ فشل تصدير الشحنات",
        notSent: (r: string, c: number) => `${r}: لم يُرسَل ${c} طلب`,
        walletEmpty: "⚠️ المحفظة فارغة", walletEmptyBody: "ستتوقف الطلبات الجديدة حتى تتم التعبئة",
        walletLow: "رصيد المحفظة منخفض", balance: (n: number) => `الرصيد ${n} د.ع`,
        review: (n: number) => `تقييم جديد ${n}★`,
        cartRecovered: "تم استرجاع سلة",
        cartBody: (n: number) => `عادت سلة متروكة (${n} د.ع)`,
        newTeammate: "عضو جديد", joined: (r: string) => `انضم ${r}`,
        roleChanged: "تغيّر الدور", isNow: (r: string, x: string) => `أصبح ${r} ${x}`,
        mentionedYou: (w: string) => w ? `أشار إليك ${w}` : "إشارة جديدة",
        wereMentioned: "تمت الإشارة إليك",
        summary: "ملخّصك", summaryBody: (n: number) => `${n} إشعار جديد`,
        fallback: "نشاط جديد",
        open: "فتح", confirm: "تأكيد", review_: "مراجعة", restock: "تجديد المخزون",
        retry: "إعادة المحاولة", topUp: "تعبئة", read: "قراءة", reply: "رد",
    },
} as const;

/** One notification -> the title/body/target/actions a person actually sees. */
function compose(n: DispatchPayload, locale: Locale = "ar"): Composed {
    const t = COPY[locale] ?? COPY.ar;
    const ref = n.entity_label ?? "";
    const who = (n.actor_name ?? "").trim();
    const p = n.payload ?? {};
    const urgent = n.priority === "urgent";
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    const str = (v: unknown) => (typeof v === "string" ? v : "");

    // Acting straight from the notification beats opening the app to act.
    const orderActions: PushAction[] = [
        { action: "open", title: t.open },
        { action: "confirm", title: t.confirm },
    ];

    switch (n.type) {
        case "order.created":
            return {
                title: urgent ? t.urgentOrder : t.newOrder,
                body: t.createdBy(ref, who),
                url: "/orders",
                actions: orderActions,
            };
        case "order.status_changed": {
            const from = str(p.old_status);
            const to = str(p.new_status);
            return {
                title: t.order(ref),
                body: from && to
                    ? `${from} → ${to}${who ? ` · ${who}` : ""}`
                    : `${t.statusChanged}${who ? ` · ${who}` : ""}`,
                url: "/orders",
                actions: [{ action: "open", title: t.open }],
            };
        }
        case "order.updated":
            return {
                title: t.order(ref),
                body: t.updatedBy(who),
                url: "/orders",
                actions: [{ action: "open", title: t.open }],
            };
        case "order.bulk_status_changed":
            return {
                title: t.ordersUpdated,
                body: t.movedTo(num(p.count), str(p.new_status)),
                url: "/orders",
                actions: [{ action: "open", title: t.open }],
            };
        case "order.sla_breached":
            return {
                title: t.waiting,
                body: t.untouched(num(p.count), num(p.hours)),
                url: "/orders",
                actions: [{ action: "open", title: t.review_ }],
            };
        case "inventory.out_of_stock":
            return {
                title: t.outOfStock,
                body: t.ranOut(ref),
                url: "/products",
                actions: [{ action: "open", title: t.restock }],
            };
        case "inventory.low_stock":
            return {
                title: t.lowStock,
                body: t.leftOf(ref, num(p.stock)),
                url: "/products",
                actions: [{ action: "open", title: t.restock }],
            };
        case "inventory.bulk_low":
            return {
                title: t.lowStock,
                body: t.needRestock(num(p.count)),
                url: "/products",
                actions: [{ action: "open", title: t.review_ }],
            };
        case "delivery.export_failed":
            return {
                title: t.exportFailed,
                body: t.notSent(ref, num(p.order_count)),
                url: "/orders",
                actions: [{ action: "open", title: t.retry }],
            };
        case "finance.wallet_empty":
            return {
                title: t.walletEmpty,
                body: t.walletEmptyBody,
                url: "/settings",
                actions: [{ action: "open", title: t.topUp }],
            };
        case "finance.wallet_low":
            return {
                title: t.walletLow,
                body: t.balance(num(p.balance)),
                url: "/settings",
                actions: [{ action: "open", title: t.topUp }],
            };
        case "customer.review_created":
            return {
                title: t.review(num(p.rating)),
                body: `${ref}${str(p.preview) ? ` — ${str(p.preview)}` : ""}`,
                url: "/store/reviews",
                actions: [{ action: "open", title: t.read }],
            };
        case "customer.cart_recovered":
            return {
                title: t.cartRecovered,
                body: t.cartBody(num(p.subtotal)),
                url: "/store/recovery",
                actions: [],
            };
        case "team.member_joined":
            return { title: t.newTeammate, body: t.joined(ref), url: "/team", actions: [] };
        case "team.role_changed":
            return {
                title: t.roleChanged,
                body: t.isNow(ref, str(p.new_role)),
                url: "/team",
                actions: [],
            };
        case "chat.mention":
        case "chat.message":
            return {
                title: t.mentionedYou(who),
                body: str(p.preview).slice(0, 140) || t.wereMentioned,
                url: "/",
                actions: [{ action: "open", title: t.reply }],
            };
        case "digest":
            return {
                title: t.summary,
                body: t.summaryBody(num(p.count)),
                url: "/",
                actions: [],
            };
        default:
            return {
                title: "Scheniders",
                body: [who, ref].filter(Boolean).join(" · ") || t.fallback,
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

    // Each recipient reads their own language. Compose once per locale rather
    // than once per subscription — there are only two, and a tenant usually
    // shares one.
    const { data: localeRows } = await sb
        .from("notification_settings")
        .select("user_id, locale")
        .in("user_id", recipients);

    const localeByUser = new Map<string, Locale>();
    for (const r of localeRows ?? []) {
        const l = (r as { user_id: string; locale: string }).locale;
        if (l === "ar" || l === "en") {
            localeByUser.set((r as { user_id: string }).user_id, l);
        }
    }

    const messageFor = new Map<Locale, string>();
    const buildMessage = (locale: Locale): string => {
        const cached = messageFor.get(locale);
        if (cached) return cached;
        const { title, body, url, actions } = compose(n, locale);
        const built = JSON.stringify({
            title,
            body,
            url,
            actions,
            // The service worker keeps an urgent notification on screen until it
            // is dismissed (requireInteraction), so it needs the priority.
            priority: n.priority ?? "normal",
            notificationId: n.notification_id ?? null,
            // Collapses repeated alerts about the same thing into one OS
            // notification instead of stacking them.
            tag: n.entity_id ? `${n.entity_type ?? "item"}:${n.entity_id}` : n.notification_id,
        });
        messageFor.set(locale, built);
        return built;
    };

    // Recorded so a channel that stops working is visible, rather than only
    // noticed when somebody reports silence.
    const deliveries: Record<string, unknown>[] = [];
    let sent = 0;
    let pruned = 0;

    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                buildMessage(localeByUser.get(s.user_id) ?? "ar"),
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
            const err = e as { statusCode?: number; body?: unknown; message?: string };
            const code = err.statusCode;
            // 404/410 mean the browser threw the subscription away.
            const dead = code === 404 || code === 410;
            if (dead) {
                await sb.from("chat_push_subscriptions").delete().eq("id", s.id);
                pruned++;
            }
            // Record WHY, not just the code. A bare "410" cannot distinguish a
            // genuinely expired subscription from a VAPID key that does not match
            // the one the browser subscribed with — the push service says so in
            // the body, and without it the next failure is another guess.
            const reason = typeof err.body === "string" && err.body.trim()
                ? err.body.trim()
                : err.message ?? "";
            deliveries.push({
                notification_id: n.notification_id ?? null,
                tenant_id: n.tenant_id ?? null,
                user_id: s.user_id,
                channel: "push",
                status: dead ? "pruned" : "failed",
                detail: `status ${code ?? "unknown"}${reason ? ` — ${reason.slice(0, 300)}` : ""}`,
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
