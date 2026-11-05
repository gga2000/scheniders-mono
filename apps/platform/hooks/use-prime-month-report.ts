"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { primeShipmentsKey } from "@/hooks/use-prime-shipments";
import { supabase } from "@/lib/supabase";
import { primeMonthRange, primeMonthReport, type PrimeMonthParcel, type PrimeMonthReport } from "@/lib/prime/month-report";

const PAGE = 1000;

const rowSchema = z.object({
    sent_at: z.string(),
    step_name: z.string().nullable(),
    receipt_amount_iqd: z.coerce.number().nullable(),
    shipment_charge: z.coerce.number().nullable(),
    orders: z.object({
        order_id: z.string(),
        customer_name: z.string().nullable(),
        city: z.string().nullable(),
        status: z.string(),
    }),
});

async function fetchMonth(tenantId: string, month: string): Promise<PrimeMonthParcel[]> {
    const range = primeMonthRange(month);
    if (!range) throw new Error(`Bad month: ${month}`);
    const parcels: PrimeMonthParcel[] = [];
    // Pages, because the API hands out at most 1000 rows at a time.
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from("prime_shipments")
            .select("sent_at, step_name, receipt_amount_iqd, shipment_charge, orders!inner(order_id, customer_name, city, status)")
            .eq("tenant_id", tenantId)
            .gte("sent_at", range.from)
            .lt("sent_at", range.to)
            .order("sent_at", { ascending: true })
            .order("order_id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = z.array(rowSchema).parse(data ?? []);
        for (const r of rows) {
            parcels.push({
                orderNumber: r.orders.order_id,
                customerName: r.orders.customer_name ?? "",
                city: r.orders.city,
                sentAt: r.sent_at,
                orderStatus: r.orders.status,
                collected: r.receipt_amount_iqd,
                fee: r.shipment_charge,
                primeStatus: r.step_name,
            });
        }
        if (rows.length < PAGE) return parcels;
    }
}

/** The parcels handed to Prime in a Baghdad month (`YYYY-MM`) and the month's counts. */
export function usePrimeMonthReport(month: string, enabled: boolean): { parcels: PrimeMonthParcel[]; report: PrimeMonthReport | null; isPending: boolean; isError: boolean } {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...primeShipmentsKey(tenantId), "month", month],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchMonth(tenantId, month);
        },
    });
    const parcels = query.data ?? [];
    return { parcels, report: query.data ? primeMonthReport(query.data) : null, isPending: query.isPending, isError: query.isError };
}
