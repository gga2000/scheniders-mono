import { Order } from "@/types/order";

/**
 * Batching strategy types
 */
export type BatchStrategy =
  | 'auto'            // Balanced: 60% SKU similarity, 40% priority
  | 'sku-heavy'       // Focus: 90% SKU similarity, 10% priority
  | 'priority-first'  // Focus: 80% priority, 20% SKU similarity
  | 'single-item'     // Separate single-item from multi-item orders
  | 'product-grouped'; // Group by product: single-product orders by product, multi-item together, returns together

/**
 * Configuration for batch generation
 */
export interface BatchConfig {
  strategy: BatchStrategy;
  minBatchSize: number;      // Minimum orders per batch (default: 10)
  maxBatchSize: number;      // Maximum orders per batch (default: 30)
  similarityThreshold: number; // Jaccard similarity threshold 0-1 (default: 0.3)
  priorityWeight: number;    // How much to weight priority vs SKU similarity 0-1 (default: 0.4)
  separateSingleItem: boolean; // Separate single-item orders (default: false)
  urgentOnly: boolean;       // Only process urgent orders (default: false)
}

/**
 * Default configurations for each strategy
 */
export const STRATEGY_CONFIGS: Record<BatchStrategy, Partial<BatchConfig>> = {
  auto: {
    similarityThreshold: 0.3,
    priorityWeight: 0.4,
    minBatchSize: 15,
    maxBatchSize: 30,
    separateSingleItem: false,
  },
  'sku-heavy': {
    similarityThreshold: 0.5,
    priorityWeight: 0.1,
    minBatchSize: 10,
    maxBatchSize: 25,
    separateSingleItem: false,
  },
  'priority-first': {
    similarityThreshold: 0.2,
    priorityWeight: 0.8,
    minBatchSize: 15,
    maxBatchSize: 30,
    separateSingleItem: false,
  },
  'single-item': {
    similarityThreshold: 0.2,
    priorityWeight: 0.3,
    minBatchSize: 20,
    maxBatchSize: 100,
    separateSingleItem: true,
  },
  'product-grouped': {
    similarityThreshold: 1.0, // Exact match for single-product grouping
    priorityWeight: 0.2,
    minBatchSize: 5,
    maxBatchSize: 50,
    separateSingleItem: true,
  },
};

/**
 * Pick list item - represents a consolidated SKU across multiple orders
 */
export interface PickListItem {
  sku: string;              // SKU code or fallback identifier
  productName: string;      // Human-readable product name
  totalQuantity: number;    // Total quantity needed across all orders
  orderCount: number;       // Number of orders that need this SKU
  orderIds: string[];       // Order IDs that contain this SKU
  imageUrl?: string;        // Product image for visual reference
}

/**
 * Optimized batch with pick list and sequence
 */
export interface OptimizedBatch {
  id?: string;              // Batch ID (if saved to database)
  name?: string;            // Human-readable batch name
  orders: Order[];          // Orders in this batch
  pickList: PickListItem[]; // Consolidated pick list
  sequence: string[];       // Order IDs in optimized print sequence
  efficiencyScore: number;  // 0-100 score based on SKU reuse
  contextSwitches: number;  // Number of SKU transitions in sequence
  strategy: BatchStrategy;  // Strategy used to create this batch
  uniqueSkus: number;       // Number of unique SKUs in batch
  totalItems: number;       // Total item count across all orders
  totalValue: number;       // Combined order value
  cities: string[];         // Unique cities in batch
  priorityBreakdown: {      // Priority distribution
    urgent: number;
    high: number;
    normal: number;
  };
}

/**
 * SKU similarity score between two orders
 */
export interface SimilarityScore {
  orderAId: string;
  orderBId: string;
  score: number;            // Jaccard similarity 0-1
  commonSkus: string[];     // SKUs shared between orders
  totalSkus: number;        // Total unique SKUs across both orders
}

/**
 * Batch partition by priority
 */
export interface BatchPartition {
  urgent: Order[];
  highPriority: Order[];
  normal: Order[];
}

/**
 * Transition between orders in sequence
 */
export interface SequenceTransition {
  fromOrderId: string;
  toOrderId: string;
  cost: number;             // Transition cost (number of SKU changes)
  addedSkus: string[];      // New SKUs introduced in toOrder
  removedSkus: string[];    // SKUs from fromOrder not in toOrder
  commonSkus: string[];     // SKUs shared between orders
}
