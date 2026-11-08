"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { PaymentLine, TillProduct } from "@/lib/till/cart";

const tillKeys = {
    products: (tenantId: string | null) => ["till", "products", tenantId] as const,
    store: (tenantId: string | null) => ["till", "store", tenantId] as const,
};

type ProductRow = {
    id: string;
    name: string;
    display_name: string | null;
    price: number | string | null;
    image_url: string | null;
    tag_color: string | null;
    barcode: string | null;
    sku: string | null;
    stock_quantity: number | null;
    reserved_quantity: number | null;
    low_stock_threshold: number | null;
    scent_notes: string[] | null;
    product_variants: {
        id: string;
        name: string;
        price: number | string | null;
        barcode: string | null;
        sku: string | null;
        stock_quantity: number | null;
        reserved_quantity: number | null;
        is_enabled: boolean | null;
        display_order: number | null;
    }[];
};

const free = (stock: number | null, reserved: number | null) => Math.max(0, (stock ?? 0) - (reserved ?? 0));

/** Everything the till can sell, with sizes and what is free to sell. */
export function useTillProducts() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: tillKeys.products(tenantId),
        enabled: !!tenantId,
        staleTime: 30_000,
        queryFn: async (): Promise<TillProduct[]> => {
            const { data, error } = await supabase
                .from("products")
                .select(
                    "id, name, display_name, price, image_url, tag_color, barcode, sku, stock_quantity, reserved_quantity, low_stock_threshold, scent_notes, product_variants(id, name, price, barcode, sku, stock_quantity, reserved_quantity, is_enabled, display_order)",
                )
                .eq("tenant_id", tenantId)
                .eq("is_archived", false)
                .eq("is_supply", false)
                .order("display_order", { ascending: true, nullsFirst: false })
                .order("name", { ascending: true })
                .limit(2000);
            if (error) throw error;
            return ((data ?? []) as unknown as ProductRow[]).map((p) => {
                const variants = p.product_variants
                    .filter((v) => v.is_enabled !== false)
                    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
                    .map((v) => ({
                        id: v.id,
                        name: v.name,
                        price: Math.round(Number(v.price ?? p.price ?? 0)),
                        barcode: v.barcode,
                        sku: v.sku,
                        available: free(v.stock_quantity, v.reserved_quantity),
                        on_hand: Math.max(0, v.stock_quantity ?? 0),
                    }));
                return {
                    id: p.id,
                    name: p.display_name?.trim() || p.name,
                    price: Math.round(Number(p.price ?? 0)),
                    image_url: p.image_url,
                    tag_color: p.tag_color,
                    barcode: p.barcode,
                    sku: p.sku,
                    available: variants.length ? variants.reduce((s, v) => s + v.available, 0) : free(p.stock_quantity, p.reserved_quantity),
                    on_hand: variants.length ? variants.reduce((sum, v) => sum + v.on_hand, 0) : Math.max(0, p.stock_quantity ?? 0),
                    low_at: Math.max(0, p.low_stock_threshold ?? 0),
                    notes: p.scent_notes ?? [],
                    variants,
                };
            });
        },
    });
}

/** The store's name for the receipt header. */
export function useTillStoreName() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: tillKeys.store(tenantId),
        enabled: !!tenantId,
        staleTime: 10 * 60_000,
        queryFn: async (): Promise<string> => {
            const { data, error } = await supabase.from("tenants").select("business_name, slug").eq("id", tenantId).maybeSingle();
            if (error) throw error;
            const row = data as { business_name: string | null; slug: string | null } | null;
            return row?.business_name?.trim() || row?.slug || "";
        },
    });
}

const unlockResultSchema = z.object({
    status: z.enum(["ok", "wrong", "locked", "no_pin", "not_allowed"]),
    session_id: z.string().uuid().optional(),
});
export type UnlockResult = z.infer<typeof unlockResultSchema>;

/** Switches a cashier in with their PIN; opens a till session on success. */
export function useTillUnlock() {
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (input: { shopId: string; userId: string; pin: string }): Promise<UnlockResult> => {
            const { data, error } = await supabase.rpc("till_unlock", {
                p_tenant_id: tenantId,
                p_shop_id: input.shopId,
                p_user_id: input.userId,
                p_pin: input.pin,
            });
            if (error) throw error;
            return unlockResultSchema.parse(data);
        },
    });
}

