"use client";

import { useState, useCallback, useMemo } from "react";
import { Order } from "@/types/order";
import { supabase } from "@/lib/supabase";
import {
  BatchStrategy,
  OptimizedBatch,
  BatchConfig,
} from "@/lib/batching/types";
import { createOptimalBatches, createSingleBatch } from "@/lib/batching/batch-optimizer";
import {
  generateBatchSummary,
  compareBatches,
  estimateTimeSavings,
  identifyBatchIssues,
} from "@/lib/batching/batch-analytics";
import { exportPickListToCSV, exportPickListToText } from "@/lib/batching/pick-list-generator";

export interface SmartBatchingState {
  suggestedBatches: OptimizedBatch[];
  selectedBatchIndex: number | null;
  isGenerating: boolean;
  error: string | null;
}

/**
 * Hook for smart batching functionality
 * Wraps the core batching algorithm with React state management
 */
export function useSmartBatching(orders: Order[]) {
  const [state, setState] = useState<SmartBatchingState>({
    suggestedBatches: [],
    selectedBatchIndex: null,
    isGenerating: false,
    error: null,
  });

  /**
   * Generate smart batches using the specified strategy
   */
  const generateBatches = useCallback(
    async (strategy: BatchStrategy, customConfig?: Partial<BatchConfig>) => {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));

      try {
        // Run algorithm (may take 1-2 seconds for 100+ orders)
        const batches = await Promise.resolve(
          createOptimalBatches(orders, strategy, customConfig)
        );

        setState(prev => ({
          ...prev,
          suggestedBatches: batches,
          selectedBatchIndex: batches.length > 0 ? 0 : null,
          isGenerating: false,
        }));

        return batches;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to generate batches";
        setState(prev => ({ ...prev, error: errorMessage, isGenerating: false }));
        throw error;
      }
    },
    [orders]
  );

  /**
   * Create a single batch from all orders
   */
  const generateSingleBatch = useCallback(
    async (strategy: BatchStrategy = 'auto') => {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));

      try {
        const batch = await Promise.resolve(createSingleBatch(orders, strategy));

        setState(prev => ({
          ...prev,
          suggestedBatches: [batch],
          selectedBatchIndex: 0,
          isGenerating: false,
        }));

        return batch;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to generate batch";
        setState(prev => ({ ...prev, error: errorMessage, isGenerating: false }));
        throw error;
      }
    },
    [orders]
  );

  /**
   * Save optimized batch to database (print_batches table)
   */
  const saveBatchToDatabase = useCallback(
    async (batch: OptimizedBatch, printType: string = 'label', invoiceTemplate?: string) => {
      try {
        const { data, error } = await supabase
          .from("print_batches")
          .insert({
            name: batch.name || `Batch ${Date.now()}`,
            order_count: batch.orders.length,
            total_value: batch.totalValue,
            cities: batch.cities,
            order_ids: batch.orders.map(o => o.id),
            invoice_template: invoiceTemplate,
            print_type: printType,
            // New fields for smart batching
            sequence_order: batch.sequence,
            pick_list: batch.pickList,
            efficiency_score: batch.efficiencyScore,
            strategy: batch.strategy,
            context_switches: batch.contextSwitches,
          })
          .select()
          .single();

        if (error) throw error;

        return data;
      } catch (error) {
        console.error("Error saving batch:", error);
        throw error;
      }
    },
    []
  );

  /**
   * Update orders with batch membership
   */
  const updateOrdersWithBatch = useCallback(
    async (orderIds: string[], batchId: string) => {
      try {
        const { error } = await supabase
          .from("orders")
          .update({ last_batch_id: batchId })
          .in("id", orderIds);

        if (error) throw error;
      } catch (error) {
        console.error("Error updating orders with batch:", error);
        throw error;
      }
    },
    []
  );

  /**
   * Export pick list in various formats
   */
  const exportPickList = useCallback(
    (batch: OptimizedBatch, format: 'csv' | 'text' = 'text') => {
      const content = format === 'csv'
        ? exportPickListToCSV(batch.pickList)
        : exportPickListToText(batch.pickList);

      // Download file
      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pick-list-${batch.name?.replace(/\s+/g, '-') || 'batch'}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    []
  );

  /**
   * Select a batch by index
   */
  const selectBatch = useCallback((index: number) => {
    setState(prev => ({ ...prev, selectedBatchIndex: index }));
  }, []);

  /**
   * Clear suggested batches
   */
  const clearBatches = useCallback(() => {
    setState({
      suggestedBatches: [],
      selectedBatchIndex: null,
      isGenerating: false,
      error: null,
    });
  }, []);

  /**
   * Get currently selected batch
   */
  const selectedBatch = useMemo(() => {
    if (state.selectedBatchIndex !== null && state.suggestedBatches[state.selectedBatchIndex]) {
      return state.suggestedBatches[state.selectedBatchIndex];
    }
    return null;
  }, [state.selectedBatchIndex, state.suggestedBatches]);

  /**
   * Calculate analytics for a batch
   */
  const getBatchAnalytics = useCallback((batch: OptimizedBatch) => {
    return {
      summary: generateBatchSummary(batch),
      comparison: compareBatches(batch, orders),
      timeSavings: estimateTimeSavings(batch, orders),
      issues: identifyBatchIssues(batch),
    };
  }, [orders]);

  /**
   * Get analytics for selected batch
   */
  const selectedBatchAnalytics = useMemo(() => {
    if (selectedBatch) {
      return getBatchAnalytics(selectedBatch);
    }
    return null;
  }, [selectedBatch, getBatchAnalytics]);

  return {
    // State
    suggestedBatches: state.suggestedBatches,
    selectedBatch,
    selectedBatchIndex: state.selectedBatchIndex,
    isGenerating: state.isGenerating,
    error: state.error,

    // Actions
    generateBatches,
    generateSingleBatch,
    saveBatchToDatabase,
    updateOrdersWithBatch,
    exportPickList,
    selectBatch,
    clearBatches,

    // Analytics
    getBatchAnalytics,
    selectedBatchAnalytics,
  };
}
