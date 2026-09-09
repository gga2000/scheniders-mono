import { useMemo } from "react";
// PERF-D1: this used to read the whole order book from OrdersProvider and filter
// it in the browser. It runs inside the chat runtime, which is mounted in the
// root layout, so it was one of the three consumers forcing a ~9.7 MB fetch onto
// every route. Same source global-search now uses: matches from the server.
import { useOrderSearchQuery } from "@/hooks/use-order-search-query";
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
    const matches = useOrderSearchQuery(query, MAX_RESULTS);
    return useMemo(
        () =>
            matches.map((o) => {
                const display = getBaseOrderId(o.order_id);
                return {
                    ref_type: "order" as const,
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
                };
            }),
        [matches]
    );
}
