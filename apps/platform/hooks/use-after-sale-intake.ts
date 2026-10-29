"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { receiveAfterSaleItemAction, type ReceiveAfterSaleInput } from "@/app/actions/after-sale";
import { DEFAULT_OVERDUE_DAYS, LOSS_DISPOSITIONS } from "@/lib/after-sale/intake";

export interface PendingBackItem {
    id: string;
    name: string;
    qty: number;
    amount: number;
    created_at: string;
    child: { id: string; order_id: string; status: string; customer_name: string; is_return: boolean | null };
}

const settingsSchema = z
    .object({ after_sale: z.object({ overdue_days: z.int().min(1) }).partial().optional() })
    .loose();

export const afterSaleIntakeKeys = {
    pending: (tenantId: string | null) => ["after-sale-intake", tenantId] as const,
    customerLosses: (tenantId: string | null, phone: string | null) => ["after-sale-losses", tenantId, phone] as const,
};

/** Child orders that never left or were called off: nothing is coming back. */
const DEAD_CHILD_STATUSES = ["cancelled", "rejected", "refund_failed"];

/**
 * Lines expected back that nobody has received yet, oldest first, with the
 * store's overdue limit.
 */
export function useAfterSaleIntake(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: afterSaleIntakeKeys.pending(tenantId),
        enabled: enabled && !!tenantId,
        staleTime: 30 * 1000,
        queryFn: async (): Promise<{ items: PendingBackItem[]; overdueDays: number }> => {
            if (!tenantId) throw new Error("No active tenant");
            const [items, tenant] = await Promise.all([
                supabase
                    .from("after_sale_items")
                    .select("id, name, qty, amount, created_at, child:orders!after_sale_items_order_id_fkey!inner(id, order_id, status, customer_name, is_return, deleted_at)")
                    .eq("tenant_id", tenantId)
                    .eq("direction", "back")
                    .eq("expects_back", true)
                    .is("disposition", null)
                    .is("child.deleted_at", null)
                    .not("child.status", "in", `(${DEAD_CHILD_STATUSES.join(",")})`)
                    .order("created_at", { ascending: true }),
                supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
            ]);
            if (items.error) throw items.error;
            if (tenant.error) throw tenant.error;
            const settings = settingsSchema.safeParse(tenant.data?.settings ?? {});
            return {
                items: (items.data ?? []) as unknown as PendingBackItem[],
                overdueDays: (settings.success && settings.data.after_sale?.overdue_days) || DEFAULT_OVERDUE_DAYS,
            };
        },
    });
}

export function useReceiveAfterSaleItem() {
    const { tenantId, session } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: ReceiveAfterSaleInput) => {
            const result = await receiveAfterSaleItemAction(input, session?.access_token ?? "");
            if (!result.success) throw new Error(result.error);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: afterSaleIntakeKeys.pending(tenantId) });
            void queryClient.invalidateQueries({ queryKey: ["after-sale-losses"] });
        },
    });
}

/**
 * Items this customer damaged or never sent back on an earlier swap or
 * refund (Ali, 2026-10-27: record the loss and flag the customer, no charge).
 */
export function useCustomerAfterSaleLosses(phone: string | null | undefined) {
    const { tenantId } = useAuth();
    const key = phone?.trim() || null;
    return useQuery({
        queryKey: afterSaleIntakeKeys.customerLosses(tenantId, key),
        enabled: !!tenantId && !!key,
        staleTime: 60 * 1000,
        queryFn: async (): Promise<number> => {
            if (!tenantId || !key) return 0;
            const { count, error } = await supabase
                .from("after_sale_items")
                .select("id, original:orders!after_sale_items_original_order_id_fkey!inner(phone)", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .in("disposition", [...LOSS_DISPOSITIONS])
                .eq("original.phone", key);
            if (error) throw error;
            return count ?? 0;
        },
    });
}
