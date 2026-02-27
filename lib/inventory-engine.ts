import { supabase, OrderItem, Product, QCItem } from './supabase';

/**
 * Calculates the truly available stock (physical - reserved)
 */
export function getAvailableStock(product: Product): number {
    return Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
}

/**
 * Allocates stock when a new order is confirmed by increasing reserved_quantity.
 */
export async function allocateOrder(orderItems: OrderItem[]) {
    if (!orderItems || orderItems.length === 0) return { success: true };

    try {
        // In a real production system, this should ideally be an SQL RPC function
        // for atomicity to avoid race conditions. 
        // For now, we do updates one by one.
        for (const item of orderItems) {
            if (!item.product_id) continue;

            // Get current
            const { data: product } = await supabase
                .from('products')
                .select('reserved_quantity')
                .eq('id', item.product_id)
                .single();

            if (product) {
                await supabase
                    .from('products')
                    .update({
                        reserved_quantity: (product.reserved_quantity || 0) + item.quantity
                    })
                    .eq('id', item.product_id);
            }
        }
        return { success: true };
    } catch (e: any) {
        console.error("Failed to allocate order:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Fulfills an order when it's completed/delivered.
 * This drops both the physical stock AND the reserved stock,
 * meaning the "available" number remains unchanged, but the physical reality matches.
 */
export async function fulfillOrder(orderItems: OrderItem[]) {
    if (!orderItems || orderItems.length === 0) return { success: true };

    try {
        for (const item of orderItems) {
            if (!item.product_id) continue;

            const { data: product } = await supabase
                .from('products')
                .select('stock_quantity, reserved_quantity')
                .eq('id', item.product_id)
                .single();

            if (product) {
                await supabase
                    .from('products')
                    .update({
                        stock_quantity: Math.max(0, product.stock_quantity - item.quantity),
                        reserved_quantity: Math.max(0, (product.reserved_quantity || 0) - item.quantity)
                    })
                    .eq('id', item.product_id);
            }
        }
        return { success: true };
    } catch (e: any) {
        console.error("Failed to fulfill order:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Frees up reserved stock if an order is cancelled early on (before shipping/rejection).
 */
export async function releaseAllocation(orderItems: OrderItem[]) {
    if (!orderItems || orderItems.length === 0) return { success: true };

    try {
        for (const item of orderItems) {
            if (!item.product_id) continue;

            const { data: product } = await supabase
                .from('products')
                .select('reserved_quantity')
                .eq('id', item.product_id)
                .single();

            if (product) {
                await supabase
                    .from('products')
                    .update({
                        reserved_quantity: Math.max(0, (product.reserved_quantity || 0) - item.quantity)
                    })
                    .eq('id', item.product_id);
            }
        }
        return { success: true };
    } catch (e: any) {
        console.error("Failed to release allocation:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Moves items into the QC Quarantine table when an order is Rejected or Refunded.
 * It also frees up the reserved_quantity because the order is dead,
 * but physical stock is NOT touched yet until inspected.
 */
export async function quarantineOrder(orderId: string, orderItems: OrderItem[], reason: string) {
    if (!orderItems || orderItems.length === 0) return { success: true };

    try {
        const qcItems = orderItems
            .filter(item => item.product_id)
            .map(item => ({
                order_id: orderId,
                product_id: item.product_id,
                quantity: item.quantity,
                status: 'pending_inspection',
                reason: reason
            }));

        if (qcItems.length > 0) {
            await supabase.from('qc_quarantine').insert(qcItems);
        }

        // Free up the reserved stock because this order will never be completed normally
        await releaseAllocation(orderItems);

        return { success: true };
    } catch (e: any) {
        console.error("Failed to quarantine order:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Removes items from QC Quarantine when an order's rejected/cancelled status is reverted.
 */
export async function removeFromQuarantine(orderId: string) {
    try {
        await supabase
            .from('qc_quarantine')
            .delete()
            .eq('order_id', orderId)
            .eq('status', 'pending_inspection');

        return { success: true };
    } catch (e: any) {
        console.error("Failed to remove from quarantine:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Resolves a quarantined item.
 * @param qcItemId The ID in the qc_quarantine table
 * @param resolution 'restocked' or 'written_off'
 * @param productId The ID of the actual product
 * @param quantity How many units
 */
export async function resolveQuarantine(qcItemId: string, resolution: 'restocked' | 'written_off', productId: string, quantity: number) {
    try {
        await supabase
            .from('qc_quarantine')
            .update({
                status: resolution,
                resolved_at: new Date().toISOString()
            })
            .eq('id', qcItemId);

        // If the item is safe, we don't have to change physical stock,
        // Wait, physical stock wasn't deducted yet (it's only deducted on fulfillOrder).
        // Since it was cancelled/rejected and never fulfilled, physical stock is already correct.
        // Wait, if physical stock is "on the shelf", and the item was sent to the delivery company,
        // technically it left the shelf. BUT our simple model only drops physical stock upon "Completed/Delivered".
        // Therefore, if it was Rejected and comes back, the physical stock number hasn't dropped yet.
        // Wait, let's think: 
        // 1. Order Placed: Physical (No Math), Reserved (+1)
        // 2. Order Sent to Delivery: Physical (No Math), Reserved (Remains +1)
        // 3a. Order Delivered: Physical (-1), Reserved (-1)
        // 3b. Order Rejected: Reserved (-1). Physical stays identical. 
        // Wait, if it's discarded later because it's broken (Written Off), we MUST drop physical stock now!

        if (resolution === 'written_off') {
            const { data: product } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', productId)
                .single();

            if (product) {
                await supabase
                    .from('products')
                    .update({
                        stock_quantity: Math.max(0, product.stock_quantity - quantity)
                    })
                    .eq('id', productId);
            }
        }

        return { success: true };
    } catch (e: any) {
        console.error("Failed to resolve quarantine:", e);
        return { success: false, error: e.message };
    }
}

/**
 * BOM Rule: Auto-deducts supplies (Boxes, Sweets, etc) when an order is packed/completed.
 * Rule: 1 item = 1 Box, 1 Sweet, 1 Card, 1 Vial.
 * If 2 items = 2 Boxes, etc.
 */
export async function deductSupplies(orderItemCount: number) {
    if (orderItemCount <= 0) return { success: true };

    try {
        const { data: supplies } = await supabase
            .from('products')
            .select('id, stock_quantity')
            .eq('is_supply', true);

        if (!supplies || supplies.length === 0) return { success: true };

        // In a real app we'd map specific supply names/IDs, but per the brainstorm, 
        // we'll deduct standard quantities from all active supplies
        for (const supply of supplies) {
            await supabase
                .from('products')
                .update({ stock_quantity: Math.max(0, supply.stock_quantity - orderItemCount) })
                .eq('id', supply.id);
        }

        return { success: true };
    } catch (e: any) {
        console.error("Failed to deduct supplies:", e);
        return { success: false, error: e.message };
    }
}