export async function pingTillSession(sessionId: string): Promise<boolean> {
    const { error } = await supabase.rpc("till_ping", { p_session_id: sessionId });
    return !error;
}

export async function lockTillSession(sessionId: string): Promise<void> {
    const { error } = await supabase.rpc("till_lock", { p_session_id: sessionId });
    if (error) throw error;
}

const saleResultSchema = z.object({
    order: z.object({ id: z.string(), order_id: z.string(), created_at: z.string(), total: z.number() }),
    change: z.number(),
    replay: z.boolean(),
});
export type SaleResult = z.infer<typeof saleResultSchema>;

export interface SaleInput {
    sessionId: string;
    clientSaleId: string;
    /** price is sent only when the cashier sold the line below its catalog price. */
    lines: { product_id: string; variant_id: string | null; quantity: number; price?: number }[];
    discount: number;
    /** A manager's OK from till_approve, for a discount over the cashier's limit. */
    approvalId: string | null;
    payments: PaymentLine[];
    customerName: string;
    phone: string | null;
}

/** Why a sale was refused, as a key the till can explain. */
export type SaleError = "locked" | "discount_over_limit" | "discount_not_allowed" | "approval_expired" | "approval_too_small" | "mismatch" | "product" | "paused" | "failed";

export function saleErrorOf(err: unknown): SaleError {
    const message = typeof err === "object" && err !== null && "message" in err ? String(err.message) : "";
    if (message.includes("till_locked")) return "locked";
    if (message.includes("discount_over_limit")) return "discount_over_limit";
    if (message.includes("discount_not_allowed")) return "discount_not_allowed";
    if (message.includes("approval_expired")) return "approval_expired";
    if (message.includes("approval_too_small")) return "approval_too_small";
    if (message.includes("payments_do_not_match_total")) return "mismatch";
    if (message.includes("product_not_found")) return "product";
    if (message.includes("store_paused")) return "paused";
    return "failed";
}

export function useTillSale() {
    const qc = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (s: SaleInput): Promise<SaleResult> => {
            const { data, error } = await supabase.rpc("till_create_sale", {
                p_session_id: s.sessionId,
                p_sale: {
                    client_sale_id: s.clientSaleId,
                    lines: s.lines,
                    discount: s.discount,
                    payments: s.payments,
                    customer_name: s.customerName,
                    phone: s.phone,
                    ...(s.approvalId ? { approval_id: s.approvalId } : {}),
                },
            });
            if (error) throw error;
            return saleResultSchema.parse(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: tillKeys.products(tenantId) });
            qc.invalidateQueries({ queryKey: ["till", "overview"] });
            qc.invalidateQueries({ queryKey: ["till", "today"] });
            qc.invalidateQueries({ queryKey: ["orders"] });
        },
    });
}

// ── A manager's OK, the removed-items log, cash paid out ──

const approveSchema = z.object({
    result: z.enum(["ok", "wrong", "locked", "no_pin", "not_manager"]),
    approval_id: z.string().optional(),
});
export type ApproveResult = z.infer<typeof approveSchema>;

/**
 * A manager types their PIN on the till to allow one sale over the cashier's limit.
 * maxOff is the price cuts + discount they are allowing; the sale may not go over it.
 */
export function useTillApprove() {
    return useMutation({
        mutationFn: async (input: { sessionId: string; managerId: string; pin: string; maxOff: number | null }): Promise<ApproveResult> => {
            const { data, error } = await supabase.rpc("till_approve", {
                p_session_id: input.sessionId,
                p_manager_id: input.managerId,
                p_pin: input.pin,
                ...(input.maxOff !== null ? { p_max_off: input.maxOff } : {}),
            });
            if (error) throw error;
            return approveSchema.parse(data);
        },
    });
}

export interface RemovedLine {
    product_id: string;
    variant_id: string | null;
    name: string;
    variant_name: string | null;
    quantity: number;
    price: number;
}

/** Records items taken out of a cart before payment, for the owner's log. */
export async function logRemovedLines(sessionId: string, lines: RemovedLine[]): Promise<void> {
    if (lines.length === 0) return;
    const { error } = await supabase.rpc("till_log_removed", { p_session_id: sessionId, p_lines: lines });
    if (error) throw error;
}

const clockSchema = z.object({ clock_in: z.string(), shop_id: z.string() }).nullable();
export type TillClock = z.infer<typeof clockSchema>;

