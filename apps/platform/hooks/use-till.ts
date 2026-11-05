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
                    "id, name, display_name, price, image_url, tag_color, barcode, sku, stock_quantity, reserved_quantity, product_variants(id, name, price, barcode, sku, stock_quantity, reserved_quantity, is_enabled, display_order)",
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
    lines: { product_id: string; variant_id: string | null; quantity: number }[];
    discount: number;
    payments: PaymentLine[];
    customerName: string;
    phone: string | null;
}

/** Why a sale was refused, as a key the till can explain. */
export type SaleError = "locked" | "discount_over_limit" | "discount_not_allowed" | "mismatch" | "product" | "paused" | "failed";

export function saleErrorOf(err: unknown): SaleError {
    const message = typeof err === "object" && err !== null && "message" in err ? String(err.message) : "";
    if (message.includes("till_locked")) return "locked";
    if (message.includes("discount_over_limit")) return "discount_over_limit";
    if (message.includes("discount_not_allowed")) return "discount_not_allowed";
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
