import { Order } from "@/types/order";
import { OptimizedBatch, PickListItem } from "./types";
import { extractSKUs } from "./sku-similarity";
import { countContextSwitches } from "./label-sequencer";

/**
 * Calculate efficiency score for a batch (0-100)
 * Higher score = better SKU reuse and fewer context switches
 *
 * Factors:
 * - SKU reuse: how many orders share SKUs
 * - Context switches: number of SKU transitions in sequence
 * - Batch size: larger batches with high reuse are better
 */
export function calculateEfficiencyScore(batch: OptimizedBatch): number {
  const { orders, pickList, sequence } = batch;

  if (orders.length === 0) return 0;
  if (orders.length === 1) return 100; // Single order = perfect (no switches)

  // Factor 1: SKU Reuse Score (0-40 points)
  const skuReuseScore = calculateSKUReuseScore(orders, pickList);

  // Factor 2: Context Switch Score (0-40 points)
  const contextSwitchScore = calculateContextSwitchScore(orders, sequence);

  // Factor 3: Batch Density Score (0-20 points)
  const densityScore = calculateBatchDensityScore(orders, pickList);

  // Total: 100 points
  const totalScore = skuReuseScore + contextSwitchScore + densityScore;

  return Math.min(100, Math.max(0, totalScore));
}

/**
 * Calculate SKU reuse score (0-40)
 * Measures how many SKUs appear in multiple orders
 */
function calculateSKUReuseScore(orders: Order[], pickList: PickListItem[]): number {
  if (pickList.length === 0) return 0;

  // Count SKUs that appear in multiple orders
  const multiOrderSKUs = pickList.filter(item => item.orderCount > 1).length;
  const reuseRatio = multiOrderSKUs / pickList.length;

  // Also consider average orders per SKU
  const avgOrdersPerSKU = pickList.reduce((sum, item) => sum + item.orderCount, 0) / pickList.length;
  const maxPossibleOrders = orders.length;
  const avgReuseRatio = avgOrdersPerSKU / maxPossibleOrders;

  // Combine both metrics (60% reuse ratio, 40% avg reuse)
  const score = (reuseRatio * 0.6 + avgReuseRatio * 0.4) * 40;

  return Math.round(score);
}

/**
 * Calculate context switch score (0-40)
 * Lower context switches = higher score
 */
function calculateContextSwitchScore(orders: Order[], sequence: string[]): number {
  const switches = countContextSwitches(orders, sequence);

  // Calculate theoretical minimum and maximum switches
  const totalSKUs = new Set(orders.flatMap(o => extractSKUs(o))).size;
  const minSwitches = Math.max(0, orders.length - 1); // Best case: all orders share all SKUs
  const maxSwitches = (orders.length - 1) * totalSKUs * 2; // Worst case: complete change each time

  if (maxSwitches === minSwitches) return 40; // Edge case

  // Normalize switches to 0-40 scale (fewer switches = higher score)
  const normalizedSwitches = (switches - minSwitches) / (maxSwitches - minSwitches);
  const score = (1 - normalizedSwitches) * 40;

  return Math.round(Math.max(0, Math.min(40, score)));
}

/**
 * Calculate batch density score (0-20)
 * Measures how "dense" the batch is (more items per order = better)
 */
function calculateBatchDensityScore(orders: Order[], pickList: PickListItem[]): number {
  if (orders.length === 0 || pickList.length === 0) return 0;

  const totalItems = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  const avgItemsPerOrder = totalItems / orders.length;
  const uniqueSKUs = pickList.length;

  // Higher items per order and higher SKU count = denser batch = better
  // Normalize to 0-20 scale
  const densityRatio = Math.min(1, avgItemsPerOrder / 5); // 5 items per order = max
  const skuRatio = Math.min(1, uniqueSKUs / 20); // 20 unique SKUs = max

  const score = (densityRatio * 0.6 + skuRatio * 0.4) * 20;

  return Math.round(score);
}

/**
 * Compare two batches and return improvement percentage
 */
export function compareBatches(
  optimizedBatch: OptimizedBatch,
  baselineOrders: Order[]
): {
  efficiencyImprovement: number;
  contextSwitchReduction: number;
  skuReuseImprovement: number;
} {
  // Calculate baseline metrics (FIFO sequence)
  const baselineSequence = baselineOrders.map(o => o.id);
  const baselineSwitches = countContextSwitches(baselineOrders, baselineSequence);

  // Optimized metrics
  const optimizedSwitches = optimizedBatch.contextSwitches;

  // Calculate improvements
  const contextSwitchReduction = baselineSwitches > 0
    ? ((baselineSwitches - optimizedSwitches) / baselineSwitches) * 100
    : 0;

  // For SKU reuse, compare unique SKUs vs multi-order SKUs
  const baselineMultiOrderSKUs = 0; // Baseline has no intentional reuse
  const optimizedMultiOrderSKUs = optimizedBatch.pickList.filter(item => item.orderCount > 1).length;

  const skuReuseImprovement = optimizedBatch.pickList.length > 0
    ? (optimizedMultiOrderSKUs / optimizedBatch.pickList.length) * 100
    : 0;

  return {
    efficiencyImprovement: optimizedBatch.efficiencyScore,
    contextSwitchReduction: Math.round(contextSwitchReduction),
    skuReuseImprovement: Math.round(skuReuseImprovement),
  };
}

