"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { Order, OrderItem } from "@/lib/supabase";

export async function createOrderAction(
    orderData: Omit<Order, "id" | "created_at" | "updated_at">,
    tenantId: string | null,
    retryCount = 0
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const MAX_RETRIES = 5;
    const supabase = createSupabaseServiceClient();

    try {

        // We delegate all the sequence number and ID generation to the atomic DB RPC
        const payload = {
            ...orderData,
            status: orderData.status || "confirmed",
            priority: orderData.priority || "normal",
            payment_status: orderData.payment_status || "cod",
            is_return: orderData.is_return || false,
            is_archived: false,
        };

        const { data, error: insertError } = await supabase
            .rpc('create_order_atomic', { _order_data: payload, _tenant_id: tenantId });

        if (insertError) {
            throw insertError;
        }

        return { success: true, data: data as Order };
    } catch (err: unknown) {
        // Extract more detailed error information
        let errorMessage = "Failed to create order";
        if (err instanceof Error) {
            errorMessage = err.message;
        } else if (typeof err === "object" && err !== null) {
            const errorObj = err as Record<string, unknown>;
            if (errorObj.message) {
                errorMessage = String(errorObj.message);
            } else if (errorObj.code) {
                errorMessage = `Database error: ${errorObj.code} - ${errorObj.details || errorObj.hint || 'Unknown error'}`;
            }
        }

        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function splitOrderAction(
    originalOrderId: string,
    keptItems: OrderItem[],
    returnedItems: OrderItem[],
    tenantId: string | null
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const supabase = createSupabaseServiceClient();

    try {
        // We delegate the split operation to our new atomic PostgreSQL RPC
        // which encapsulates fetching, calculating, updating, and inserting inside
        // a SERIALIZABLE transaction via row locks.
        const { data: createdReturnOrder, error: splitError } = await supabase
            .rpc('split_order_atomic', {
                _original_order_id: originalOrderId,
                _kept_items: keptItems,
                _returned_items: returnedItems,
                _tenant_id: tenantId,
            });

        if (splitError) {
            throw new Error(splitError.message || "Failed to execute atomic split");
        }

        return { success: true, data: createdReturnOrder as Order };

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to split order";
        return { success: false, error: errorMessage };
    }
}

export async function checkOrderIdExists(orderId: string, excludeUuid?: string, tenantId?: string | null): Promise<boolean> {
    const supabase = createSupabaseServiceClient();

    try {
        let query = supabase
            .from("orders")
            .select("id")
            .eq("order_id", orderId);

        if (excludeUuid) {
            query = query.neq("id", excludeUuid);
        }

        if (tenantId) {
            query = query.eq("tenant_id", tenantId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    } catch {
        return false;
    }
}