/** The cashier's open shift (clocked in), or null. */
export function useTillClock(sessionId: string | null) {
    return useQuery({
        queryKey: ["till", "clock", "me", sessionId],
        enabled: !!sessionId,
        staleTime: 60_000,
        queryFn: async (): Promise<TillClock> => {
            const { data, error } = await supabase.rpc("till_clock_status", { p_session_id: sessionId });
            if (error) throw error;
            return clockSchema.parse(data);
        },
    });
}

/** Clocks the cashier in or out at this till. */
export function useTillClockSet() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; clockIn: boolean }): Promise<TillClock> => {
            const { data, error } = await supabase.rpc("till_clock_set", { p_session_id: input.sessionId, p_in: input.clockIn });
            if (error) throw error;
            return clockSchema.parse(data);
        },
        onSuccess: (data, input) => {
            qc.setQueryData(["till", "clock", "me", input.sessionId], data);
            qc.invalidateQueries({ queryKey: ["till", "clock"] });
        },
    });
}

const payoutSchema = z.union([
    z.object({ expense_id: z.string(), replay: z.boolean() }),
    // Over the store's limit and no valid manager's OK: the till asks for a PIN and tries again.
    z.object({ error: z.literal("needs_manager"), limit: z.number() }),
]);
export type PayoutResult = z.infer<typeof payoutSchema>;

/** Cash taken from the drawer for a shop cost; it lands in Finances as an expense. */
export function useTillPayout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; clientId: string; amount: number; note: string; approvalId: string | null }): Promise<PayoutResult> => {
            const { data, error } = await supabase.rpc("till_payout", {
                p_session_id: input.sessionId,
                p_client_id: input.clientId,
                p_amount: input.amount,
                p_note: input.note,
                ...(input.approvalId ? { p_approval_id: input.approvalId } : {}),
            });
            if (error) throw error;
            return payoutSchema.parse(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["till", "events"] });
            qc.invalidateQueries({ queryKey: ["expenses"] });
        },
    });
}

// ── While a cashier is in: header numbers, best sellers, chips, history, customer card ──

const countTotal = z.object({ count: z.number(), total: z.coerce.number() });
const overviewSchema = z.object({
    best: z.array(z.string()),
    chips: z.array(z.object({ id: z.string(), name: z.string(), product_ids: z.array(z.string()) })),
    today: countTotal,
    mine: countTotal,
});
export type TillOverview = z.infer<typeof overviewSchema>;

/** Best sellers, the category chips and today's numbers, for the open session. */
export function useTillOverview(sessionId: string | null) {
    return useQuery({
        queryKey: ["till", "overview", sessionId],
        enabled: !!sessionId,
        staleTime: 30_000,
        refetchInterval: 120_000,
        queryFn: async (): Promise<TillOverview> => {
            const { data, error } = await supabase.rpc("till_overview", { p_session_id: sessionId });
            if (error) throw error;
            return overviewSchema.parse(data);
        },
    });
}

const historyItem = z.object({
    name: z.string().catch(""),
    variant_name: z.string().nullable().catch(null),
    quantity: z.coerce.number().catch(1),
    price: z.coerce.number().catch(0),
    image_url: z.string().nullable().catch(null),
    product_id: z.string().nullable().catch(null),
    variant_id: z.string().nullable().catch(null),
});
const historySale = z.object({
    id: z.string(),
    order_id: z.string(),
    created_at: z.string(),
    total: z.coerce.number(),
    discount: z.coerce.number(),
    customer_name: z.string().nullable(),
    phone: z.string().nullable(),
    items: z.array(historyItem),
    cashier: z.string(),
    payments: z.array(
        z.object({
            method: z.enum(["cash", "card", "zaincash", "fib"]),
            amount: z.coerce.number(),
            tendered: z.coerce.number().nullable(),
        }),
    ),
});
export type TillHistorySale = z.infer<typeof historySale>;

/** A receipt number: what the QR on a printed receipt holds. */
export const RECEIPT_CODE = /^\d{10}$/;