/**
 * Generate batch summary statistics
 */
export function generateBatchSummary(batch: OptimizedBatch): {
  orderCount: number;
  uniqueSKUs: number;
  totalItems: number;
  totalValue: number;
  avgItemsPerOrder: number;
  avgValuePerOrder: number;
  multiOrderSKUs: number;
  singleOrderSKUs: number;
  skuReusePercentage: number;
  contextSwitches: number;
  avgSwitchesPerOrder: number;
} {
  const { orders, pickList, contextSwitches } = batch;

  const totalItems = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  const totalValue = orders.reduce((sum, order) => sum + order.price, 0);

  const multiOrderSKUs = pickList.filter(item => item.orderCount > 1).length;
  const singleOrderSKUs = pickList.filter(item => item.orderCount === 1).length;

  return {
    orderCount: orders.length,
    uniqueSKUs: pickList.length,
    totalItems,
    totalValue,
    avgItemsPerOrder: orders.length > 0 ? totalItems / orders.length : 0,
    avgValuePerOrder: orders.length > 0 ? totalValue / orders.length : 0,
    multiOrderSKUs,
    singleOrderSKUs,
    skuReusePercentage: pickList.length > 0 ? (multiOrderSKUs / pickList.length) * 100 : 0,
    contextSwitches,
    avgSwitchesPerOrder: orders.length > 1 ? contextSwitches / (orders.length - 1) : 0,
  };
}

/**
 * Estimate time savings from optimized batching
 * Based on typical packing times and context switch penalties
 */
export function estimateTimeSavings(
  batch: OptimizedBatch,
  baselineOrders: Order[],
  config: {
    avgItemPickTime: number;      // seconds per item
    contextSwitchPenalty: number; // seconds per SKU change
  } = {
    avgItemPickTime: 5,          // 5 seconds to pick each item
    contextSwitchPenalty: 3,     // 3 seconds per context switch
  }
): {
  baselineTime: number;    // seconds
  optimizedTime: number;   // seconds
  timeSaved: number;       // seconds
  percentageSaved: number; // percentage
} {
  // Calculate baseline time (FIFO sequence)
  const baselineSequence = baselineOrders.map(o => o.id);
  const baselineSwitches = countContextSwitches(baselineOrders, baselineSequence);

  const totalItems = baselineOrders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  const baselineTime = (totalItems * config.avgItemPickTime) + (baselineSwitches * config.contextSwitchPenalty);
  const optimizedTime = (totalItems * config.avgItemPickTime) + (batch.contextSwitches * config.contextSwitchPenalty);

  const timeSaved = baselineTime - optimizedTime;
  const percentageSaved = baselineTime > 0 ? (timeSaved / baselineTime) * 100 : 0;

  return {
    baselineTime: Math.round(baselineTime),
    optimizedTime: Math.round(optimizedTime),
    timeSaved: Math.round(timeSaved),
    percentageSaved: Math.round(percentageSaved),
  };
}

/**
 * Identify potential issues with a batch
 */
export function identifyBatchIssues(batch: OptimizedBatch): string[] {
  const issues: string[] = [];

  // Check for low efficiency
  if (batch.efficiencyScore < 30) {
    issues.push("Low efficiency score - consider using a different batching strategy");
  }

  // Check for high context switches
  const avgSwitches = batch.orders.length > 1 ? batch.contextSwitches / (batch.orders.length - 1) : 0;
  if (avgSwitches > 5) {
    issues.push("High number of context switches per order - SKU clustering may not be effective");
  }

  // Check for low SKU reuse
  const multiOrderSKUs = batch.pickList.filter(item => item.orderCount > 1).length;
  const reusePercentage = batch.pickList.length > 0 ? (multiOrderSKUs / batch.pickList.length) * 100 : 0;
  if (reusePercentage < 20) {
    issues.push("Low SKU reuse - orders may have very different items");
  }

  // Check for batch size issues
  if (batch.orders.length < 5) {
    issues.push("Small batch size - efficiency gains may be minimal");
  }

  // Check for priority mixing
  const hasPriorityMix = batch.priorityBreakdown.urgent > 0 &&
                         (batch.priorityBreakdown.normal > 0 || batch.priorityBreakdown.high > 0);
  if (hasPriorityMix) {
    issues.push("Batch mixes urgent and non-urgent orders - consider priority-first strategy");
  }

  return issues;
}
