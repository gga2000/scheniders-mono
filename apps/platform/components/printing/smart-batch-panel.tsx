"use client";

import { useState } from "react";
import { Order } from "@/types/order";
import { BatchStrategy } from "@/lib/batching/types";
import { useSmartBatching } from "@/hooks/use-smart-batching";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Package,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  Download,
  Eye,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Printer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { PickListView } from "./pick-list-view";
import { printBatchesWithSeparators, printSingleBatch, downloadBatchesAsPDF } from "@/lib/batch-printer";
import { LabelSettings } from "@/hooks/use-printing";

interface SmartBatchPanelProps {
  orders: Order[];
  labelSettings?: LabelSettings;
  onBatchSelect?: (batchIndex: number) => void;
  onBatchGenerated?: (batchCount: number) => void;
}

const STRATEGIES: Array<{
  value: BatchStrategy;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'product-grouped',
    label: 'Product-Grouped',
    description: 'Group by product: single items by product, multi-item together, returns together',
    icon: '📦',
  },
  {
    value: 'auto',
    label: 'Auto-Optimize',
    description: 'Balanced SKU clustering and priority respect',
    icon: '⚡',
  },
  {
    value: 'sku-heavy',
    label: 'SKU-Heavy',
    description: 'Maximize SKU reuse, minimize context switching',
    icon: '🎯',
  },
  {
    value: 'priority-first',
    label: 'Priority-First',
    description: 'Urgent orders first, then cluster by SKU',
    icon: '🔥',
  },
  {
    value: 'single-item',
    label: 'Single-Item Express',
    description: 'Separate single-item orders for quick processing',
    icon: '⚡',
  },
];

