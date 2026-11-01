"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { storeHubWindow } from "@/lib/store-hub-window";

// storefront_funnel returns jsonb, so the generated types say only `Json`.
// Every field falls back on its own: a missing or malformed count is a zero
// and a malformed row is dropped to its defaults, never a crash.
const count = z.number().catch(0);

const daySchema = z
    .object({ day: z.string().catch(""), visitors: count, purchases: count })
    .catch({ day: "", visitors: 0, purchases: 0 });

const productSchema = z
    .object({
        product_id: z.string().catch(""),
        name: z.string().nullable().catch(null),
        viewers: count,
        buyers: count,
    })
    .catch({ product_id: "", name: null, viewers: 0, buyers: 0 });

const funnelSchema = z.object({
    visitors: count,
    product_viewers: count,
    cart_adders: count,
    checkout_starters: count,
    buyers: count,
    page_views: count,
    purchases: count,
    revenue_iqd: count,
    series: z.array(daySchema).catch([]),
    top_products: z.array(productSchema).catch([]),
});

export type StorefrontFunnel = z.infer<typeof funnelSchema>;
export type FunnelDay = z.infer<typeof daySchema>;
export type FunnelProduct = z.infer<typeof productSchema>;

/** Shape the RPC's JSON defensively — a missing field is a zero, never a crash. */
export function parseFunnel(raw: unknown): StorefrontFunnel {
    return funnelSchema.parse(typeof raw === "object" && raw !== null ? raw : {});
}

/** The merchant's first-party storefront funnel over the last `days` days. */
export function useStorefrontFunnel(tenantId: string, days = 7) {
    return useQuery<StorefrontFunnel>({
        queryKey: ["storefront-funnel", tenantId, days],
        queryFn: async () => {
            const { from, to } = storeHubWindow(days);
            const { data, error } = await supabase.rpc("storefront_funnel", {
                _tenant_id: tenantId,
                _from: from.toISOString(),
                _to: to.toISOString(),
            });
            if (error) throw error;
            return parseFunnel(data);
        },
        staleTime: 5 * 60 * 1000,
    });
}
