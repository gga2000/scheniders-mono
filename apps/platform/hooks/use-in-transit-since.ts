"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/supabase";

/** PostgREST caps the URL length, so ids are looked up in slices. */
const ID_CHUNK = 150;

interface HistoryRow {
    order_id: string;
    from_status: string | null;
    to_status: string;
    changed_at: string;
}

/**
 * Keep, per order, the latest row where the order really moved into in_transit.
 * Audit rows for edits (from === to) are not a status change and are skipped.
 * Orders with no such row (history was only written by the database from
 * 2026-11-01) are absent from the map; callers fall back to `updated_at`.
 */
export function latestInTransitEntry(rows: readonly HistoryRow[]): Map<string, string> {
    const since = new Map<string, string>();
    for (const row of rows) {
        if (row.to_status !== "in_transit" || row.from_status === row.to_status) continue;
        const known = since.get(row.order_id);
        if (!known || row.changed_at > known) since.set(row.order_id, row.changed_at);
    }
    return since;
}

/** When each currently in-transit order actually entered transit (order id -> ISO time). */
export function useInTransitSince(orders: readonly Order[]): ReadonlyMap<string, string> {
    const ids = useMemo(
        () => orders.filter((o) => o.status === "in_transit" && !o.is_return).map((o) => o.id).sort(),
        [orders],
    );

    const { data } = useQuery({
        queryKey: ["finance-in-transit-since", ids],
        enabled: ids.length > 0,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const rows: HistoryRow[] = [];
            for (let i = 0; i < ids.length; i += ID_CHUNK) {
                const { data: chunk, error } = await supabase
                    .from("order_status_history")
                    .select("order_id, from_status, to_status, changed_at")
                    .in("order_id", ids.slice(i, i + ID_CHUNK))
                    .eq("to_status", "in_transit");
                if (error) throw error;
                rows.push(...((chunk ?? []) as HistoryRow[]));
            }
            return Array.from(latestInTransitEntry(rows));
        },
    });

    return useMemo(() => new Map(data ?? []), [data]);
}