export function SmartBatchPanel({ orders, labelSettings, onBatchSelect, onBatchGenerated }: SmartBatchPanelProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<BatchStrategy>('product-grouped');
  const [batchSize, setBatchSize] = useState(50);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPickListModal, setShowPickListModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewBatchIndex, setPreviewBatchIndex] = useState<number | null>(null);

  const {
    suggestedBatches,
    selectedBatchIndex,
    isGenerating,
    error,
    generateBatches,
    selectBatch,
    exportPickList,
    getBatchAnalytics,
  } = useSmartBatching(orders);

  const handleGenerateBatches = async () => {
    try {
      const batches = await generateBatches(selectedStrategy, {
        maxBatchSize: batchSize,
      });
      if (onBatchGenerated) {
        onBatchGenerated(batches.length);
      }
    } catch (error) {
      console.error("Failed to generate batches:", error);
    }
  };

  const handleBatchSelect = (index: number) => {
    selectBatch(index);
    if (onBatchSelect) {
      onBatchSelect(index);
    }
  };

  const handlePrintBatch = async (batchIndex: number) => {
    const batch = suggestedBatches[batchIndex];
    if (!batch) return;

    const confirmed = window.confirm(
      `Print ${batch.name}?\n\n` +
      `${batch.orders.length} orders will be printed in optimized sequence.\n` +
      `${batch.uniqueSkus} unique products\n` +
      `${batch.contextSwitches} context switches`
    );

    if (!confirmed) return;

    try {
      const labelOpts = labelSettings || {
        size: "80x120",
        showQrCode: true,
        showBarcode: true,
        showPrice: true,
        isGift: false,
        showDeliveryLogo: true,
        showCompanyLogo: true,
      };

      await printSingleBatch(batch, labelOpts as any, "80x120", false);
    } catch (error) {
      console.error("Print error:", error);
      alert("Failed to print batch. Please try again.");
    }
  };

  const handlePrintAll = async () => {
    if (suggestedBatches.length === 0) return;

    const totalOrders = suggestedBatches.reduce((sum, b) => sum + b.orders.length, 0);

    const confirmed = window.confirm(
      `Print all ${suggestedBatches.length} batches with separator pages?\n\n` +
      `Total orders: ${totalOrders}\n` +
      `Separator pages (large X) will be inserted between batches.\n\n` +
      `Batches:\n` +
      suggestedBatches.map((b, i) => `${i + 1}. ${b.name} (${b.orders.length} orders)`).join('\n')
    );

    if (!confirmed) return;

    try {
      const labelOpts = labelSettings || {
        size: "80x120",
        showQrCode: true,
        showBarcode: true,
        showPrice: true,
        isGift: false,
        showDeliveryLogo: true,
        showCompanyLogo: true,
      };

      await printBatchesWithSeparators(suggestedBatches, labelOpts as any, "80x120");
    } catch (error) {
      console.error("Print error:", error);
      alert("Failed to print batches. Please try again.");
    }
  };

  const handleDownloadPDF = async () => {
    if (suggestedBatches.length === 0) return;

    const totalOrders = suggestedBatches.reduce((sum, b) => sum + b.orders.length, 0);

    try {
      const labelOpts = labelSettings || {
        size: "80x120",
        showQrCode: true,
        showBarcode: true,
        showPrice: true,
        isGift: false,
        showDeliveryLogo: true,
        showCompanyLogo: true,
      };

      await downloadBatchesAsPDF(suggestedBatches, labelOpts as any);

      // User will see print dialog - no need for alert
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download PDF. Please try again.");
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Smart Batching
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Optimize order grouping to minimize context switching
            </p>
          </div>
        </div>

        {suggestedBatches.length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {suggestedBatches.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Suggested Batches
            </div>
          </div>
        )}
      </div>

      {/* Strategy Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Batching Strategy
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {STRATEGIES.map((strategy) => (
            <button
              key={strategy.value}
              onClick={() => setSelectedStrategy(strategy.value)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all text-left",
                selectedStrategy === strategy.value
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{strategy.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">
                    {strategy.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {strategy.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <span>Advanced Settings</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              showAdvanced && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Batch Size: {batchSize} orders
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>10 orders</span>
                    <span>100 orders</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerateBatches}
        disabled={isGenerating || orders.length === 0}
        className={cn(
          "w-full py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2",
          isGenerating || orders.length === 0
            ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl"
        )}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating Optimal Batches...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Smart Batches ({orders.length} orders)
          </>
        )}
      </button>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-900 dark:text-red-200">
              Failed to generate batches
            </div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Suggested Batches */}
      {suggestedBatches.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Suggested Batches ({suggestedBatches.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadPDF()}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                onClick={() => handlePrintAll()}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
              >
                <Printer className="w-4 h-4" />
                Print All Batches (with separators)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestedBatches.map((batch, index) => {
              const analytics = getBatchAnalytics(batch);
              const isSelected = selectedBatchIndex === index;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleBatchSelect(index)}
                  className={cn(
                    "p-5 rounded-lg border-2 transition-all text-left relative overflow-hidden cursor-pointer",
                    isSelected
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg"
                      : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600"
                  )}
                >
                  {/* Batch Number Badge */}
                  <div className="absolute top-3 right-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                  </div>

                  {/* Batch Stats */}
                  <div className="space-y-3">
                    {/* Batch Name/Title */}
                    <div className="pr-10">
                      <h4 className="font-bold text-lg text-gray-900 dark:text-white truncate">
                        {batch.name || `Batch ${index + 1}`}
                      </h4>
                      {/* Show first few products */}
                      {batch.pickList.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {batch.pickList.slice(0, 2).map(item => item.productName).join(", ")}
                          {batch.pickList.length > 2 && ` +${batch.pickList.length - 2} more`}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                          {batch.orders.length}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Orders
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          Unique SKUs
                        </div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {batch.uniqueSkus}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          Total Value
                        </div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {formatIQD(batch.totalValue)}
                        </div>
                      </div>
                    </div>

                    {/* Efficiency Score */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Efficiency
                        </span>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span className="font-bold text-green-600 dark:text-green-400">
                            {batch.efficiencyScore}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                          style={{ width: `${batch.efficiencyScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Context Switches */}
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                      {batch.contextSwitches} context switches
                      {analytics.comparison.contextSwitchReduction > 0 && (
                        <span className="text-green-600 dark:text-green-400 ml-1">
                          (-{analytics.comparison.contextSwitchReduction}%)
                        </span>
                      )}
                    </div>

                    {/* Cities */}
                    {batch.cities.length > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        📍 {batch.cities.slice(0, 3).join(", ")}
                        {batch.cities.length > 3 && ` +${batch.cities.length - 3}`}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectBatch(index);
                          setShowPickListModal(true);
                        }}
                        className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <Package className="w-3 h-3" />
                        Pick List
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewBatchIndex(index);
                          setShowPreviewModal(true);
                        }}
                        className="flex-1 py-2 px-3 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded text-xs font-medium text-purple-700 dark:text-purple-300 transition-colors flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintBatch(index);
                      }}
                      className="w-full py-2 px-3 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                    >
                      <Printer className="w-3 h-3" />
                      Print This Batch
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pick List Modal */}
      <AnimatePresence>
        {showPickListModal && selectedBatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPickListModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl"
            >
              <PickListView
                batch={selectedBatch}
                onClose={() => setShowPickListModal(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreviewModal && previewBatchIndex !== null && suggestedBatches[previewBatchIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPreviewModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-6xl max-h-[90vh] overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {suggestedBatches[previewBatchIndex].name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {suggestedBatches[previewBatchIndex].orders.length} orders • {suggestedBatches[previewBatchIndex].uniqueSkus} unique products
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPreviewModal(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                  {suggestedBatches[previewBatchIndex].orders.map((order, idx) => (
                    <div
                      key={order.id}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {order.customer_name}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              #{order.order_id}
                            </span>
                          </div>
                          <div className="ml-8 space-y-1">
                            {order.items.map((item, itemIdx) => (
                              <div key={itemIdx} className="text-sm text-gray-700 dark:text-gray-300">
                                • {item.name} × {item.quantity}
                                {item.sku && <span className="text-xs text-gray-500 ml-2">({item.sku})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {formatIQD(order.price)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {order.city}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
