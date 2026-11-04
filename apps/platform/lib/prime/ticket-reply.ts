import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeClient, PrimeTicketChat } from "@/lib/prime/client";
import { noticeTicketReply } from "@/lib/prime/notify";
import type { PrimeTicketEvent } from "@/lib/prime/webhook";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** What a ticket message call came to: not one of our parcels, a message our side wrote, announced now, or already announced. */
export type PrimeTicketReplyOutcome = "not_ours" | "own_message" | "noticed" | "already_noticed";

const PREVIEW_MAX = 160;

type ChatMessage = PrimeTicketChat["messages"][number];

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() !== "" && (a ?? "").trim() === (b ?? "").trim();

/**
 * The message the call is about, as Prime's chat has it. Prime's call does
 * not say who wrote it, so the chat is the judge: the support message with
 * the call's text, else, when the text is one our side wrote, nothing, else
 * Prime's newest support message (a picture, say, has no text to match).
 */
export function replyInChat(chat: PrimeTicketChat, event: Pick<PrimeTicketEvent, "message">): ChatMessage | null {
    const support = chat.messages.filter((m) => m.fromSupport === true);
    const matched = [...support].reverse().find((m) => same(m.message, event.message));
    if (matched) return matched;
    if (chat.messages.some((m) => m.fromSupport !== true && same(m.message, event.message))) return null;
    return support.at(-1) ?? null;
}

/**
 * Prime says a message was written in a ticket. The call is a nudge: the
 * ticket's chat is read back from Prime, and only a message from Prime's
 * support on a parcel of a store with the link on becomes a notice (the
 * feed's chime and push take it from there; the Prime page's tickets
 * refresh on it). Prime's tickets are shared by every tenant of this app,
 * so the case decides the store, and a chat whose case is not the call's is
 * dropped.
 */
export async function handlePrimeTicketMessage(db: ServiceDb, client: Pick<PrimeClient, "ticketChat">, event: PrimeTicketEvent): Promise<PrimeTicketReplyOutcome> {
    const { data: shipments, error } = await db
        .from("prime_shipments")
        .select("tenant_id, orders!inner(id, order_id, customer_name, city)")
        .eq("case_id", event.caseId);
    if (error) throw new Error(error.message);
    if (!shipments || shipments.length === 0) return "not_ours";

    const tenantIds = [...new Set(shipments.map((s) => String(s.tenant_id)))];
    const { data: links, error: linkError } = await db.from("prime_connections").select("tenant_id").eq("is_active", true).in("tenant_id", tenantIds);
    if (linkError) throw new Error(linkError.message);
    const active = new Set((links ?? []).map((l) => String(l.tenant_id)));
    const tracked = shipments.filter((s) => active.has(String(s.tenant_id)));
    if (tracked.length === 0) return "not_ours";

    const chat = await client.ticketChat(event.ticketId);
    if (chat.caseId !== event.caseId) return "not_ours";
    const reply = replyInChat(chat, event);
    if (!reply) return "own_message";

    const messageKey = reply.messageId != null ? String(reply.messageId) : (reply.createdAt ?? event.createdAt ?? "latest");
    const text = reply.message?.trim() || event.message;
    const preview = text ? text.slice(0, PREVIEW_MAX) : null;
    let noticed = false;
    for (const shipment of tracked) {
        const order = Array.isArray(shipment.orders) ? shipment.orders[0] : shipment.orders;
        if (!order) continue;
        const wrote = await noticeTicketReply(
            db,
            String(shipment.tenant_id),
            { id: String(order.id), orderNumber: String(order.order_id ?? ""), customerName: order.customer_name ?? null, city: order.city ?? null },
            { ticketId: event.ticketId, messageKey, preview },
        );
        noticed ||= wrote;
    }
    return noticed ? "noticed" : "already_noticed";
}
