import { useMemo } from "react";
// Same source global-search.tsx uses for the orders array + order-id normalizer.
import { useOrdersContext } from "@/components/providers/orders-provider";
import { getBaseOrderId } from "@/lib/utils";
import type { ChatReference } from "@/types/chat";

export interface ReferenceResult {
    ref_type: ChatReference["ref_type"];
    ref_id: string;
    label: string;
    sublabel: string;
    snapshot: Record<string, unknown>;
}

const MAX_RESULTS = 8;

export function useReferenceSearch(query: string): ReferenceResult[] {
    const { orders } = useOrdersContext();
    return useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const results: ReferenceResult[] = [];

        for (const o of orders) {
            const display = getBaseOrderId(o.order_id);
            const matchesId = display.toLowerCase().includes(q) || o.order_id.toLowerCase().includes(q);
            const matchesName = (o.customer_name ?? "").toLowerCase().includes(q);
            const matchesPhone = (o.phone ?? "").includes(q);
            if (matchesId || matchesName || matchesPhone) {
                results.push({
                    ref_type: "order",
                    ref_id: o.id,
                    label: `#${display}`,
                    sublabel: `${o.customer_name ?? ""} · ${o.phone ?? ""}`,
                    snapshot: {
                        order_id: display,
                        customer_name: o.customer_name,
                        phone: o.phone,
                        price: o.price,
                        status: o.status,
                        governorate_code: o.governorate_code,
                    },
                });
            }
            if (results.length >= MAX_RESULTS) break;
        }
        return results.slice(0, MAX_RESULTS);
    }, [orders, query]);
}
