import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { fakeDb } from "@/lib/mcp/__fixtures__/fake-db";
import type { McpCaller } from "@/lib/mcp/caller";

const resolveMcpCaller = vi.fn();
vi.mock("@/lib/mcp/caller", () => ({ resolveMcpCaller: (...a: unknown[]) => resolveMcpCaller(...a) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { firstNonNullWithin, registerFinanceTools } from "./finance";

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const STORE = "tenant-a";
const OTHER = "tenant-b";
const SERUM = "11111111-1111-4111-8111-111111111111";
const EXPENSE = "33333333-3333-4333-8333-333333333333";
let env: ReturnType<typeof fakeDb>;

function tools(): Record<string, Handler> {
    const registered: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, cb: Handler) => void (registered[name] = cb) } as unknown as McpServer;
    registerFinanceTools(server);
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

const order = (id: string, tenant: string, status: string, price: number, extra: Record<string, unknown> = {}) => ({
    id, tenant_id: tenant, status, price, is_return: false, is_test: false, deleted_at: null, city: "بغداد", governorate_code: "BGD",
    items: [{ name: "Serum", quantity: 1, price, product_id: SERUM }], ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    env = fakeDb({
        orders: [
            order("o1", STORE, "delivered", 30000),
            order("o2", STORE, "completed", 30000),
            order("o3", STORE, "rejected", 30000),
            order("o4", STORE, "confirmed", 30000, { city: "البصرة" }),
            order("o5", OTHER, "delivered", 99999),
        ].map((o) => ({ is_archived: false, ...o })),
        products: [
            { id: SERUM, tenant_id: STORE, name: "Serum", sku: "SR-1" },
            { id: "foreign", tenant_id: OTHER, name: "Other", sku: null },
        ],
        expenses: [
            { id: EXPENSE, tenant_id: STORE, expense_date: "2026-10-05", category: "marketing", amount: 8000, description: "Meta ads", notes: null },
            { id: "e-other", tenant_id: OTHER, expense_date: "2026-10-05", category: "other", amount: 777, description: "x", notes: null },
        ],
        activity_logs: [],
    }, {
        // product_costs(): the store's costs, one row per product and variant.
        product_costs: (args) =>
            args.p_tenant_id === STORE ? [{ product_id: SERUM, variant_id: null, cost: 10000 }] : [{ product_id: "foreign", variant_id: null, cost: 1 }],
    });
    asCaller();
});

describe("firstNonNullWithin", () => {
    it("is COALESCE written as one branch per column", () => {
        expect(firstNonNullWithin(["a", "b"], "S", "E")).toBe("and(a.gte.S,a.lt.E),and(a.is.null,b.gte.S,b.lt.E)");
    });
});

describe("profit_report", () => {
    it("reports this store's delivered revenue, cost and expenses", async () => {
        const res = await call("profit_report", { from: "2026-10-01", to: "2026-10-31", top_products: 5 });
        expect(res.isError).toBe(false);
        expect(res.text).toContain("Revenue (2 delivered orders, 2 units): 60,000 IQD");
        expect(res.text).toContain("Product cost: −20,000 IQD");
        expect(res.text).toContain("Expenses: −8,000 IQD (marketing 8,000 IQD)");
        expect(res.text).toContain("Net profit: 32,000 IQD");
        expect(res.text).not.toContain("99,999");
    });

    it("is for admins only", async () => {
        asCaller("employee");
        const res = await call("profit_report", {});
        expect(res).toEqual({ isError: true, text: "Finance figures and expenses are for store admins only." });
    });

    it("refuses a range over a year", async () => {
        const res = await call("profit_report", { from: "2025-01-01", to: "2026-10-31" });
        expect(res.isError).toBe(true);
        expect(res.text).toContain("at most 366 days");
    });
});

describe("delivery_report", () => {
    it("counts delivered, rejected and open with the delivery rate", async () => {
        const res = await call("delivery_report", { from: "2026-10-01", to: "2026-10-31" });
        expect(res.text).toContain("4");
        expect(res.text).toContain("delivered/completed 2, rejected 1, still open 1. Delivery rate 67%.");
        expect(res.text).toContain("البصرة: 1 orders");
    });
});

describe("expenses", () => {
    it("lists only this store's expenses", async () => {
        const res = await call("list_expenses", { from: "2026-10-01", to: "2026-10-31" });
        expect(res.text).toContain("Meta ads");
        expect(res.text).toContain(EXPENSE);
        expect(res.text).not.toContain("777");
    });

    it("previews an expense, then saves it in the caller's store signed as Claude", async () => {
        const args = { date: "2026-10-30", category: "shipping", amount: 45000, description: "Prime bill week 43" };
        const preview = await call("add_expense", { ...args, confirm: false });
        expect(preview.text).toMatch(/^Preview/);
        expect(env.tables.expenses).toHaveLength(2);

        const saved = await call("add_expense", { ...args, confirm: true });
        expect(saved.text).toContain("Saved expense");
        expect(env.tables.expenses[2]).toMatchObject({
            tenant_id: STORE, expense_date: "2026-10-30", category: "shipping", amount: 45000, notes: "Ali (via Claude)",
        });
    });

    it("will not book the same bill twice unless told it is a second payment", async () => {
        const args = { date: "2026-10-05", category: "marketing", amount: 8000, description: "Meta ads", confirm: true };
        const again = await call("add_expense", args);
        expect(again.text).toContain(`An identical expense is already recorded (id ${EXPENSE})`);
        expect(env.tables.expenses).toHaveLength(2);

        await call("add_expense", { ...args, allow_duplicate: true });
        expect(env.tables.expenses).toHaveLength(3);
    });

    it("refuses staff without money access, and viewers", async () => {
        asCaller("employee");
        expect((await call("add_expense", { category: "other", amount: 1, description: "x", confirm: true })).text).toBe(
            "Finance figures and expenses are for store admins only.",
        );
        asCaller("viewer");
        expect((await call("add_expense", { category: "other", amount: 1, description: "x", confirm: true })).text).toBe(
            "Your role in this store is read-only.",
        );
        expect(env.tables.expenses).toHaveLength(2);
    });

    it("previews old → new values, applies on confirm, and never reaches another store's expense", async () => {
        const preview = await call("update_expense", { id: EXPENSE, amount: 9000, confirm: false });
        expect(preview.text).toContain("amount: 8,000 IQD → 9,000 IQD");
        expect(env.tables.expenses[0].amount).toBe(8000);

        await call("update_expense", { id: EXPENSE, amount: 9000, confirm: true });
        expect(env.tables.expenses[0].amount).toBe(9000);

        const foreign = await call("update_expense", { id: "44444444-4444-4444-8444-444444444444", amount: 1, confirm: true });
        expect(foreign.isError).toBe(true);
        expect(env.tables.expenses[1].amount).toBe(777);
    });
});
