import { describe, expect, it, vi } from "vitest";
import type { PrimeTicketChat } from "./client";
import { handlePrimeTicketMessage, replyInChat } from "./ticket-reply";

type Row = Record<string, unknown>;

const msg = (over: Partial<PrimeTicketChat["messages"][number]>): PrimeTicketChat["messages"][number] => ({
    messageId: 1,
    message: "مرحبا",
    createdAt: "2026-11-04 8:00:00 PM",
    senderName: "Prime",
    fromSupport: true,
    type: "TEXT",
    mediaUrl: null,
    ...over,
});
const chat = (messages: PrimeTicketChat["messages"], caseId = 52402395): PrimeTicketChat => ({ ticketId: 901, chatId: 1, caseId, status: "OPN", messages });

describe("replyInChat", () => {
    it("finds Prime's message with the call's text", () => {
        const c = chat([msg({ messageId: 1, message: "first" }), msg({ messageId: 2, message: "الزبون لا يرد" }), msg({ messageId: 3, message: "ours", fromSupport: false })]);
        expect(replyInChat(c, { message: "الزبون لا يرد" })?.messageId).toBe(2);
    });

    it("drops a message our side wrote", () => {
        const c = chat([msg({ messageId: 1, message: "answer" }), msg({ messageId: 2, message: "شكرا", fromSupport: false })]);
        expect(replyInChat(c, { message: "شكرا" })).toBeNull();
    });

    it("falls back to Prime's newest message when the call has no text (a picture)", () => {
        const c = chat([msg({ messageId: 1 }), msg({ messageId: 4, message: null, type: "MEDIA" })]);
        expect(replyInChat(c, { message: null })?.messageId).toBe(4);
        expect(replyInChat(chat([msg({ fromSupport: false })]), { message: null })).toBeNull();
    });
});

/**
 * Answers the shipment and link reads; records inserts. `existing` makes the
 * notice insert fail the way the unique index on (tenant_id, group_key) does.
 */
function fakeDb({ shipments, active, existing = false }: { shipments: Row[]; active: string[]; existing?: boolean }) {
    const inserted: Row[] = [];
    const from = (table: string) => {
        const result = () => {
            if (table === "prime_shipments") return { data: shipments, error: null };
            if (table === "prime_connections") return { data: active.map((tenant_id) => ({ tenant_id })), error: null };
            return { data: [], error: null };
        };
        const builder = {
            select: () => builder,
            eq: () => builder,
            in: () => builder,
            limit: () => builder,
            insert: (rows: Row[]) => {
                if (existing) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
                inserted.push(...rows);
                return Promise.resolve({ error: null });
            },
            then: (resolve: (r: unknown) => void) => resolve(result()),
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof handlePrimeTicketMessage>[0], inserted };
}

const shipment = { tenant_id: "t1", orders: { id: "o1", order_id: "1261103001", customer_name: "حيدر", city: "الكوت" } };
const event = { ticketId: 901, caseId: 52402395, messageType: "TEXT", message: "الزبون لا يرد", createdAt: null };

describe("handlePrimeTicketMessage", () => {
    it("tells the store when Prime replies on its parcel", async () => {
        const { db, inserted } = fakeDb({ shipments: [shipment], active: ["t1"] });
        const client = { ticketChat: vi.fn().mockResolvedValue(chat([msg({ messageId: 7, message: "الزبون لا يرد" })])) };
        expect(await handlePrimeTicketMessage(db, client, event)).toBe("noticed");
        expect(client.ticketChat).toHaveBeenCalledWith(901);
        expect(inserted).toEqual([
            expect.objectContaining({
                tenant_id: "t1",
                type: "prime.ticket_reply",
                entity_id: "o1",
                entity_label: "#1261103001",
                payload: { customer: "حيدر", ticket: 901, preview: "الزبون لا يرد" },
                group_key: "prime.ticket_reply:901:7",
            }),
        ]);
    });

    it("announces a message once, even when Prime calls again", async () => {
        const { db, inserted } = fakeDb({ shipments: [shipment], active: ["t1"], existing: true });
        const client = { ticketChat: vi.fn().mockResolvedValue(chat([msg({ messageId: 7, message: "الزبون لا يرد" })])) };
        expect(await handlePrimeTicketMessage(db, client, event)).toBe("already_noticed");
        expect(inserted).toEqual([]);
    });

    it("asks Prime nothing for a parcel that is not ours or a store with the link off", async () => {
        const client = { ticketChat: vi.fn() };
        expect(await handlePrimeTicketMessage(fakeDb({ shipments: [], active: [] }).db, client, event)).toBe("not_ours");
        expect(await handlePrimeTicketMessage(fakeDb({ shipments: [shipment], active: [] }).db, client, event)).toBe("not_ours");
        expect(client.ticketChat).not.toHaveBeenCalled();
    });

    it("drops a call whose ticket is on another parcel, and our own messages", async () => {
        const other = fakeDb({ shipments: [shipment], active: ["t1"] });
        expect(await handlePrimeTicketMessage(other.db, { ticketChat: vi.fn().mockResolvedValue(chat([msg({})], 1)) }, event)).toBe("not_ours");
        const own = fakeDb({ shipments: [shipment], active: ["t1"] });
        const ownChat = chat([msg({ messageId: 8, message: "الزبون لا يرد", fromSupport: false })]);
        expect(await handlePrimeTicketMessage(own.db, { ticketChat: vi.fn().mockResolvedValue(ownChat) }, event)).toBe("own_message");
        expect([...other.inserted, ...own.inserted]).toEqual([]);
    });
});
