import { useMemo } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useDebounce } from "@/hooks/use-debounce";
import { useServerOrderSearch } from "@/hooks/use-server-order-search";
import { getBaseOrderId } from "@/lib/utils";
import type { ChatReference } from "@/types/chat";
import type { Order } from "@/types/order";

export interface ReferenceResult {
    ref_type: ChatReference["ref_type"];
    ref_id: string;
    label: string;
    sublabel: string;
    snapshot: Record<string, unknown>;
}

const MAX_RESULTS = 8;
/** Same debounce the top-bar search uses before it asks the server. */
const SERVER_SEARCH_DEBOUNCE_MS = 250;

function toReference(o: Order): ReferenceResult {
    const display = getBaseOrderId(o.order_id);
    return {
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
    };
}

/**
 * Orders to offer when a message references one.
 *
 * The orders context is only the /orders date window (default: today), so
 * searching it alone could not reference yesterday's order. Matches from the
 * window still show at once, from the first character; the server search
 * (same one as the top bar: every date, any phone format) fills in the rest
 * once the term is long enough.
 */
export function useReferenceSearch(query: string): ReferenceResult[] {
    const { orders } = useOrdersContext();
    const debounced = useDebounce(query, SERVER_SEARCH_DEBOUNCE_MS);
    const server = useServerOrderSearch(debounced, { limit: MAX_RESULTS, liveOrders: orders });

    return useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const results: ReferenceResult[] = [];
        const seen = new Set<string>();

        for (const o of orders) {
            if (results.length >= MAX_RESULTS) break;
            const display = getBaseOrderId(o.order_id);
            const matchesId = display.toLowerCase().includes(q) || o.order_id.toLowerCase().includes(q);
            const matchesName = (o.customer_name ?? "").toLowerCase().includes(q);
            const matchesPhone = (o.phone ?? "").includes(q);
            if (matchesId || matchesName || matchesPhone) {
                results.push(toReference(o));
                seen.add(o.id);
            }
        }

        // Only merge server matches that answer the term on screen, not a
        // previous one still held while the next request loads.
        if (debounced === query && !server.pending) {
            for (const o of server.orders) {
                if (results.length >= MAX_RESULTS) break;
                if (seen.has(o.id)) continue;
                results.push(toReference(o));
                seen.add(o.id);
            }
        }
        return results;
    }, [orders, query, debounced, server.orders, server.pending]);
}
