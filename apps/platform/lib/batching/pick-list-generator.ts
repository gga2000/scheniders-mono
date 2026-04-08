import { Order, OrderItem } from "@/types/order";
import { PickListItem } from "./types";
import { extractSKUs, normalizeProductName } from "./sku-similarity";

/**
 * Generate consolidated pick list for a batch of orders
 * Aggregates all items by SKU across all orders
 */
export function generatePickList(orders: Order[]): PickListItem[] {
  const skuMap = new Map<string, PickListItem>();

  // Aggregate items by SKU
  orders.forEach(order => {
    order.items.forEach(item => {
      // Determine SKU identifier (prefer actual SKU, fallback to product_id or name)
      const skuId = item.sku || (item.product_id ? `pid:${item.product_id}` : `name:${normalizeProductName(item.name)}`);

      if (skuMap.has(skuId)) {
        // Update existing entry
        const existing = skuMap.get(skuId)!;
        existing.totalQuantity += item.quantity;
        if (!existing.orderIds.includes(order.id)) {
          existing.orderIds.push(order.id);
          existing.orderCount++;
        }
      } else {
        // Create new entry
        skuMap.set(skuId, {
          sku: skuId,
          productName: item.name,
          totalQuantity: item.quantity,
          orderCount: 1,
          orderIds: [order.id],
          imageUrl: item.image_url,
        });
      }
    });
  });

  // Convert to array and sort by frequency (most common first)
  return Array.from(skuMap.values())
    .sort((a, b) => {
      // Primary sort: by order count (most orders first)
      if (b.orderCount !== a.orderCount) {
        return b.orderCount - a.orderCount;
      }
      // Secondary sort: by total quantity
      return b.totalQuantity - a.totalQuantity;
    });
}

/**
 * Group pick list items by product category/type
 * Useful if items have categories in the future
 * For now, groups by SKU prefix if available
 */
export function groupPickListByCategory(pickList: PickListItem[]): Map<string, PickListItem[]> {
  const groups = new Map<string, PickListItem[]>();

  pickList.forEach(item => {
    // Extract category from SKU prefix (e.g., "CLO-" from "CLO-001")
    const category = extractCategory(item.sku);

    if (groups.has(category)) {
      groups.get(category)!.push(item);
    } else {
      groups.set(category, [item]);
    }
  });

  return groups;
}

/**
 * Extract category from SKU
 * Looks for common patterns like "PREFIX-NUMBER"
 * Falls back to "Other" if no pattern found
 */
function extractCategory(sku: string): string {
  // Check for prefix patterns
  const prefixMatch = sku.match(/^([A-Z]{2,4})-/);
  if (prefixMatch) return prefixMatch[1];

  // Check for special prefixes
  if (sku.startsWith('pid:')) return 'Product ID';
  if (sku.startsWith('name:')) return 'By Name';

  return 'Other';
}

/**
 * Calculate pick list statistics
 */
export function calculatePickListStats(pickList: PickListItem[]) {
  return {
    totalUniqueSKUs: pickList.length,
    totalItems: pickList.reduce((sum, item) => sum + item.totalQuantity, 0),
    averageOrdersPerSKU: pickList.reduce((sum, item) => sum + item.orderCount, 0) / pickList.length || 0,
    mostCommonSKU: pickList.length > 0 ? pickList[0] : null,
    singleOrderSKUs: pickList.filter(item => item.orderCount === 1).length,
    multiOrderSKUs: pickList.filter(item => item.orderCount > 1).length,
  };
}

/**
 * Export pick list to CSV format
 */
export function exportPickListToCSV(pickList: PickListItem[]): string {
  const headers = ['SKU', 'Product Name', 'Total Quantity', 'Order Count', 'Order IDs'];
  const rows = pickList.map(item => [
    item.sku,
    item.productName,
    item.totalQuantity.toString(),
    item.orderCount.toString(),
    item.orderIds.join('; '),
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

/**
 * Export pick list to simple text format (printable checklist)
 */
export function exportPickListToText(pickList: PickListItem[]): string {
  const lines: string[] = [
    '===================================',
    '         PICK LIST                 ',
    '===================================',
    '',
  ];

  // Group by category
  const grouped = groupPickListByCategory(pickList);

  grouped.forEach((items, category) => {
    lines.push(`[${category}]`);
    lines.push('-----------------------------------');

    items.forEach(item => {
      lines.push(`☐ ${item.productName}`);
      lines.push(`  SKU: ${item.sku}`);
      lines.push(`  Qty: ${item.totalQuantity} (${item.orderCount} orders)`);
      lines.push('');
    });

    lines.push('');
  });

  // Add summary
  const stats = calculatePickListStats(pickList);
  lines.push('===================================');
  lines.push('SUMMARY');
  lines.push('===================================');
  lines.push(`Total unique SKUs: ${stats.totalUniqueSKUs}`);
  lines.push(`Total items to pick: ${stats.totalItems}`);
  lines.push(`SKUs in multiple orders: ${stats.multiOrderSKUs}`);
  lines.push(`SKUs in single order: ${stats.singleOrderSKUs}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Validate pick list against original orders
 * Ensures quantities match and no items are missing
 */
export function validatePickList(pickList: PickListItem[], orders: Order[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Calculate expected totals from orders
  const expected = new Map<string, { quantity: number; orders: Set<string> }>();

  orders.forEach(order => {
    order.items.forEach(item => {
      const skuId = item.sku || (item.product_id ? `pid:${item.product_id}` : `name:${normalizeProductName(item.name)}`);

      if (expected.has(skuId)) {
        const entry = expected.get(skuId)!;
        entry.quantity += item.quantity;
        entry.orders.add(order.id);
      } else {
        expected.set(skuId, {
          quantity: item.quantity,
          orders: new Set([order.id]),
        });
      }
    });
  });

  // Validate each pick list item
  pickList.forEach(item => {
    const expectedEntry = expected.get(item.sku);

    if (!expectedEntry) {
      errors.push(`Unexpected SKU in pick list: ${item.sku}`);
      return;
    }

    if (expectedEntry.quantity !== item.totalQuantity) {
      errors.push(
        `Quantity mismatch for ${item.sku}: expected ${expectedEntry.quantity}, got ${item.totalQuantity}`
      );
    }

    if (expectedEntry.orders.size !== item.orderCount) {
      errors.push(
        `Order count mismatch for ${item.sku}: expected ${expectedEntry.orders.size}, got ${item.orderCount}`
      );
    }
  });

  // Check for missing SKUs
  expected.forEach((_, sku) => {
    if (!pickList.some(item => item.sku === sku)) {
      errors.push(`Missing SKU in pick list: ${sku}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
