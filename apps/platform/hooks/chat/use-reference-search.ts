import { useMemo } from "react";
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
 * The server search the top bar uses: every date, any phone format, from the
 * second character. Chat is mounted above the routes that mount the order book,
 * so there is no loaded window to search first — and the window was only the
 * /orders date range (default: today), so it could not reference yesterday's
 * order anyway.
 */
export function useReferenceSearch(query: string): ReferenceResult[] {
    const debounced = useDebounce(query, SERVER_SEARCH_DEBOUNCE_MS);
    const server = useServerOrderSearch(debounced, { limit: MAX_RESULTS });

    return useMemo(() => {
        if (!query.trim()) return [];
        // Only show matches that answer the term on screen, not a previous one
        // still held while the next request loads.
        if (debounced !== query || server.pending) return [];
        return server.orders.slice(0, MAX_RESULTS).map(toReference);
    }, [query, debounced, server.orders, server.pending]);
}
