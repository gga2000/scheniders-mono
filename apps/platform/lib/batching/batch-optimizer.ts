import { Order } from "@/types/order";
import {
  BatchConfig,
  BatchStrategy,
  STRATEGY_CONFIGS,
  OptimizedBatch,
  BatchPartition,
} from "./types";
import {
  buildSimilarityMatrix,
  getSimilarity,
  findMostSimilarOrders,
  calculateAverageSimilarity,
  extractSKUs,
} from "./sku-similarity";
import { optimizeSequence, countContextSwitches } from "./label-sequencer";
import { generatePickList } from "./pick-list-generator";
import { calculateEfficiencyScore } from "./batch-analytics";

/**
 * Main entry point: Create optimal batches from a list of orders
 */
export function createOptimalBatches(
  orders: Order[],
  strategy: BatchStrategy = 'auto',
  customConfig?: Partial<BatchConfig>
): OptimizedBatch[] {
  if (orders.length === 0) return [];

  // Merge strategy defaults with custom config
  const config: BatchConfig = {
    strategy,
    minBatchSize: 10,
    maxBatchSize: 30,
    similarityThreshold: 0.3,
    priorityWeight: 0.4,
    separateSingleItem: false,
    urgentOnly: false,
    ...STRATEGY_CONFIGS[strategy],
    ...customConfig,
  };

  // Special handling for product-grouped strategy
  if (strategy === 'product-grouped') {
    return createProductGroupedBatches(orders, config);
  }

  // Step 1: Partition orders by constraints
  const partitioned = partitionOrders(orders, config);

  // Step 2: Build similarity matrix
  const similarityMatrix = buildSimilarityMatrix(orders, config.similarityThreshold * 0.5);

  // Step 3: Generate batches for each partition
  const batches: OptimizedBatch[] = [];

  // Process urgent orders first
  if (partitioned.urgent.length > 0) {
    const urgentBatches = greedyCluster(partitioned.urgent, similarityMatrix, config);
    batches.push(...urgentBatches);
  }

  // Process high priority orders
  if (partitioned.highPriority.length > 0 && !config.urgentOnly) {
    const highPriorityBatches = greedyCluster(partitioned.highPriority, similarityMatrix, config);
    batches.push(...highPriorityBatches);
  }

  // Process normal priority orders
  if (partitioned.normal.length > 0 && !config.urgentOnly) {
    const normalBatches = greedyCluster(partitioned.normal, similarityMatrix, config);
    batches.push(...normalBatches);
  }

  // Step 4: Finalize batches (generate pick lists, sequences, metrics)
  return batches.map((batch, index) => finalizeBatch(batch, config, index));
}

/**
 * Partition orders by priority and single/multi-item
 */
function partitionOrders(orders: Order[], config: BatchConfig): BatchPartition {
  const partition: BatchPartition = {
    urgent: [],
    highPriority: [],
    normal: [],
  };

  // Separate single-item orders if configured
  let singleItemOrders: Order[] = [];
  let multiItemOrders: Order[] = [];

  if (config.separateSingleItem) {
    singleItemOrders = orders.filter(o => o.items.length === 1);
    multiItemOrders = orders.filter(o => o.items.length > 1);
  } else {
    multiItemOrders = orders;
  }

  // Partition multi-item orders by priority
  multiItemOrders.forEach(order => {
    if (order.priority === 'urgent') {
      partition.urgent.push(order);
    } else if (order.priority === 'high') {
      partition.highPriority.push(order);
    } else {
      partition.normal.push(order);
    }
  });

  // Add single-item orders to normal priority (they're quick to process)
  partition.normal.push(...singleItemOrders);

  return partition;
}

/**
 * Greedy clustering algorithm
 * Grows batches by selecting seeds and adding most similar orders
 */
