"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Order } from "@/lib/supabase";

export async function createOrderAction(
    orderData: Omit<Order, "id" | "created_at" | "updated_at">,
    retryCount = 0
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const MAX_RETRIES = 5;
    const supabase = await createSupabaseServerClient();

    try {
        // Authenticate check
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { success: false, error: "Unauthorized" };
        }

        // Generate smart order ID if not provided
        let generatedOrderId = orderData.order_id;

        if (!generatedOrderId) {
            // Get source code
            const sourceCode = orderData.source === 'whatsapp' ? '1'
                : orderData.source === 'meta' ? '2'
                    : orderData.source === 'tiktok' ? '3'
                        : '4'; // Manual/other

            // Get today's date in YYMMDD format
            const now = new Date();
            const dateStr = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;

            // Get today's order count for this source
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

            const { count, error: countError } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfDay)
                .lt('created_at', endOfDay)
                .like('order_id', `${sourceCode}${dateStr}%`);

            if (countError) throw countError;

            // Generate sequence
            const sequence = ((count || 0) + 1 + retryCount).toString().padStart(3, '0');
            generatedOrderId = `${sourceCode}${dateStr}${sequence}`;
        }

        // Get next global sequence number
        // Use maybeSingle() and filter nulls to get accurate max
        const { data: maxSeqData, error: seqError } = await supabase
            .from('orders')
            .select('sequence_number')
            .not('sequence_number', 'is', null)
            .order('sequence_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Log for debugging if there's an issue
        if (seqError) {
            console.error('[createOrderAction] Error fetching max sequence:', seqError);
        }

        const currentMaxSeq = maxSeqData?.sequence_number ?? 0;
        const nextSequenceNumber = currentMaxSeq + 1 + retryCount;

        // Prepare full order data
        const fullOrderData = {
            ...orderData,
            order_id: generatedOrderId,
            sequence_number: nextSequenceNumber,
            status: orderData.status || "confirmed",
            priority: orderData.priority || "normal",
            payment_status: orderData.payment_status || "cod",
            is_return: orderData.is_return || false,
            is_archived: false,
            // user_id is usually handled by RLS defaults, but we can set it if needed
        };

        // Insert order
        const { data, error: insertError } = await supabase
            .from("orders")
            .insert([fullOrderData])
            .select()
            .single();

        if (insertError) {
            // Handle duplicate key violation (23505)
            if (insertError.code === '23505' && retryCount < MAX_RETRIES) {
                // Recursive retry (calls logic again with higher retry count)
                // Note: We need to handle this carefully in Server Actions.
                // Recursion works fine here.
                return createOrderAction(orderData, retryCount + 1);
            }
            throw insertError;
        }

        return { success: true, data };
    } catch (err) {
        console.error("Error creating order (server action):", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to create order",
        };
    }
}
