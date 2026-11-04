"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { PRIME_VIEW_COLUMNS, primeShipmentRowSchema, primeShipmentsKey, primeViewFromRow } from "@/hooks/use-prime-shipments";
import { supabase } from "@/lib/supabase";
import { computeCodAmount } from "@/lib/order-money";
import { baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import { primeBoard, type PrimeBoard, type PrimeBoardParcel } from "@/lib/prime/board";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import type { Order } from "@/types/order";

/** Same window as the status sync and the order cards. */
const LOOKBACK_DAYS = 60;
const REFRESH_MS = 60_000;

const ORDER_COLUMNS = "id, order_id, customer_name, city, phone, status, price, delivery_fee, discount_amount, payment_status, address_details";

/** The order fields the Prime page shows and the parcel panel (resend form) edits. */
export type PrimeBoardOrder = Pick<
    Order,
    "id" | "order_id" | "customer_name" | "city" | "phone" | "price" | "delivery_fee" | "discount_amount" | "payment_status" | "address_details"
> & { status: string };

const absent = <T>(v: T | null) => v ?? undefined;

const orderSchema = z.object({
    id: z.string(),
    order_id: z.string(),
    customer_name: z.string().nullable().transform((v) => v ?? ""),
    city: z.string().nullable().transform(absent),
    phone: z.string().nullable().transform((v) => v ?? ""),
    status: z.string(),
    price: z.coerce.number().nullable().transform((v) => v ?? 0),
    delivery_fee: z.coerce.number().nullable().transform(absent),
    discount_amount: z.coerce.number().nullable().transform(absent),
    payment_status: z.enum(["pending", "cod", "prepaid", "partial", "paid"]),
    address_details: z.string().nullable().transform(absent),
}) satisfies z.ZodType<PrimeBoardOrder>;

const boardRowSchema = primeShipmentRowSchema.extend({ orders: orderSchema });

export interface PrimeBoardData {
    board: PrimeBoard;
    views: ReadonlyMap<string, PrimeShipmentView>;
    orders: ReadonlyMap<string, PrimeBoardOrder>;
    /** What Prime collects for each parcel (what we sent, else the order's COD amount). */
    cash: ReadonlyMap<string, number>;
    /** When the shipments were read (ms). */
    readAt: number;
}

async function fetchBoardRows(tenantId: string) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const today = new Date(baghdadDayStart(baghdadDayKey(Date.now()))).toISOString();
    const select = `${PRIME_VIEW_COLUMNS}, orders!inner(${ORDER_COLUMNS})`;
    // Open parcels (and the ones Prime cancelled), plus whatever moved or was handed over today.
    const [open, todays] = await Promise.all([
        supabase.from("prime_shipments").select(select).eq("tenant_id", tenantId).in("orders.status", ["confirmed", "in_transit", "cancelled"]).gte("sent_at", since),
        supabase.from("prime_shipments").select(select).eq("tenant_id", tenantId).or(`sent_at.gte.${today},status_changed_at.gte.${today}`),
    ]);
    if (open.error) throw open.error;
    if (todays.error) throw todays.error;
    const byOrder = new Map<string, z.infer<typeof boardRowSchema>>();
    for (const row of z.array(boardRowSchema).parse([...(open.data ?? []), ...(todays.data ?? [])])) byOrder.set(row.order_id, row);
    return [...byOrder.values()];
}

/**
 * The Prime page's data: every parcel out with Prime and today's, with the
 * order fields the page needs, laid out as the board (see lib/prime/board).
 * Keyed under the Prime shipments key, so a resend or a status change
 * refreshes it with the order cards.
 */
export function usePrimeBoard(enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...primeShipmentsKey(tenantId), "board"],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 30_000,
        refetchInterval: REFRESH_MS,
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchBoardRows(tenantId);
        },
    });

    const data = useMemo((): PrimeBoardData | null => {
        if (!query.data) return null;
        const views = new Map<string, PrimeShipmentView>();
        const orders = new Map<string, PrimeBoardOrder>();
        const cash = new Map<string, number>();
        const parcels: PrimeBoardParcel[] = [];
        for (const row of query.data) {
            const view = primeViewFromRow(row);
            const order = row.orders;
            const collect = view.receiptAmountIqd ?? computeCodAmount(order);
            views.set(row.order_id, view);
            orders.set(row.order_id, order);
            cash.set(row.order_id, collect);
            parcels.push({ orderId: row.order_id, orderStatus: order.status, view, cash: collect });
        }
        return { board: primeBoard(parcels, query.dataUpdatedAt), views, orders, cash, readAt: query.dataUpdatedAt };
    }, [query.data, query.dataUpdatedAt]);

    return { data, isPending: query.isPending, isError: query.isError, refetch: query.refetch };
}
