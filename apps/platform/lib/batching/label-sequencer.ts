import { Order } from "@/types/order";
import { SequenceTransition } from "./types";
import { extractSKUs } from "./sku-similarity";

/**
 * Calculate transition cost between two orders
 * Cost = number of SKU changes (SKUs added + SKUs removed)
 * Lower cost = fewer context switches
 */
export function calculateTransitionCost(orderA: Order, orderB: Order): number {
  const skusA = new Set(extractSKUs(orderA));
  const skusB = new Set(extractSKUs(orderB));

  // SKUs that need to be added when moving from A to B
  const addedSkus = [...skusB].filter(sku => !skusA.has(sku));

  // SKUs that are removed when moving from A to B
  const removedSkus = [...skusA].filter(sku => !skusB.has(sku));

  // Total cost is the sum of changes
  return addedSkus.length + removedSkus.length;
}

/**
 * Calculate detailed transition information between orders
 */
export function analyzeTransition(orderA: Order, orderB: Order): SequenceTransition {
  const skusA = new Set(extractSKUs(orderA));
  const skusB = new Set(extractSKUs(orderB));

  const addedSkus = [...skusB].filter(sku => !skusA.has(sku));
  const removedSkus = [...skusA].filter(sku => !skusB.has(sku));
  const commonSkus = [...skusA].filter(sku => skusB.has(sku));

  return {
    fromOrderId: orderA.id,
    toOrderId: orderB.id,
    cost: addedSkus.length + removedSkus.length,
    addedSkus,
    removedSkus,
    commonSkus,
  };
}

/**
 * Optimize order sequence using nearest-neighbor TSP approximation
 * Greedy algorithm: always pick the next order with lowest transition cost
 *
 * Time complexity: O(n²) where n = number of orders
 * This is acceptable for batches of 10-100 orders
 */
export function optimizeSequence(orders: Order[]): string[] {
  if (orders.length === 0) return [];
  if (orders.length === 1) return [orders[0].id];

  const visited = new Set<string>();
  const sequence: string[] = [];

  // Start with the order that has the most items (likely to share SKUs with others)
  let currentOrder = selectSeedOrder(orders);
  sequence.push(currentOrder.id);
  visited.add(currentOrder.id);

  // Greedily select next order with lowest transition cost
  while (visited.size < orders.length) {
    const remaining = orders.filter(o => !visited.has(o.id));

    // Find order with minimum transition cost from current
    let minCost = Infinity;
    let nextOrder: Order | null = null;

    for (const candidate of remaining) {
      const cost = calculateTransitionCost(currentOrder, candidate);
      if (cost < minCost) {
        minCost = cost;
        nextOrder = candidate;
      }
    }

    if (nextOrder) {
      sequence.push(nextOrder.id);
      visited.add(nextOrder.id);
      currentOrder = nextOrder;
    } else {
      // Shouldn't happen, but handle edge case
      break;
    }
  }

  return sequence;
}

/**
 * Select best seed order to start the sequence
 * Prioritizes orders with:
 * 1. More items (more likely to share SKUs)
 * 2. More common SKUs across the batch
 */
export function selectSeedOrder(orders: Order[]): Order {
  if (orders.length === 0) throw new Error("Cannot select seed from empty order list");
  if (orders.length === 1) return orders[0];

  // Count SKU frequency across all orders
  const skuFrequency = new Map<string, number>();
  orders.forEach(order => {
    const skus = extractSKUs(order);
    skus.forEach(sku => {
      skuFrequency.set(sku, (skuFrequency.get(sku) || 0) + 1);
    });
  });

  // Score each order based on:
  // - Number of items (more items = potentially more reuse)
  // - Sum of SKU frequencies (common SKUs = good seed)
  let bestScore = -1;
  let bestOrder = orders[0];

  orders.forEach(order => {
    const skus = extractSKUs(order);
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const skuFrequencySum = skus.reduce((sum, sku) => sum + (skuFrequency.get(sku) || 0), 0);

    // Weighted score: 40% item count, 60% SKU frequency
    const score = (itemCount * 0.4) + (skuFrequencySum * 0.6);

    if (score > bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  });

  return bestOrder;
}

/**
 * Count total context switches (SKU transitions) in a sequence
 * Lower is better
 */
export function countContextSwitches(orders: Order[], sequence: string[]): number {
  if (sequence.length <= 1) return 0;

  const orderMap = new Map(orders.map(o => [o.id, o]));
  let switches = 0;

  for (let i = 0; i < sequence.length - 1; i++) {
    const currentOrder = orderMap.get(sequence[i]);
    const nextOrder = orderMap.get(sequence[i + 1]);

    if (currentOrder && nextOrder) {
      const skusCurrent = new Set(extractSKUs(currentOrder));
      const skusNext = new Set(extractSKUs(nextOrder));

      // Count SKUs that changed
      const added = [...skusNext].filter(sku => !skusCurrent.has(sku)).length;
      const removed = [...skusCurrent].filter(sku => !skusNext.has(sku)).length;

      switches += added + removed;
    }
  }

  return switches;
}

/**
 * Analyze entire sequence and return transition details for each step
 * Useful for visualization
 */
export function analyzeSequence(orders: Order[], sequence: string[]): SequenceTransition[] {
  if (sequence.length <= 1) return [];

  const orderMap = new Map(orders.map(o => [o.id, o]));
  const transitions: SequenceTransition[] = [];

  for (let i = 0; i < sequence.length - 1; i++) {
    const currentOrder = orderMap.get(sequence[i]);
    const nextOrder = orderMap.get(sequence[i + 1]);

    if (currentOrder && nextOrder) {
      transitions.push(analyzeTransition(currentOrder, nextOrder));
    }
  }

  return transitions;
}

/**
 * Try to improve sequence using 2-opt local search
 * Swaps pairs of edges to reduce total cost
 * Optional: can be used to refine nearest-neighbor result
 */
export function twoOptImprovement(orders: Order[], sequence: string[], maxIterations: number = 10): string[] {
  if (sequence.length < 4) return sequence; // Need at least 4 orders for 2-opt

  const orderMap = new Map(orders.map(o => [o.id, o]));
  let improved = true;
  let iterations = 0;
  let currentSequence = [...sequence];

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < currentSequence.length - 2; i++) {
      for (let j = i + 2; j < currentSequence.length; j++) {
        // Calculate current cost of edges (i, i+1) and (j, j+1)
        const orderI = orderMap.get(currentSequence[i]);
        const orderI1 = orderMap.get(currentSequence[i + 1]);
        const orderJ = orderMap.get(currentSequence[j]);
        const orderJ1 = j + 1 < currentSequence.length ? orderMap.get(currentSequence[j + 1]) : null;

        if (!orderI || !orderI1 || !orderJ) continue;

        const currentCost = calculateTransitionCost(orderI, orderI1) +
                           (orderJ1 ? calculateTransitionCost(orderJ, orderJ1) : 0);

        // Calculate new cost if we reverse the segment between i+1 and j
        const newCost = calculateTransitionCost(orderI, orderJ) +
                       (orderJ1 ? calculateTransitionCost(orderI1, orderJ1) : 0);

        // If improvement, apply the swap
        if (newCost < currentCost) {
          // Reverse the segment between i+1 and j
          const newSequence = [
            ...currentSequence.slice(0, i + 1),
            ...currentSequence.slice(i + 1, j + 1).reverse(),
            ...currentSequence.slice(j + 1),
          ];
          currentSequence = newSequence;
          improved = true;
          break;
        }
      }
      if (improved) break; // Restart from beginning after improvement
    }
  }

  return currentSequence;
}
