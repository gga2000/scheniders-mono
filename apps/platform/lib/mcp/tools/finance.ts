import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError, actorName, canSeeMoney, registerTool, requireWriter } from "@/lib/mcp/tool";
import { baghdadDayEnd, baghdadDayStart, baghdadToday, iqd } from "@/lib/mcp/format";
import { summarizeProfit, type CostedProduct, type CostedVariant, type ProfitOrder } from "@/lib/finance/profit";
import { EXPENSE_CATEGORIES } from "@/types/expense";
import type { Order } from "@/types/order";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const categorySchema = z.enum(EXPENSE_CATEGORIES);
const PAGE = 1000;
const MAX_REPORT_DAYS = 366;
/** Expense rows listed at most; a month holds a few dozen. */
const MAX_EXPENSES = 100;
/** Cities shown in the delivery report. */
const TOP_CITIES = 15;

const MONEY_ONLY = "Finance figures and expenses are for store admins only.";

function requireMoney(caller: McpCaller): void {
    if (!canSeeMoney(caller)) throw new McpToolError(MONEY_ONLY);
}

function range(from: string | undefined, to: string | undefined): { from: string; to: string; start: string; end: string } {
    const first = from ?? baghdadToday().slice(0, 8) + "01";
    const last = to ?? baghdadToday();
    const start = baghdadDayStart(first);
    const end = baghdadDayEnd(last);
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    if (days <= 0) throw new McpToolError("`to` must be on or after `from`.");
    if (days > MAX_REPORT_DAYS) throw new McpToolError(`Use a range of at most ${MAX_REPORT_DAYS} days.`);
    return { from: first, to: last, start, end };
}

/**
 * PostgREST `or` filter for "the first non-null of these timestamp columns is
 * inside [start, end)": the SQL COALESCE(a, b, c) the products page sorts
 * sales by, written as one branch per column.
 */
export function firstNonNullWithin(columns: readonly string[], start: string, end: string): string {
    return columns
        .map((col, i) => {
            const empty = columns.slice(0, i).map((c) => `${c}.is.null`);
            return `and(${[...empty, `${col}.gte.${start}`, `${col}.lt.${end}`].join(",")})`;
        })
        .join(",");
}

/** A sale counts the day it was delivered; old rows without that stamp fall back to completed, then created. */
const SOLD_AT = ["delivered_at", "completed_at", "created_at"] as const;
/** A refund counts the day the money went back. */
const REFUNDED_AT = ["refunded_at", "delivered_at", "completed_at", "created_at"] as const;

type Paged = { data: unknown[] | null; error: { message: string } | null };

async function readAll<T>(page: (from: number, to: number) => PromiseLike<Paged>): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await page(offset, offset + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as T[]));
        if (!data || data.length < PAGE) break;
    }
    return rows;
}

type ProductRow = { id: string; name: string; sku: string | null };
type CostRow = { product_id: string; variant_id: string | null; cost: number | null };

type ExpenseRow = {
    id: string;
    expense_date: string;
    category: string;
    amount: number;
    description: string | null;
    notes: string | null;
};

const expenseLine = (e: ExpenseRow) =>
    `${e.expense_date} | ${e.category} | ${iqd(e.amount)}${e.description ? ` | ${e.description}` : ""}${e.notes ? ` | note: ${e.notes}` : ""} (id ${e.id})`;

