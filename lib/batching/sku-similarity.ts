import { Order, OrderItem } from "@/types/order";
import { SimilarityScore } from "./types";

/**
 * Extract all SKUs from an order's items
 * Falls back to product_id if SKU is missing
 * Falls back to normalized product name as last resort
 */
export function extractSKUs(order: Order): string[] {
  return order.items.map((item) => {
    if (item.sku) return item.sku;
    if (item.product_id) return `pid:${item.product_id}`;
    return `name:${normalizeProductName(item.name)}`;
  });
}

/**
 * Normalize product name for use as fallback SKU
 * Removes special characters, converts to lowercase, trims whitespace
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^\w\u0600-\u06FF-]/g, '') // Keep only alphanumeric, Arabic, and hyphens
    .substring(0, 50);              // Limit length
}

/**
 * Calculate Jaccard similarity between two SKU sets
 * Jaccard index = |A ∩ B| / |A ∪ B|
 * Returns value between 0 (no overlap) and 1 (identical)
 */
export function jaccardSimilarity(skusA: string[], skusB: string[]): number {
  if (skusA.length === 0 && skusB.length === 0) return 1; // Both empty = identical
  if (skusA.length === 0 || skusB.length === 0) return 0; // One empty = no similarity

  const setA = new Set(skusA);
  const setB = new Set(skusB);

  // Calculate intersection
  const intersection = new Set([...setA].filter(x => setB.has(x)));

  // Calculate union
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Calculate similarity score between two orders
 */
export function calculateSimilarity(orderA: Order, orderB: Order): SimilarityScore {
  const skusA = extractSKUs(orderA);
  const skusB = extractSKUs(orderB);

  const score = jaccardSimilarity(skusA, skusB);

  const setA = new Set(skusA);
  const setB = new Set(skusB);
  const commonSkus = [...setA].filter(x => setB.has(x));
  const totalSkus = new Set([...skusA, ...skusB]).size;

  return {
    orderAId: orderA.id,
    orderBId: orderB.id,
    score,
    commonSkus,
    totalSkus,
  };
}

/**
 * Build similarity matrix for all order pairs
 * Returns a Map with key format: "orderA_id-orderB_id" -> SimilarityScore
 * Only stores scores above threshold to save memory
 */
export function buildSimilarityMatrix(
  orders: Order[],
  threshold: number = 0.1
): Map<string, SimilarityScore> {
  const matrix = new Map<string, SimilarityScore>();

  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const score = calculateSimilarity(orders[i], orders[j]);

      // Only store if above threshold to save memory
      if (score.score >= threshold) {
        const key = `${orders[i].id}-${orders[j].id}`;
        matrix.set(key, score);
      }
    }
  }

  return matrix;
}

/**
 * Get similarity score between two orders from pre-computed matrix
 */
export function getSimilarity(
  matrix: Map<string, SimilarityScore>,
  orderAId: string,
  orderBId: string
): number {
  // Try both key orders since we only store one direction
  const key1 = `${orderAId}-${orderBId}`;
  const key2 = `${orderBId}-${orderAId}`;

  return matrix.get(key1)?.score ?? matrix.get(key2)?.score ?? 0;
}

/**
 * Find most similar orders to a given order
 * Returns sorted array of order IDs by similarity (highest first)
 */
export function findMostSimilarOrders(
  matrix: Map<string, SimilarityScore>,
  orderId: string,
  candidateIds: string[],
  limit?: number
): Array<{ orderId: string; score: number }> {
  const similarities = candidateIds
    .map((candidateId) => ({
      orderId: candidateId,
      score: getSimilarity(matrix, orderId, candidateId),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return limit ? similarities.slice(0, limit) : similarities;
}

/**
 * Calculate average similarity of an order to a set of orders
 * Useful for seed selection - orders with high average similarity are good seeds
 */
export function calculateAverageSimilarity(
  matrix: Map<string, SimilarityScore>,
  orderId: string,
  otherOrderIds: string[]
): number {
  if (otherOrderIds.length === 0) return 0;

  const sum = otherOrderIds.reduce(
    (acc, otherId) => acc + getSimilarity(matrix, orderId, otherId),
    0
  );

  return sum / otherOrderIds.length;
}

/**
 * Identify orders with no similar matches (orphans)
 * These should be grouped together or handled separately
 */
export function findOrphanOrders(
  matrix: Map<string, SimilarityScore>,
  orderIds: string[],
  minSimilarity: number = 0.1
): string[] {
  return orderIds.filter((orderId) => {
    const avgSimilarity = calculateAverageSimilarity(matrix, orderId, orderIds.filter(id => id !== orderId));
    return avgSimilarity < minSimilarity;
  });
}
