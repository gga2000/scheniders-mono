"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface FunnelDay {
    day: string;
    visitors: number;
    purchases: number;
}
export interface FunnelProduct {
    product_id: string;
    name: string | null;
    viewers: number;
    buyers: number;
}
export interface StorefrontFunnel {
    visitors: number;
    product_viewers: number;
    cart_adders: number;
    checkout_starters: number;
    buyers: number;
    page_views: number;
    purchases: number;
    revenue_iqd: number;
    series: FunnelDay[];
    top_products: FunnelProduct[];
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Shape the RPC's JSON defensively — a missing field is a zero, never a crash. */
export function parseFunnel(raw: unknown): StorefrontFunnel {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const series = Array.isArray(r.series)
        ? r.series.map((d) => {
              const o = (d ?? {}) as Record<string, unknown>;
              return { day: String(o.day ?? ""), visitors: num(o.visitors), purchases: num(o.purchases) };
          })
        : [];
    const top_products = Array.isArray(r.top_products)
        ? r.top_products.map((p) => {
              const o = (p ?? {}) as Record<string, unknown>;
              return {
                  product_id: String(o.product_id ?? ""),
                  name: typeof o.name === "string" ? o.name : null,
                  viewers: num(o.viewers),
                  buyers: num(o.buyers),
              };
          })
        : [];
    return {
        visitors: num(r.visitors),
        product_viewers: num(r.product_viewers),
        cart_adders: num(r.cart_adders),
        checkout_starters: num(r.checkout_starters),
        buyers: num(r.buyers),
        page_views: num(r.page_views),
        purchases: num(r.purchases),
        revenue_iqd: num(r.revenue_iqd),
        series,
        top_products,
    };
}

/** The merchant's first-party storefront funnel over the last `days` days. */
export function useStorefrontFunnel(tenantId: string, days = 7) {
    return useQuery<StorefrontFunnel>({
        queryKey: ["storefront-funnel", tenantId, days],
        queryFn: async () => {
            const to = new Date();
            const from = new Date(to);
            from.setDate(from.getDate() - days);
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