const pct = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(1)}%`);

export function registerFinanceTools(server: McpServer): void {
    registerTool(server, {
        name: "profit_report",
        title: "Profit report",
        kind: "read",
        description:
            "Profit for a period (default: this month so far), computed like the products page: a sale counts on the day it was delivered, " +
            "a refund on the day the money went back; test, deleted and archived orders are left out. Revenue is delivered orders' price (delivery fees excluded), minus product cost " +
            "(units × the product's or variant's cost price), minus refunds, minus expenses. Lists products with no cost price, whose " +
            "profit is overstated. Courier charges are only included if they were entered as expenses. Admins only.",
        input: z.object({ from: daySchema.optional(), to: daySchema.optional(), top_products: z.number().int().min(1).max(30).default(10) }),
        async run(caller, input) {
            requireMoney(caller);
            const period = range(input.from, input.to);

            const [sales, refunds, productRows, costRows, expenses] = await Promise.all([
                readAll<ProfitOrder>((a, b) =>
                    caller.db
                        .from("orders")
                        .select("status, is_return, price, items")
                        .eq("tenant_id", caller.tenantId)
                        .is("deleted_at", null)
                        .eq("is_test", false)
                        .eq("is_archived", false)
                        .eq("is_return", false)
                        .in("status", ["delivered", "completed"])
                        .or(firstNonNullWithin(SOLD_AT, period.start, period.end))
                        .order("id")
                        .range(a, b),
                ),
                readAll<ProfitOrder>((a, b) =>
                    caller.db
                        .from("orders")
                        .select("status, is_return, price, items")
                        .eq("tenant_id", caller.tenantId)
                        .is("deleted_at", null)
                        .eq("is_test", false)
                        .eq("is_archived", false)
                        .eq("status", "refund_delivered")
                        .or(firstNonNullWithin(REFUNDED_AT, period.start, period.end))
                        .order("id")
                        .range(a, b),
                ),
                readAll<ProductRow>((a, b) =>
                    caller.db.from("products").select("id, name, sku").eq("tenant_id", caller.tenantId).order("id").range(a, b),
                ),
                // Cost is not in the member column grant; product_costs() hands it to admins. Read-only, so GET keeps it on the guard's read path.
                caller.db.rpc("product_costs", { p_tenant_id: caller.tenantId }, { get: true }).then(({ data, error }) => {
                    if (error) throw error;
                    return (data ?? []) as CostRow[];
                }),
                readAll<{ category: string; amount: number }>((a, b) =>
                    caller.db
                        .from("expenses")
                        .select("category, amount")
                        .eq("tenant_id", caller.tenantId)
                        .gte("expense_date", period.from)
                        .lte("expense_date", period.to)
                        .order("id")
                        .range(a, b),
                ),
            ]);

            const productCosts = new Map(costRows.filter((c) => c.variant_id === null).map((c) => [c.product_id, c.cost]));
            const products: CostedProduct[] = productRows.map((p) => ({ ...p, cost: productCosts.get(p.id) ?? null }));
            const variants: CostedVariant[] = costRows
                .filter((c) => c.variant_id !== null)
                .map((c) => ({ id: c.variant_id as string, product_id: c.product_id, cost: c.cost }));

            const s = summarizeProfit([...sales, ...refunds], products, variants, expenses);
            const lines = [
                `Profit ${period.from} to ${period.to} (Baghdad days):`,
                `  Revenue (${s.orders} delivered orders, ${s.units} units): ${iqd(s.revenue)}`,
                `  Product cost: −${iqd(s.productCost)}`,
                `  Gross profit: ${iqd(s.grossProfit)}`,
                `  Refunds (${s.refundCount} paid back): −${iqd(s.refunds)}`,
                `  Expenses: −${iqd(s.expenses)}` +
                    (s.expensesByCategory.length > 0 ? ` (${s.expensesByCategory.map((e) => `${e.category} ${iqd(e.amount)}`).join(", ")})` : ""),
                `  Net profit: ${iqd(s.netProfit)} (${pct(s.marginPct)} of revenue)`,
            ];
            if (s.missingCost.length > 0) {
                const units = s.missingCost.reduce((sum, p) => sum + p.units, 0);
                lines.push(
                    "",
                    `⚠ ${s.missingCost.length} sold product(s) have no cost price (${units} units counted as free, so profit is overstated): ` +
                        s.missingCost.slice(0, 10).map((p) => `${p.name} ×${p.units}`).join(", ") +
                        (s.missingCost.length > 10 ? ", …" : "") +
                        ". Set their cost in the app.",
                );
            }
            if (s.products.length > 0) {
                lines.push("", `Top ${Math.min(input.top_products, s.products.length)} products by revenue:`);
                for (const p of s.products.slice(0, input.top_products)) {
                    lines.push(`  ${p.name}: ${p.units} units, ${iqd(p.revenue)}, ${p.profit === null ? "profit unknown (no cost)" : `profit ${iqd(p.profit)}`}`);
                }
            }
            return lines.join("\n");
        },
    });

    registerTool(server, {
        name: "delivery_report",
        title: "Delivery results",
        kind: "read",
        description:
            "How orders created in a period ended: delivered or completed, rejected, still open, plus the delivery rate " +
            "(delivered ÷ delivered + rejected) overall and for the biggest cities. Default: the last 30 days.",
        input: z.object({ from: daySchema.optional(), to: daySchema.optional() }),
        async run(caller, input) {
            const today = baghdadToday();
            const period = range(input.from ?? daysBefore(today, 30), input.to ?? today);
            type Row = Pick<Order, "status" | "is_return" | "city" | "governorate_code">;
            const rows = await readAll<Row>((a, b) =>
                caller.db
                    .from("orders")
                    .select("status, is_return, city, governorate_code")
                    .eq("tenant_id", caller.tenantId)
                    .is("deleted_at", null)
                    .eq("is_test", false)
                    .eq("is_return", false)
                    .gte("created_at", period.start)
                    .lt("created_at", period.end)
                    .order("id")
                    .range(a, b),
            );

            const DONE = new Set(["delivered", "completed"]);
            const FAILED = new Set(["rejected"]);
            const IGNORED = new Set(["cancelled", "pending_checkout"]);
            const bucket = () => ({ total: 0, delivered: 0, rejected: 0, open: 0 });
            const all = bucket();
            const cities = new Map<string, ReturnType<typeof bucket>>();
            for (const r of rows) {
                if (IGNORED.has(r.status)) continue;
                const city = r.city?.trim() || r.governorate_code || "Unknown";
                const c = cities.get(city) ?? bucket();
                for (const b of [all, c]) {
                    b.total += 1;
                    if (DONE.has(r.status)) b.delivered += 1;
                    else if (FAILED.has(r.status)) b.rejected += 1;
                    else b.open += 1;
                }
                cities.set(city, c);
            }
            const rate = (b: ReturnType<typeof bucket>) => (b.delivered + b.rejected > 0 ? `${((b.delivered / (b.delivered + b.rejected)) * 100).toFixed(0)}%` : "n/a");
            const lines = [
                `Orders created ${period.from} to ${period.to} (cancelled and abandoned carts left out): ${all.total}`,
                `  delivered/completed ${all.delivered}, rejected ${all.rejected}, still open ${all.open}. Delivery rate ${rate(all)}.`,
            ];
            const top = [...cities.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, TOP_CITIES);
            if (top.length > 0) {
                lines.push("", `Biggest cities:`);
                for (const [city, b] of top) lines.push(`  ${city}: ${b.total} orders, delivered ${b.delivered}, rejected ${b.rejected}, open ${b.open}, rate ${rate(b)}`);
            }
            return lines.join("\n");
        },
    });

    registerTool(server, {
        name: "list_expenses",
        title: "List expenses",
        kind: "read",
        description: `Expenses dated within a period (default: this month so far), newest first, with their ids and totals by category. At most ${MAX_EXPENSES} rows are listed. Admins only.`,
        input: z.object({ from: daySchema.optional(), to: daySchema.optional(), category: categorySchema.optional() }),
        async run(caller, input) {
            requireMoney(caller);
            const period = range(input.from, input.to);
            const rows = await readAll<ExpenseRow>((a, b) => {
                // Built per page: a PostgREST builder keeps every filter it is given.
                const q = caller.db
                    .from("expenses")
                    .select("id, expense_date, category, amount, description, notes")
                    .eq("tenant_id", caller.tenantId)
                    .gte("expense_date", period.from)
                    .lte("expense_date", period.to);
                return (input.category ? q.eq("category", input.category) : q).order("expense_date", { ascending: false }).order("id").range(a, b);
            });
            if (rows.length === 0) return `No expenses ${period.from} to ${period.to}${input.category ? ` in ${input.category}` : ""}.`;

            const byCategory = new Map<string, number>();
            for (const e of rows) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
            const total = rows.reduce((sum, e) => sum + Number(e.amount), 0);
            return [
                `${rows.length} expense(s) ${period.from} to ${period.to}, total ${iqd(total)}: ` +
                    [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${iqd(n)}`).join(", "),
                ...rows.slice(0, MAX_EXPENSES).map((e) => `  ${expenseLine(e)}`),
                ...(rows.length > MAX_EXPENSES ? [`  … and ${rows.length - MAX_EXPENSES} more; narrow the dates.`] : []),
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "add_expense",
        title: "Add an expense",
        kind: "write",
        description:
            "Record an expense (a courier bill, ad spend, packaging…) for a day. Always returns a preview first; call again with confirm: true to save. " +
            "Courier bills belong in the `shipping` category. Claude cannot delete an expense; edit with update_expense or remove it in the app. Admins only.",
        input: z.object({
            date: daySchema.optional().describe("Defaults to today (Baghdad)"),
            category: categorySchema,
            amount: z.number().int().min(1).max(1_000_000_000),
            description: z.string().trim().min(1).max(200),
            notes: z.string().trim().max(500).optional(),
            allow_duplicate: z.boolean().default(false).describe("Only when the same bill really was paid twice"),
            confirm: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            requireMoney(caller);
            const date = input.date ?? baghdadToday();
            const summary = `${date} | ${input.category} | ${iqd(input.amount)} | ${input.description}${input.notes ? ` | note: ${input.notes}` : ""}`;

            // A repeated call (or a retry after a lost reply) must not book the same bill twice.
            const { data: same, error: sameError } = await caller.db
                .from("expenses")
                .select("id")
                .eq("tenant_id", caller.tenantId)
                .eq("expense_date", date)
                .eq("category", input.category)
                .eq("amount", input.amount)
                .eq("description", input.description)
                .limit(1);
            if (sameError) throw sameError;
            const duplicate = same && same.length > 0 ? (same[0] as { id: string }).id : null;
            if (duplicate && !input.allow_duplicate) {
                return `An identical expense is already recorded (id ${duplicate}): ${summary}\nNothing saved. If this really is a second payment, call again with allow_duplicate: true.`;
            }
            if (!input.confirm) return `Preview — nothing saved yet. New expense:\n  ${summary}\nCall again with confirm: true to save it.`;

            const { data, error } = await caller.db
                .from("expenses")
                .insert({
                    tenant_id: caller.tenantId,
                    expense_date: date,
                    category: input.category,
                    amount: input.amount,
                    description: input.description,
                    notes: [input.notes, actorName(caller)].filter(Boolean).join(" — "),
                })
                .select("id")
                .single();
            if (error) throw error;
            return `Saved expense:\n  ${summary} (id ${(data as { id: string }).id})`;
        },
    });

    registerTool(server, {
        name: "update_expense",
        title: "Fix an expense",
        kind: "write",
        description:
            "Change an expense's date, category, amount, description or note (ids come from list_expenses). Always returns a preview " +
            "with the old and new values first; call again with confirm: true to save. Admins only.",
        input: z
            .object({
                id: z.string().uuid(),
                date: daySchema.optional(),
                category: categorySchema.optional(),
                amount: z.number().int().min(1).max(1_000_000_000).optional(),
                description: z.string().trim().min(1).max(200).optional(),
                notes: z.string().trim().max(500).optional(),
                confirm: z.boolean().default(false),
            })
            .refine((v) => v.date || v.category || v.amount !== undefined || v.description || v.notes !== undefined, "Give something to change"),
        async run(caller, input) {
            requireWriter(caller);
            requireMoney(caller);
            const { data: found, error: findError } = await caller.db
                .from("expenses")
                .select("id, expense_date, category, amount, description, notes")
                .eq("tenant_id", caller.tenantId)
                .eq("id", input.id)
                .maybeSingle();
            if (findError) throw findError;
            if (!found) throw new McpToolError(`No expense ${input.id} in this store.`);
            const before = found as ExpenseRow;

            const patch: Record<string, unknown> = {};
            const changes: string[] = [];
            const set = (key: string, label: string, from: unknown, to: unknown, show: (v: unknown) => string) => {
                if (to === undefined || (from ?? null) === (to ?? null)) return;
                patch[key] = to;
                changes.push(`  ${label}: ${show(from)} → ${show(to)}`);
            };
            const text = (v: unknown) => (v === null || v === undefined || v === "" ? "none" : String(v));
            set("expense_date", "date", before.expense_date, input.date, text);
            set("category", "category", before.category, input.category, text);
            set("amount", "amount", Number(before.amount), input.amount, (v) => iqd(Number(v)));
            set("description", "description", before.description, input.description, text);
            set("notes", "note", before.notes, input.notes === undefined ? undefined : `${input.notes} — ${actorName(caller)}`, text);
            if (changes.length === 0) return "That expense already has those values; nothing changed.";

            const header = `Expense ${expenseLine(before)}`;
            if (!input.confirm) return [`Preview — nothing changed yet. ${header}`, ...changes, "Call again with confirm: true to apply."].join("\n");

            const { data: changed, error } = await caller.db
                .from("expenses")
                .update(patch)
                .eq("tenant_id", caller.tenantId)
                .eq("id", before.id)
                .select("id");
            if (error) throw error;
            if (!changed || changed.length === 0) throw new McpToolError("Your role in this store cannot edit expenses.");
            return [`Updated ${header}`, ...changes].join("\n");
        },
    });
}

/** The calendar day `days` before `day` (YYYY-MM-DD), for the delivery report's default window. */
function daysBefore(day: string, days: number): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}
