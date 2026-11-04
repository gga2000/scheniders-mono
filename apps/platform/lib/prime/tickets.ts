import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeTicket, PrimeTicketChat } from "@/lib/prime/client";
import { primeHistoryTime } from "@/lib/prime/track";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** A ticket as the Prime page lists it, placed on our order. */
export interface PrimeTicketEntry {
    ticketId: number;
    caseId: number;
    orderId: string;
    orderNumber: string;
    customerName: string | null;
    subject: string | null;
    open: boolean;
    latestMessage: string | null;
    /** ISO instant of the latest message, else of the ticket's creation. */
    at: string | null;
}

export interface PrimeTicketMessage {
    id: number | null;
    text: string | null;
    at: string | null;
    sender: string | null;
    fromPrime: boolean;
    mediaUrl: string | null;
}

/** Tickets kept per tenant: Prime answers the last 90 days. */
export const PRIME_TICKETS_PAGE = 50;

const iso = (value: string | null | undefined) => (value ? primeHistoryTime(value) : null);

/**
 * Prime keeps tickets per partner system, which every tenant of this app
 * shares, so a ticket is shown or answered only when its parcel is one of the
 * caller's tenant's shipments. Returns the order for each such case id.
 */
export async function tenantCases(db: ServiceDb, tenantId: string, caseIds: readonly number[]) {
    const wanted = [...new Set(caseIds.filter((id) => Number.isInteger(id) && id > 0))];
    const owned = new Map<number, { orderId: string; orderNumber: string; customerName: string | null }>();
    if (wanted.length === 0) return owned;
    const { data, error } = await db
        .from("prime_shipments")
        .select("case_id, orders!inner(id, order_id, customer_name)")
        .eq("tenant_id", tenantId)
        .in("case_id", wanted);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
        const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
        if (order) owned.set(Number(row.case_id), { orderId: order.id, orderNumber: String(order.order_id ?? ""), customerName: order.customer_name ?? null });
    }
    return owned;
}

/** The tenant's tickets, latest message first; tickets on other tenants' parcels are dropped. */
export async function placeTickets(db: ServiceDb, tenantId: string, tickets: readonly PrimeTicket[]): Promise<PrimeTicketEntry[]> {
    const owned = await tenantCases(db, tenantId, tickets.map((t) => t.caseId ?? 0));
    const entries: PrimeTicketEntry[] = [];
    for (const t of tickets) {
        const order = t.caseId ? owned.get(t.caseId) : undefined;
        if (!t.caseId || !order) continue;
        entries.push({
            ticketId: t.ticketId,
            caseId: t.caseId,
            ...order,
            subject: t.subject?.trim() || null,
            open: t.status !== "CLS",
            latestMessage: t.latestMessage?.trim() || null,
            at: iso(t.latestMessageAt) ?? iso(t.createdAt),
        });
    }
    return entries.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

export function ticketMessages(chat: PrimeTicketChat): PrimeTicketMessage[] {
    return chat.messages.map((m) => ({
        id: m.messageId ?? null,
        text: m.message?.trim() || null,
        at: iso(m.createdAt),
        sender: m.senderName?.trim() || null,
        fromPrime: m.fromSupport === true,
        // Shown as a link, so only a secure web address is kept.
        mediaUrl: m.type === "MEDIA" && m.mediaUrl && /^https:\/\//i.test(m.mediaUrl) ? m.mediaUrl : null,
    }));
}