function greedyCluster(
  orders: Order[],
  similarityMatrix: Map<string, any>,
  config: BatchConfig
): OptimizedBatch[] {
  if (orders.length === 0) return [];

  const batches: OptimizedBatch[] = [];
  const remaining = new Set(orders.map(o => o.id));

  while (remaining.size > 0) {
    const remainingOrders = orders.filter(o => remaining.has(o.id));

    // If remaining orders are fewer than min batch size, create one final batch
    if (remainingOrders.length <= config.minBatchSize) {
      if (remainingOrders.length > 0) {
        batches.push(createBatchFromOrders(remainingOrders, config));
        remainingOrders.forEach(o => remaining.delete(o.id));
      }
      break;
    }

    // Select seed order
    const seed = selectSeedOrder(remainingOrders, similarityMatrix, config);
    const batchOrders = [seed];
    remaining.delete(seed.id);

    // Grow batch by adding most similar orders
    while (batchOrders.length < config.maxBatchSize && remaining.size > 0) {
      const candidates = orders.filter(o => remaining.has(o.id));
      if (candidates.length === 0) break;

      // Find most similar order to current batch
      const nextOrder = findBestCandidateForBatch(
        batchOrders,
        candidates,
        similarityMatrix,
        config
      );

      if (!nextOrder) break; // No suitable candidates

      batchOrders.push(nextOrder);
      remaining.delete(nextOrder.id);

      // Stop if we reach min size and similarity starts dropping
      if (batchOrders.length >= config.minBatchSize) {
        const avgSimilarity = calculateAverageBatchSimilarity(batchOrders, similarityMatrix);
        if (avgSimilarity < config.similarityThreshold) {
          break;
        }
      }
    }

    batches.push(createBatchFromOrders(batchOrders, config));
  }

  return batches;
}

/**
 * Select best seed order for starting a new batch
 * Prefers orders with:
 * 1. High average similarity to remaining orders (good for clustering)
 * 2. More items (better for reuse)
 * 3. Higher value (if tie-breaking)
 */
