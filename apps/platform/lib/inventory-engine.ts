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

export type QCResolution = 'restocked' | 'written_off' | 'returned_to_supplier';

/**
 * Resolves a quarantined item.
 * `restocked` — item returned to sellable inventory (no stock change; was never deducted)
 * `written_off` — item destroyed / lost; physical stock deducted
 * `returned_to_supplier` — shipped back to supplier; physical stock deducted, RMA recorded
 */
export async function resolveQuarantine(
    qcItemId: string,
    resolution: QCResolution,
    productId: string,
    quantity: number,
    extras?: { rma_number?: string; credit_expected?: number; notes?: string }
) {
    try {
        const updatePayload: Record<string, any> = {
            status: resolution,
            resolved_at: new Date().toISOString(),
        };
        if (extras?.rma_number !== undefined) updatePayload.rma_number = extras.rma_number;
        if (extras?.credit_expected !== undefined) updatePayload.credit_expected = extras.credit_expected;
        if (extras?.notes !== undefined) updatePayload.notes = extras.notes;

        await supabase
            .from('qc_quarantine')
            .update(updatePayload)
            .eq('id', qcItemId);

        const deductsPhysical = resolution === 'written_off' || resolution === 'returned_to_supplier';
        if (deductsPhysical) {
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

type DeductInput = OrderItem[] | number;

interface BomRule {
    supply_id: string;
    quantity: number;
    unit: 'per_order' | 'per_item' | 'per_unit';
}

/**
 * Auto-deducts internal supplies (boxes, vials, inserts, etc.) when an order
 * reaches a terminal status (completed/delivered).
 *
 * The preferred caller signature passes the full {@link OrderItem}[] so BOM
 * rules defined in `bom_items` can be applied exactly:
 *
 *   - `per_order`: subtract the rule's quantity once per order
 *   - `per_item` : subtract it once per order line
 *   - `per_unit` : multiply by the line's ordered quantity
 *
 * If no BOM rules exist for any of the order's products, fall back to the
 * legacy naive rule (1 supply × line count across every active supply) so the
 * engine keeps working during the BOM rollout. The legacy numeric signature is
 * still supported for compatibility.
 */
export async function deductSupplies(input: DeductInput) {
    const items: OrderItem[] = Array.isArray(input)
        ? input.filter((i) => i.product_id)
        : [];
    const legacyItemCount =
        typeof input === 'number' ? input : items.length;

    if (items.length === 0 && legacyItemCount <= 0) {
        return { success: true };
    }

    try {
        // If we have the order items, try the BOM path first.
        if (items.length > 0) {
            const productIds = Array.from(
                new Set(items.map((i) => i.product_id).filter(Boolean) as string[])
            );

            const { data: rulesData, error: rulesError } = await supabase
                .from('bom_items')
                .select('product_id, supply_id, quantity, unit')
                .in('product_id', productIds);

            if (rulesError) throw rulesError;

            const rulesByProduct = new Map<string, BomRule[]>();
            for (const r of rulesData ?? []) {
                const list = rulesByProduct.get(r.product_id) ?? [];
                list.push({
                    supply_id: r.supply_id,
                    quantity: Number(r.quantity),
                    unit: r.unit,
                });
                rulesByProduct.set(r.product_id, list);
            }

            if (rulesData && rulesData.length > 0) {
                // Aggregate per supply across the order.
                const deductions = new Map<string, number>();
                const perOrderApplied = new Set<string>();

                for (const item of items) {
                    const pid = item.product_id!;
                    const qty = Math.max(1, item.quantity ?? 1);
                    const rules = rulesByProduct.get(pid);
                    if (!rules) continue;

                    for (const rule of rules) {
                        let multiplier = 0;
                        if (rule.unit === 'per_unit') {
                            multiplier = qty;
                        } else if (rule.unit === 'per_item') {
                            multiplier = 1;
                        } else if (rule.unit === 'per_order') {
                            const key = `${pid}:${rule.supply_id}`;
                            if (perOrderApplied.has(key)) continue;
                            perOrderApplied.add(key);
                            multiplier = 1;
                        }

                        const delta = rule.quantity * multiplier;
                        if (delta <= 0) continue;
                        deductions.set(
                            rule.supply_id,
                            (deductions.get(rule.supply_id) ?? 0) + delta
                        );
                    }
                }

                if (deductions.size > 0) {
                    const supplyIds = Array.from(deductions.keys());
                    const { data: supplies } = await supabase
                        .from('products')
                        .select('id, stock_quantity')
                        .in('id', supplyIds);

                    for (const supply of supplies ?? []) {
                        const delta = deductions.get(supply.id) ?? 0;
                        if (delta <= 0) continue;
                        const nextQty = Math.max(
                            0,
                            (supply.stock_quantity ?? 0) - Math.ceil(delta)
                        );
                        await supabase
                            .from('products')
                            .update({ stock_quantity: nextQty })
                            .eq('id', supply.id);
                    }

                    return { success: true, via: 'bom' as const };
                }
                // Fell through: products had no matching rules; use legacy below.
            }
        }

        // Legacy fallback: deduct 1× line count from every active supply.
        if (legacyItemCount <= 0) return { success: true };

        const { data: supplies } = await supabase
            .from('products')
            .select('id, stock_quantity')
            .eq('is_supply', true);

        if (!supplies || supplies.length === 0) return { success: true };

        for (const supply of supplies) {
            await supabase
                .from('products')
                .update({
                    stock_quantity: Math.max(
                        0,
                        supply.stock_quantity - legacyItemCount
                    ),
                })
                .eq('id', supply.id);
        }

        return { success: true, via: 'legacy' as const };
    } catch (e: any) {
        console.error('Failed to deduct supplies:', e);
        return { success: false, error: e.message };
    }
}
