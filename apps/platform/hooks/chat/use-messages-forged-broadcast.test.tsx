import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Any member of a conversation can send on its realtime topic, so a
 * broadcast is only a hint: the timeline shows what the database returns for
 * that id in this conversation, never the payload itself.
 */

type Handler = (msg: { payload: unknown }) => unknown;

const H = vi.hoisted(() => ({
    handlers: {} as Record<string, Handler>,
    rows: {} as Record<string, Record<string, unknown>>,
}));

const SAVED = { id: "m1", conversation_id: "conv-1", sender_id: "u-2", body: "real text", created_at: "2026-11-11T10:00:00Z" };

vi.mock("@/lib/supabase", () => {
    const channel = {
        on(_type: string, config: { event: string }, handler: Handler) {
            H.handlers[config.event] = handler;
            return channel;
        },
        subscribe() {
            return channel;
        },
    };
    const from = () => {
        const filters: Record<string, unknown> = {};
        const chain = {
            select: () => chain,
            eq: (col: string, v: unknown) => {
                filters[col] = v;
                return chain;
            },
            order: () => chain,
            lt: () => chain,
            gt: () => chain,
            limit: async () => ({ data: [SAVED], error: null }),
            maybeSingle: async () => {
                const row = H.rows[String(filters.id)];
                return { data: row && row.conversation_id === filters.conversation_id ? row : null, error: null };
            },
            single: async () => ({ data: H.rows[String(filters.id)] ?? null, error: null }),
        };
        return chain;
    };
    return { supabase: { channel: () => channel, removeChannel: () => undefined, from } };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));

import { useMessages } from "./use-messages";
import { chatKeys } from "./use-conversations";

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useMessages("conv-1"), { wrapper });
    return { qc, hook };
}

beforeEach(() => {
    H.handlers = {};
    H.rows = { m1: SAVED };
});

describe("chat broadcasts", () => {
    it("ignores a message:new for a message that was never saved", async () => {
        const { qc } = setup();
        await waitFor(() => expect(qc.getQueryData(chatKeys.messages("conv-1"))).toHaveLength(1));
        await H.handlers["message:new"]({ payload: { id: "forged", sender_id: "u-3", body: "Pay this IBAN", created_at: "2026-11-11T11:00:00Z" } });
        expect(qc.getQueryData(chatKeys.messages("conv-1"))).toEqual([SAVED]);
    });

    it("ignores a message:new pointing at a message from another conversation", async () => {
        H.rows.other = { id: "other", conversation_id: "conv-9", sender_id: "u-3", body: "x", created_at: "2026-11-11T11:00:00Z" };
        const { qc } = setup();
        await waitFor(() => expect(qc.getQueryData(chatKeys.messages("conv-1"))).toHaveLength(1));
        await H.handlers["message:new"]({ payload: { id: "other", sender_id: "u-3" } });
        expect(qc.getQueryData(chatKeys.messages("conv-1"))).toEqual([SAVED]);
    });

    it("shows the saved text on message:update, not the payload's", async () => {
        const { qc } = setup();
        await waitFor(() => expect(qc.getQueryData(chatKeys.messages("conv-1"))).toHaveLength(1));
        await H.handlers["message:update"]({ payload: { id: "m1", body: "forged edit" } });
        expect(qc.getQueryData<Array<{ body: string }>>(chatKeys.messages("conv-1"))?.[0].body).toBe("real text");
    });
});
