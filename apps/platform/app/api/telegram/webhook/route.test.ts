import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// F-087: the bot must refuse a user whose profile is deactivated
// (user_profiles.is_active = false) even while their tenant_members row is
// still 'active', both when linking (/start <code>) and before it creates an
// order. The service client is replaced by a small in-memory table fake.

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
    tables: {} as Record<string, Row[]>,
    upserts: [] as { table: string; row: Row }[],
    sent: [] as string[],
    createOrder: vi.fn(),
}));

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
    private filters: [string, unknown][] = [];
    constructor(private readonly table: string) {}
    select() {
        return this;
    }
    eq(column: string, value: unknown) {
        this.filters.push([column, value]);
        return this;
    }
    or() {
        return this;
    }
    order() {
        return this;
    }
    limit() {
        return this;
    }
    update() {
        return this;
    }
    insert(row: Row) {
        state.upserts.push({ table: this.table, row });
        return this;
    }
    upsert(row: Row) {
        state.upserts.push({ table: this.table, row });
        return this;
    }
    private rows(): Row[] {
        return (state.tables[this.table] ?? []).filter((r) =>
            this.filters.every(([c, v]) => r[c] === v),
        );
    }
    async maybeSingle() {
        return { data: this.rows()[0] ?? null, error: null };
    }
    then<T1 = { data: Row[] | null; error: null }, T2 = never>(
        onfulfilled?: ((value: { data: Row[] | null; error: null }) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
        return Promise.resolve({ data: this.rows(), error: null as null }).then(onfulfilled, onrejected);
    }
}

// The webhook fails closed without its secret (route.auth.test.ts), so these
// updates carry the registered one.
const SECRET = vi.hoisted(() => "tg-secret");
vi.mock("@/lib/env", () => ({ env: { TELEGRAM_WEBHOOK_SECRET: SECRET } }));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({ from: (table: string) => new FakeQuery(table) }),
}));

vi.mock("@/lib/telegram", () => ({
    sendMessage: async (_chatId: number, text: string) => {
        state.sent.push(text);
        return { message_id: 1 };
    },
    editMessageText: async () => ({ message_id: 1 }),
    answerCallbackQuery: async () => undefined,
    downloadFile: async () => ({ buffer: Buffer.from(""), mimeType: "image/png" }),
}));

vi.mock("@/lib/gemini-order-extractor", () => ({
    extractOrderFromImage: async () => ({}),
}));

vi.mock("@/lib/order-service", () => ({
    createOrderForTenant: state.createOrder,
}));

import { POST } from "./route";

const TENANT = "tenant-a";
const USER = "user-1";
const TG_USER = 4242;

function seed(isActive: boolean) {
    state.tables = {
        telegram_link_codes: [
            {
                code: "ABC123",
                tenant_id: TENANT,
                user_profile_id: USER,
                expires_at: new Date(Date.now() + 3_600_000).toISOString(),
                used_at: null,
            },
        ],
        tenant_members: [{ tenant_id: TENANT, user_id: USER, status: "active", role: "admin" }],
        user_profiles: [{ id: USER, is_active: isActive }],
        telegram_employee_link: [],
        telegram_pending_orders: [],
        products: [{ id: "p1", tenant_id: TENANT, name: "Perfume", price: 25000, is_archived: false }],
    };
}

function linkTelegramUser() {
    state.tables.telegram_employee_link = [
        { telegram_user_id: TG_USER, tenant_id: TENANT, user_profile_id: USER },
    ];
    state.tables.telegram_pending_orders = [
        {
            id: 7,
            telegram_user_id: TG_USER,
            chat_id: 1,
            message_id: 1,
            user_profile_id: USER,
            tenant_id: TENANT,
            extracted: { customer_name: "C", phone: "07701234567", secondary_phone: "", city: "", address: "" },
            state: "awaiting_product",
        },
    ];
}

function update(text: string) {
    return new NextRequest("http://x/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": SECRET },
        body: JSON.stringify({
            update_id: 1,
            message: { message_id: 10, from: { id: TG_USER }, chat: { id: 1 }, text },
        }),
    });
}

beforeEach(() => {
    state.upserts = [];
    state.sent = [];
    state.createOrder.mockReset();
    state.createOrder.mockResolvedValue({ success: true, data: { id: "o1", order_id: "A-1" } });
});

describe("telegram webhook: deactivated profiles (F-087)", () => {
    it("refuses to link a code whose user profile is deactivated", async () => {
        seed(false);
        const res = await POST(update("/start abc123"));
        expect(res.status).toBe(200);
        expect(state.upserts.filter((u) => u.table === "telegram_employee_link")).toEqual([]);
        expect(state.sent.at(-1)).toContain("❌");
    });

    it("links a code whose user profile is active", async () => {
        seed(true);
        await POST(update("/start abc123"));
        expect(state.upserts.filter((u) => u.table === "telegram_employee_link")).toHaveLength(1);
        expect(state.sent.at(-1)).toContain("✅");
    });

    it("refuses to create an order for a linked user whose profile is deactivated", async () => {
        seed(false);
        linkTelegramUser();
        await POST(update("1"));
        expect(state.createOrder).not.toHaveBeenCalled();
        expect(state.sent.at(-1)).toContain("🚫");
    });

    it("creates the order for a linked user whose profile is active", async () => {
        seed(true);
        linkTelegramUser();
        await POST(update("1"));
        expect(state.createOrder).toHaveBeenCalledTimes(1);
        expect(state.createOrder.mock.calls[0][1]).toBe(TENANT);
    });
});
