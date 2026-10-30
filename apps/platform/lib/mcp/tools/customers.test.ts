import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { registerCustomerTools } from "./customers";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const STORE = "tenant-a";
const OTHER = "tenant-b";
let env: ReturnType<typeof fakeDb>;

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, cb: Handler) => void (registered[name] = cb) } as unknown as McpServer;
    registerCustomerTools(server);
    return registered;
}

function asCaller(role: McpCaller["role"] = "admin") {
    resolveMcpCaller.mockResolvedValue({
        ok: true,
        caller: { userId: "u1", email: null, displayName: "Ali", tenantId: STORE, role, clientId: "c", db: env.db, token: "t", appUrl: "https://app.test" },
    });
}

const call = async (name: string, args: Record<string, unknown>) => {
    const res = await tools()[name](args, {});
    return { text: res.content[0].text, isError: res.isError === true };
};

const order = (id: string, tenant: string, phone: string, status = "delivered") => ({
    id, order_id: id, tenant_id: tenant, status, phone, customer_name: "Zahraa", city: "بغداد", address_details: "Karrada",
    items: [{ name: "Serum", quantity: 1, price: 25000 }], price: 25000, delivery_fee: 5000, is_return: false, is_replacement: false,
    deleted_at: null, created_at: "2026-10-30T08:00:00Z", abandoned_cart_at: status === "pending_checkout" ? "2026-10-30T08:00:00Z" : null,
});

beforeEach(() => {
    vi.clearAllMocks();
    env = fakeDb(
        {
            orders: [
                order("1001", STORE, "+9647701234567"),
                order("1002", STORE, "07709998888", "pending_checkout"),
                order("2001", OTHER, "07705555555"),
            ],
            customer_notes: [],
            customer_tags: [{ id: "tag-vip", tenant_id: STORE, name: "VIP" }, { id: "tag-other", tenant_id: OTHER, name: "Wholesale" }],
            customer_tag_assignments: [],
            activity_logs: [],
        },
        {
            get_abandoned_cart_recovery: () =>
                ({ days: 30, recovered: 4, returned: 1, rate: 40, recovered_iqd: 120000, removed: { junk_phone: 2, junk_location: 0, already_ordered: 1, expired: 3 }, by_staff: [{ name: "Sara", recovered: 4 }] }) as never,
        },
    );
    asCaller();
});

describe("abandoned_carts", () => {
    it("lists this store's open carts with a WhatsApp link and the recovery summary", async () => {
        const res = await call("abandoned_carts", { days: 30 });
        expect(res.text).toContain("4 recovered by staff, 1 came back on their own, recovery rate 40%, 120,000 IQD recovered");
        expect(res.text).toContain("By staff: Sara 4.");
        expect(res.text).toContain("#1002");
        expect(res.text).toContain("https://wa.me/9647709998888");
        expect(res.text).not.toContain("#1001");
        expect(res.text).not.toContain("#2001");
    });

    it("hides the recovered amount from staff without money access", async () => {
        asCaller("employee");
        const res = await call("abandoned_carts", { days: 30 });
        expect(res.text).not.toContain("IQD recovered");
    });
});

describe("add_customer_note", () => {
    it("stores the note under the store and the national number, signed", async () => {
        const res = await call("add_customer_note", { phone: "0770 123 4567", note: "Prefers evening delivery" });
        expect(res.text).toBe("Note added to Zahraa (07701234567).");
        expect(env.tables.customer_notes).toEqual([
            expect.objectContaining({ tenant_id: STORE, customer_phone: "7701234567", note: "Prefers evening delivery — Ali (via Claude)" }),
        ]);
    });

    it("refuses a phone that never ordered from this store", async () => {
        const res = await call("add_customer_note", { phone: "07705555555", note: "x" });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("has ordered from this store");
        expect(env.tables.customer_notes).toHaveLength(0);
    });

    it("refuses a viewer", async () => {
        asCaller("viewer");
        const res = await call("add_customer_note", { phone: "07701234567", note: "x" });
        expect(res.text).toBe("Your role in this store is read-only.");
    });
});

describe("tag_customer", () => {
    it("applies an existing tag of this store once", async () => {
        const first = await call("tag_customer", { phone: "07701234567", tag: "vip", create_tag: false });
        expect(first.text).toBe('Tagged Zahraa (07701234567) "VIP".');
        expect(env.tables.customer_tag_assignments).toEqual([
            expect.objectContaining({ tenant_id: STORE, customer_phone: "7701234567", tag_id: "tag-vip" }),
        ]);
        const again = await call("tag_customer", { phone: "+9647701234567", tag: "VIP", create_tag: false });
        expect(again.text).toContain("already has the tag");
        expect(env.tables.customer_tag_assignments).toHaveLength(1);
    });

    it("never uses another store's tag, and creates one only when asked", async () => {
        const refused = await call("tag_customer", { phone: "07701234567", tag: "Wholesale", create_tag: false });
        expect(refused.isError).toBe(true);
        expect(refused.text).toContain("Tags: VIP.");

        await call("tag_customer", { phone: "07701234567", tag: "Wholesale", create_tag: true });
        expect(env.tables.customer_tags).toContainEqual(expect.objectContaining({ tenant_id: STORE, name: "Wholesale" }));
        expect(env.tables.customer_tag_assignments[0]).toMatchObject({ tenant_id: STORE });
        expect(env.tables.customer_tag_assignments[0].tag_id).not.toBe("tag-other");
    });
});
