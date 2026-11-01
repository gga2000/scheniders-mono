import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, OrderItem, Product } from './supabase';
import { productRepository } from './repositories/product-repository';

/**
 * Calculates the truly available stock (physical - reserved).
 *
 * NOTE: reserved/stock math (allocate, fulfill, release) is owned by the
 * `trg_inv_order_changed` trigger on the `orders` table. The previous app-layer
 * functions (allocateOrder / fulfillOrder / releaseAllocation) were removed so
 * inventory cannot be double-counted from any code path.
 *
 * What remains in this file are side-effects the trigger does NOT cover:
 *   - QC quarantine queue (quarantine / remove / resolve)
 *   - supplies / BOM deduction (supplies are not catalog products)
 */
export function getAvailableStock(product: Product): number {
    return Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
}

/**
 * Moves items into the QC Quarantine table when an order is Rejected or Refunded.
 * Reserved/stock math is handled by the DB trigger on `orders`; this only
 * records the returned items as needing inspection.
 *
 * `db` defaults to the browser client; server callers (the MCP tools) pass a
 * client carrying the user's own token so RLS still applies.
 */
export async function quarantineOrder(orderId: string, orderItems: OrderItem[], reason: string, tenantId: string, db: SupabaseClient = supabase) {
    if (!orderItems || orderItems.length === 0) return { success: true };

    try {
        const qcItems = orderItems
            .filter(item => item.product_id)
            .map(item => ({
                tenant_id: tenantId,
                order_id: orderId,
                product_id: item.product_id,
                quantity: item.quantity,
                status: 'pending_inspection',
                reason: reason
            }));

        if (qcItems.length > 0) {
            // RLS only admits rows stamped with the caller's store; without
            // tenant_id every insert was refused and the queue stayed empty.
            const { error } = await db.from('qc_quarantine').insert(qcItems);
            if (error) throw error;
        }

        return { success: true };
    } catch (e: any) {
        console.error("Failed to quarantine order:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Removes items from QC Quarantine when an order's rejected/cancelled status is reverted.
 */
export async function removeFromQuarantine(orderId: string, tenantId: string, db: SupabaseClient = supabase) {
    try {
        const { error } = await db
            .from('qc_quarantine')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('order_id', orderId)
            .eq('status', 'pending_inspection');
        if (error) throw error;

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
 *
 * A rejected/returned order never had its physical stock deducted under the
 * reserve-model (the trigger only drops stock on the FULFILLED phase: in_transit,
 * delivered, completed). So 'restocked' needs no stock change, while
 * 'written_off' / 'returned_to_supplier' must drop physical stock here.
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

        // Claim the item first, only while it is still open: a double click or a
        // second tab updates no row and so deducts nothing a second time.
        const { data: claimed, error: claimError } = await supabase
            .from('qc_quarantine')
            .update(updatePayload)
            .eq('id', qcItemId)
            .in('status', ['pending_inspection', 'in_inspection'])
            .select('id');
        if (claimError) throw claimError;
        if (!claimed || claimed.length === 0) throw new Error('Item is already resolved');

        const deductsPhysical = resolution === 'written_off' || resolution === 'returned_to_supplier';
        if (deductsPhysical) {
            try {
                await productRepository.adjustStock({ productId, delta: -quantity, reason: resolution });
            } catch (stockError) {
                // Stock did not move, so the item goes back to open for a retry.
                await supabase
                    .from('qc_quarantine')
                    .update({ status: 'pending_inspection', resolved_at: null })
                    .eq('id', qcItemId);
                throw stockError;
            }
        }

        return { success: true };
    } catch (e: any) {
        console.error("Failed to resolve quarantine:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Take used supplies out of stock through the same delta RPC the Products page
 * uses (`productRepository.adjustStock`), on the given client.
 */
async function useSupply(db: SupabaseClient, productId: string, quantity: number): Promise<void> {
    const { error } = await db.rpc('adjust_product_stock', {
        p_product_id: productId,
        p_delta: -quantity,
        p_reason: 'supply_used',
    });
    if (error) throw error;
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
export async function deductSupplies(input: DeductInput, tenantId: string, db: SupabaseClient = supabase) {
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

            const { data: rulesData, error: rulesError } = await db
                .from('bom_items')
                .select('product_id, supply_id, quantity, unit')
                .eq('tenant_id', tenantId)
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
                    for (const [supplyId, delta] of deductions) {
                        if (delta <= 0) continue;
                        await useSupply(db, supplyId, Math.ceil(delta));
                    }

                    return { success: true, via: 'bom' as const };
                }
                // Fell through: products had no matching rules; use legacy below.
            }
        }

        // Legacy fallback: deduct 1× line count from every active supply.
        if (legacyItemCount <= 0) return { success: true };

        const { data: supplies, error: suppliesError } = await db
            .from('products')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_supply', true);
        if (suppliesError) throw suppliesError;

        if (!supplies || supplies.length === 0) return { success: true };

        for (const supply of supplies) {
            await useSupply(db, supply.id, legacyItemCount);
        }

        return { success: true, via: 'legacy' as const };
    } catch (e: any) {
        console.error('Failed to deduct supplies:', e);
        return { success: false, error: e.message };
    }
}