/** One past till sale of this store by its receipt number, from any shop and any day; null when there is none. */
export function useTillFindSale(sessionId: string | null, orderId: string | null) {
    return useQuery({
        queryKey: ["till", "find", sessionId, orderId],
        enabled: !!sessionId && !!orderId && RECEIPT_CODE.test(orderId),
        staleTime: 30_000,
        queryFn: async (): Promise<TillHistorySale | null> => {
            const { data, error } = await supabase.rpc("till_find_sale", { p_session_id: sessionId, p_order_id: orderId });
            if (error) throw error;
            return historySale.nullable().parse(data);
        },
    });
}

/** Today's sales at this shop, newest first. */
export function useTillSalesToday(sessionId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: ["till", "today", sessionId],
        enabled: !!sessionId && enabled,
        staleTime: 10_000,
        queryFn: async (): Promise<TillHistorySale[]> => {
            const { data, error } = await supabase.rpc("till_sales_today", { p_session_id: sessionId });
            if (error) throw error;
            return z.array(historySale).parse(data);
        },
    });
}

const customerSchema = z
    .object({
        name: z.string().nullable(),
        orders: z.number(),
        spent: z.coerce.number(),
        returned: z.number(),
        last_at: z.string().nullable(),
        blacklisted: z.boolean(),
    })
    .nullable();
export type TillCustomer = NonNullable<z.infer<typeof customerSchema>>;

/** What the store already knows about this phone number. `phone` is the normalised 07… number. */
export function useTillCustomer(sessionId: string | null, phone: string | null) {
    return useQuery({
        queryKey: ["till", "customer", sessionId, phone],
        enabled: !!sessionId && !!phone,
        staleTime: 60_000,
        queryFn: async (): Promise<TillCustomer | null> => {
            const { data, error } = await supabase.rpc("till_customer", { p_session_id: sessionId, p_phone: phone });
            if (error) throw error;
            return customerSchema.parse(data);
        },
    });
}

const holdSchema = z.object({
    id: z.string().uuid(),
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().nullable(),
    name: z.string(),
    variant_name: z.string().nullable(),
    image_url: z.string().nullable(),
    quantity: z.number().int(),
    customer_name: z.string(),
    customer_phone: z.string().nullable(),
    held_by: z.string(),
    created_at: z.string(),
    expires_at: z.string(),
});
export type TillHold = z.infer<typeof holdSchema>;
const holdsKey = (sessionId: string | null) => ["till", "holds", sessionId] as const;

/** Bottles kept aside for customers in this till's shop, soonest to run out first. */
export function useTillHolds(sessionId: string | null) {
    return useQuery({
        queryKey: holdsKey(sessionId),
        enabled: !!sessionId,
        staleTime: 30_000,
        refetchInterval: 60_000,
        queryFn: async (): Promise<TillHold[]> => {
            const { data, error } = await supabase.rpc("till_holds_open", { p_session_id: sessionId });
            if (error) throw error;
            return z.array(holdSchema).parse(data);
        },
    });
}

const holdAddSchema = z.union([
    z.object({ hold_id: z.string().uuid(), replay: z.boolean() }),
    z.object({ error: z.literal("not_enough"), available: z.number().int() }),
]);
export type HoldLine = { key: string; clientId: string; productId: string; variantId: string | null; quantity: number; name: string };
export type HoldAddResult = { kept: string[]; short: { key: string; name: string; available: number }[] };

/** Keeps each line aside for the customer. Lines with too few pieces free are skipped and reported. */
export function useTillHoldAdd() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; lines: HoldLine[]; name: string; phone: string | null; hours: number }): Promise<HoldAddResult> => {
            const out: HoldAddResult = { kept: [], short: [] };
            for (const l of input.lines) {
                const { data, error } = await supabase.rpc("till_hold_add", {
                    p_session_id: input.sessionId,
                    p_client_id: l.clientId,
                    p_product_id: l.productId,
                    p_variant_id: l.variantId,
                    p_quantity: l.quantity,
                    p_name: input.name,
                    p_phone: input.phone,
                    p_hours: input.hours,
                });
                if (error) throw error;
                const r = holdAddSchema.parse(data);
                if ("error" in r) out.short.push({ key: l.key, name: l.name, available: r.available });
                else out.kept.push(l.key);
            }
            return out;
        },
        onSettled: (_d, _e, input) => {
            qc.invalidateQueries({ queryKey: holdsKey(input.sessionId) });
            qc.invalidateQueries({ queryKey: ["till", "products"] });
        },
    });
}

