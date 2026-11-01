import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, OrderItem, Product } from './supabase';

/**
 * Calculates the truly available stock (physical - reserved).
 *
 * NOTE: reserved/stock math (allocate, fulfill, release) is owned by the
 * `trg_inv_order_changed` trigger on the `orders` table. The previous app-layer
 * functions (allocateOrder / fulfillOrder / releaseAllocation) were removed so
 * inventory cannot be double-counted from any code path.
 *
 * What remains in this file are side-effects the trigger does NOT cover:
 *   - supplies / BOM deduction (supplies are not catalog products)
 */
export function getAvailableStock(product: Product): number {
    return Math.max(0, product.stock_quantity - (product.reserved_quantity || 0));
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