function selectSeedOrder(
  orders: Order[],
  similarityMatrix: Map<string, any>,
  config: BatchConfig
): Order {
  if (orders.length === 0) throw new Error("Cannot select seed from empty order list");
  if (orders.length === 1) return orders[0];

  let bestScore = -1;
  let bestOrder = orders[0];

  orders.forEach(order => {
    // Calculate average similarity to all other orders
    const otherOrders = orders.filter(o => o.id !== order.id);
    const avgSimilarity = calculateAverageSimilarity(
      similarityMatrix,
      order.id,
      otherOrders.map(o => o.id)
    );

    // Factor in number of items
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // Weighted score
    const score = (avgSimilarity * 0.7) + (Math.min(itemCount / 10, 1) * 0.2) + (Math.min(order.price / 100000, 1) * 0.1);

    if (score > bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  });

  return bestOrder;
}

/**
 * Find best candidate order to add to a batch
 * Considers similarity to existing batch orders and priority
 */
function findBestCandidateForBatch(
  batchOrders: Order[],
  candidates: Order[],
  similarityMatrix: Map<string, any>,
  config: BatchConfig
): Order | null {
  if (candidates.length === 0) return null;

  let bestScore = -1;
  let bestOrder: Order | null = null;

  candidates.forEach(candidate => {
    // Calculate average similarity to batch
    const avgSimilarity = calculateAverageSimilarity(
      similarityMatrix,
      candidate.id,
      batchOrders.map(o => o.id)
    );

    // Priority bonus (if priorityWeight > 0)
    const priorityScore = getPriorityScore(candidate.priority);
    const priorityBonus = priorityScore * config.priorityWeight;

    // Combined score
    const score = (avgSimilarity * (1 - config.priorityWeight)) + priorityBonus;

    // Must meet minimum similarity threshold
    if (avgSimilarity >= config.similarityThreshold && score > bestScore) {
      bestScore = score;
      bestOrder = candidate;
    }
  });

  return bestOrder;
}

/**
 * Calculate average similarity of all orders in a batch
 */
function calculateAverageBatchSimilarity(
  orders: Order[],
  similarityMatrix: Map<string, any>
): number {
  if (orders.length < 2) return 1;

  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      totalSimilarity += getSimilarity(similarityMatrix, orders[i].id, orders[j].id);
      pairCount++;
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0;
}

/**
 * Get priority score for weighting
 */
function getPriorityScore(priority: string): number {
  switch (priority) {
    case 'urgent': return 1.0;
    case 'high': return 0.7;
    case 'normal': return 0.4;
    default: return 0.4;
  }
}

/**
 * Create batch from list of orders (incomplete batch structure)
 */
function createBatchFromOrders(orders: Order[], config: BatchConfig): OptimizedBatch {
  return {
    orders,
    pickList: [],
    sequence: [],
    efficiencyScore: 0,
    contextSwitches: 0,
    strategy: config.strategy,
    uniqueSkus: 0,
    totalItems: 0,
    totalValue: 0,
    cities: [],
    priorityBreakdown: {
      urgent: 0,
      high: 0,
      normal: 0,
    },
  };
}

/**
 * Finalize batch by generating pick list, sequence, and metrics
 */
function finalizeBatch(batch: OptimizedBatch, config: BatchConfig, index: number): OptimizedBatch {
  // Generate pick list
  const pickList = generatePickList(batch.orders);

  // Optimize sequence
  const sequence = optimizeSequence(batch.orders);

  // Count context switches
  const contextSwitches = countContextSwitches(batch.orders, sequence);

  // Calculate totals
  const totalItems = batch.orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  const totalValue = batch.orders.reduce((sum, order) => sum + order.price, 0);

  const cities = [...new Set(batch.orders.map(o => o.city).filter(Boolean))];

  // Calculate priority breakdown
  const priorityBreakdown = {
    urgent: batch.orders.filter(o => o.priority === 'urgent').length,
    high: batch.orders.filter(o => o.priority === 'high').length,
    normal: batch.orders.filter(o => o.priority === 'normal').length,
  };

  // Create finalized batch
  const finalizedBatch: OptimizedBatch = {
    ...batch,
    pickList,
    sequence,
    contextSwitches,
    uniqueSkus: pickList.length,
    totalItems,
    totalValue,
    cities: cities as string[],
    priorityBreakdown,
  };

  // Calculate efficiency score
  finalizedBatch.efficiencyScore = calculateEfficiencyScore(finalizedBatch);

  // Generate batch name
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  finalizedBatch.name = `Batch ${index + 1} - ${time} (${config.strategy})`;

  return finalizedBatch;
}

/**
 * Create a single batch from all orders (no clustering)
 * Useful for testing or when user wants one large batch
 */
export function createSingleBatch(orders: Order[], strategy: BatchStrategy = 'auto'): OptimizedBatch {
  const config: BatchConfig = {
    strategy,
    minBatchSize: orders.length,
    maxBatchSize: orders.length,
    similarityThreshold: 0,
    priorityWeight: 0.3,
    separateSingleItem: false,
    urgentOnly: false,
    ...STRATEGY_CONFIGS[strategy],
  };

  const batch = createBatchFromOrders(orders, config);
  return finalizeBatch(batch, config, 0);
}

/**
 * Create product-grouped batches
 * Groups orders by:
 * 1. Return orders together
 * 2. Single-product orders grouped by product/SKU
 * 3. Multi-item orders together
 */
function createProductGroupedBatches(orders: Order[], config: BatchConfig): OptimizedBatch[] {
  const batches: OptimizedBatch[] = [];
  let batchIndex = 0;

  // Category 1: Return orders (is_return = true)
  const returnOrders = orders.filter(o => o.is_return);
  if (returnOrders.length > 0) {
    const batch = createBatchFromOrders(returnOrders, config);
    const finalized = finalizeBatch(batch, config, batchIndex++);
    finalized.name = `Returns & Refunds (${returnOrders.length} orders)`;
    batches.push(finalized);
  }

  // Category 2: Single-product orders grouped by SKU/product
  const singleProductOrders = orders.filter(o => !o.is_return && o.items.length === 1);

  // Group by SKU/product
  const productGroups = new Map<string, Order[]>();
  singleProductOrders.forEach(order => {
    const skus = extractSKUs(order);
    const productKey = skus[0] || 'unknown'; // Single item, so first SKU

    if (productGroups.has(productKey)) {
      productGroups.get(productKey)!.push(order);
    } else {
      productGroups.set(productKey, [order]);
    }
  });

  // Create a batch for each product group
  productGroups.forEach((productOrders, productKey) => {
    // Split into smaller batches if group is too large
    const maxSize = config.maxBatchSize;
    for (let i = 0; i < productOrders.length; i += maxSize) {
      const batchOrders = productOrders.slice(i, i + maxSize);
      const batch = createBatchFromOrders(batchOrders, config);
      const finalized = finalizeBatch(batch, config, batchIndex++);

      // Get product name from first order
      const productName = batchOrders[0].items[0].name;
      finalized.name = `${productName} (${batchOrders.length} orders)`;

      batches.push(finalized);
    }
  });

  // Category 3: Multi-item orders together
  const multiItemOrders = orders.filter(o => !o.is_return && o.items.length > 1);
  if (multiItemOrders.length > 0) {
    // Split into batches if too large
    const maxSize = config.maxBatchSize;
    for (let i = 0; i < multiItemOrders.length; i += maxSize) {
      const batchOrders = multiItemOrders.slice(i, i + maxSize);
      const batch = createBatchFromOrders(batchOrders, config);
      const finalized = finalizeBatch(batch, config, batchIndex++);
      finalized.name = `Multi-Item Orders (${batchOrders.length} orders)`;
      batches.push(finalized);
    }
  }

  return batches;
}