/** Ends a hold: picked up (the till sells it next) or put back on the shelf. */
export function useTillHoldEnd() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; holdId: string; reason: "picked_up" | "released" }): Promise<boolean> => {
            const { data, error } = await supabase.rpc("till_hold_end", { p_session_id: input.sessionId, p_hold_id: input.holdId, p_reason: input.reason });
            if (error) throw error;
            return z.object({ ended: z.boolean() }).parse(data).ended;
        },
        onSettled: (_d, _e, input) => {
            qc.invalidateQueries({ queryKey: holdsKey(input.sessionId) });
            qc.invalidateQueries({ queryKey: ["till", "products"] });
        },
    });
}

const testerSchema = z.object({
    id: z.string().uuid(),
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().nullable(),
    name: z.string(),
    variant_name: z.string().nullable(),
    image_url: z.string().nullable(),
    opened_by: z.string(),
    opened_at: z.string(),
});
export type TillTester = z.infer<typeof testerSchema>;
const testersKey = (sessionId: string | null) => ["till", "testers", sessionId] as const;

/** Tester bottles out on this shop's shelf, newest first. */
export function useTillTesters(sessionId: string | null) {
    return useQuery({
        queryKey: testersKey(sessionId),
        enabled: !!sessionId,
        staleTime: 60_000,
        queryFn: async (): Promise<TillTester[]> => {
            const { data, error } = await supabase.rpc("till_testers_open", { p_session_id: sessionId });
            if (error) throw error;
            return z.array(testerSchema).parse(data);
        },
    });
}

const testerOpenSchema = z.union([
    z.object({ tester_id: z.string().uuid(), replay: z.boolean() }),
    z.object({ error: z.enum(["not_enough", "needs_manager"]) }),
]);
export type TesterOpenResult = z.infer<typeof testerOpenSchema>;

/** Opens one bottle as a tester: it leaves stock and stays on the shop's tester list. */
export function useTillTesterOpen() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; clientId: string; productId: string; variantId: string | null; approvalId: string | null }): Promise<TesterOpenResult> => {
            const { data, error } = await supabase.rpc("till_tester_open", {
                p_session_id: input.sessionId,
                p_client_id: input.clientId,
                p_product_id: input.productId,
                p_variant_id: input.variantId,
                p_approval_id: input.approvalId,
            });
            if (error) throw error;
            return testerOpenSchema.parse(data);
        },
        onSettled: (_d, _e, input) => {
            qc.invalidateQueries({ queryKey: testersKey(input.sessionId) });
            qc.invalidateQueries({ queryKey: ["till", "products"] });
        },
    });
}

/** A tester is used up and leaves the shelf list. */
export function useTillTesterEnd() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; testerId: string }): Promise<boolean> => {
            const { data, error } = await supabase.rpc("till_tester_end", { p_session_id: input.sessionId, p_tester_id: input.testerId });
            if (error) throw error;
            return z.object({ ended: z.boolean() }).parse(data).ended;
        },
        onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: testersKey(input.sessionId) }),
    });
}

/** Sets stock to a shelf count (managers only). Returns how many lines changed. */
export function useTillCountApply() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; lines: { product_id: string; variant_id: string | null; counted: number }[] }): Promise<number> => {
            const { data, error } = await supabase.rpc("till_count_apply", { p_session_id: input.sessionId, p_lines: input.lines });
            if (error) throw error;
            return z.object({ changed: z.number().int() }).parse(data).changed;
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["till", "products"] }),
    });
}

/** Barcodes for the stickers to print; items with none get a new in-store code (managers only). */
export function useTillLabelCodes() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; items: { product_id: string; variant_id: string | null }[] }) => {
            const { data, error } = await supabase.rpc("till_label_codes", { p_session_id: input.sessionId, p_items: input.items });
            if (error) throw error;
            return z
                .array(z.object({ product_id: z.string(), variant_id: z.string().nullable(), barcode: z.string(), created: z.boolean() }))
                .parse(data);
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["till", "products"] }),
    });
}

/** Sets one product's scent notes (managers only). */
export function useTillSetScentNotes() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { sessionId: string; productId: string; notes: string[] }): Promise<string[]> => {
            const { data, error } = await supabase.rpc("till_set_scent_notes", { p_session_id: input.sessionId, p_product_id: input.productId, p_notes: input.notes });
            if (error) throw error;
            return z.array(z.string()).parse(data);
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["till", "products"] }),
    });
}
