"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { CostSnapshots } from "@/lib/finance/item-cost";

const RowsSchema = z.array(z.object({ order_id: z.string(), item_unit_costs: z.array(z.number().nullable()) }));

/**
 * What each delivered order's goods cost when it was delivered, line by line.
 *
 * The database freezes the unit costs at delivery (orders.item_unit_costs) and
 * hands them only to a member who may see product cost, through
 * finance_order_costs(). Until the query answers, or for a member who may not
 * see cost, the map is empty and every line is priced at the cost on file now,
 * which is what the Finances page did before snapshots existed.
 */
export function useOrderCostSnapshots(): CostSnapshots {
    const { tenantId } = useAuth();

    const { data } = useQuery({
        queryKey: ["finance-order-costs", tenantId],
        enabled: Boolean(tenantId),
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data: rows, error } = await supabase.rpc("finance_order_costs", { p_tenant_id: tenantId ?? "" });
            if (error) throw error;
            return RowsSchema.parse(rows ?? []).map((r): [string, (number | null)[]] => [r.order_id, r.item_unit_costs]);
        },
    });

    return useMemo(() => new Map(data ?? []), [data]);
}
