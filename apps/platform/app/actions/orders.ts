"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { Order } from "@/lib/supabase";
import { triggerImmediateConfirmation } from "@/lib/whatsapp-dispatcher";

export async function createOrderAction(
    orderData: Omit<Order, "id" | "created_at" | "updated_at">,
    retryCount = 0
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const MAX_RETRIES = 5;
    const supabase = createSupabaseServiceClient();

    try {

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

        if (seqError) {
            throw seqError;
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
    keptItems: any[],
    returnedItems: any[]
): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = createSupabaseServiceClient();

    try {

        // 2. Fetch original order
        const { data: originalOrder, error: fetchError } = await supabase
            .from("orders")
            .select("*")
            .eq("id", originalOrderId)
            .single();

        if (fetchError || !originalOrder) {
            return { success: false, error: "Original order not found" };
        }

        // 3. Calculate financials
        const calculateTotal = (items: any[]) => items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const keptTotal = calculateTotal(keptItems);
        const returnedTotal = calculateTotal(returnedItems);

        // Proportional discount logic
        const totalOriginal = keptTotal + returnedTotal;
        const keptRatio = totalOriginal > 0 ? keptTotal / totalOriginal : 1;

        const originalDiscount = originalOrder.discount_amount || 0;
        const newDiscount = Math.round(originalDiscount * keptRatio);
        const returnDiscount = originalDiscount - newDiscount;

        const newPrice = keptTotal + (originalOrder.delivery_fee || 0) - newDiscount;
        const returnPrice = returnedTotal - returnDiscount; // Price for return order usually represents the value of returned items

        // 4. Update Original Order (The Kept Part)
        // CRITICAL: Explicitly update 'items' column
        const { error: updateError } = await supabase
            .from("orders")
            .update({
                items: keptItems,
                price: newPrice,
                discount_amount: newDiscount,
                status: 'delivered', // Mark as successfully delivered
                delivered_at: new Date().toISOString(),
            })
            .eq("id", originalOrderId);

        if (updateError) {
            throw new Error("Failed to update original order: " + updateError.message);
        }

        // 5. Create Return Order
        // Prepare data for the new order
        const returnOrderData = {
            ...originalOrder,
            id: undefined, // Let DB generate
            created_at: undefined, // Let DB generate
            updated_at: undefined,
            order_id: undefined, // Let createOrderAction generate
            items: returnedItems,
            price: returnPrice,
            discount_amount: returnDiscount,
            status: 'rejected',
            is_return: true,
            original_order_id: originalOrder.id,
            rejection_reason: 'Partial Return',

            // Reset/Sanitize fields
            whatsapp_link: originalOrder.whatsapp_link || undefined,
            scheduled_date: originalOrder.scheduled_date || undefined,
            delivery_slot: originalOrder.delivery_slot || undefined,
            governorate_code: originalOrder.governorate_code || undefined,
            validated_governorate_code: originalOrder.validated_governorate_code || undefined,
            city: originalOrder.city || undefined,
            address_details: originalOrder.address_details || undefined,

            // Clear unique tracking fields
            last_batch_id: undefined,
            delivery_order_id: undefined,
            sequence_number: undefined,
            delivered_at: undefined,
            cancelled_at: undefined,
            printed_at: undefined,
            print_count: 0,
        };

        // Pass to createOrderAction to handle ID generation and insertion
        // ignore ID types since we spread originalOrder which has them
        const returnOrderDataAny = returnOrderData as any;
        delete returnOrderDataAny.id;
        delete returnOrderDataAny.created_at;
        delete returnOrderDataAny.updated_at;

        const { success: createSuccess, data: createdReturnOrder, error: createError } = await createOrderAction(returnOrderDataAny);

        if (!createSuccess) {
            throw new Error("Failed to create return order: " + createError);
        }

        // Trigger WhatsApp confirmation immediately in the background for the new return order
        if (createdReturnOrder && createdReturnOrder.id) {
            await triggerImmediateConfirmation(createdReturnOrder.id, createdReturnOrder.phone);
        }

        return { success: true, data: createdReturnOrder };

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to split order";
        return { success: false, error: errorMessage };
    }
}

export async function checkOrderIdExists(orderId: string, excludeUuid?: string): Promise<boolean> {
    const supabase = createSupabaseServiceClient();

    try {
        let query = supabase
            .from("orders")
            .select("id")
            .eq("order_id", orderId);

        if (excludeUuid) {
            query = query.neq("id", excludeUuid);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    } catch {
        return false;
    }
}
