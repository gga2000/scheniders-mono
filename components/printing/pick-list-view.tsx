"use client";

import { useState } from "react";
import { OptimizedBatch, PickListItem } from "@/lib/batching/types";
import { motion } from "framer-motion";
import {
  CheckSquare,
  Square,
  Package,
  Download,
  Printer,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportPickListToCSV, exportPickListToText, groupPickListByCategory } from "@/lib/batching/pick-list-generator";

interface PickListViewProps {
  batch: OptimizedBatch;
  onClose?: () => void;
}

export function PickListView({ batch, onClose }: PickListViewProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByCategory, setGroupByCategory] = useState(true);

  const toggleItem = (sku: string) => {
    setCheckedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sku)) {
        newSet.delete(sku);
      } else {
        newSet.add(sku);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (checkedItems.size === batch.pickList.length) {
      setCheckedItems(new Set());
    } else {
      setCheckedItems(new Set(batch.pickList.map((item) => item.sku)));
    }
  };

  // Filter pick list by search query
  const filteredPickList = batch.pickList.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.sku.toLowerCase().includes(query) ||
      item.productName.toLowerCase().includes(query)
    );
  });

  // Group by category if enabled
  const groupedPickList = groupByCategory
    ? groupPickListByCategory(filteredPickList)
    : new Map([["All Items", filteredPickList]]);

  const totalChecked = checkedItems.size;
  const totalItems = batch.pickList.length;
  const progress = totalItems > 0 ? (totalChecked / totalItems) * 100 : 0;

  const handleExportCSV = () => {
    const csv = exportPickListToCSV(batch.pickList);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pick-list-${batch.name?.replace(/\s+/g, "-") || "batch"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    const text = exportPickListToText(batch.pickList);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pick-list-${batch.name?.replace(/\s+/g, "-") || "batch"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-6 h-6" />
              Pick List
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {batch.name || "Batch"} • {totalItems} unique SKUs
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">
              Progress: {totalChecked} / {totalItems}
            </span>
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search SKUs or products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleAll}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {checkedItems.size === totalItems ? (
              <>
                <Square className="w-4 h-4" />
                Uncheck All
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                Check All
              </>
            )}
          </button>

          <button
            onClick={() => setGroupByCategory(!groupByCategory)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              groupByCategory
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            )}
          >
            {groupByCategory ? "Grouped View" : "List View"}
          </button>

          <div className="flex-1" />

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>

          <button
            onClick={handleExportText}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            TXT
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg text-sm font-medium text-purple-700 dark:text-purple-300 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Pick List Items */}
      <div className="p-6 max-h-[60vh] overflow-y-auto">
        {filteredPickList.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No items match your search</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groupedPickList.entries()).map(([category, items]) => (
              <div key={category}>
                {groupByCategory && (
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <div className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                    {category}
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">
                      ({items.length} items)
                    </span>
                  </h3>
                )}

                <div className="space-y-2">
                  {items.map((item, index) => {
                    const isChecked = checkedItems.has(item.sku);

                    return (
                      <motion.button
                        key={item.sku}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => toggleItem(item.sku)}
                        className={cn(
                          "w-full p-4 rounded-lg border-2 transition-all text-left",
                          isChecked
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox */}
                          <div className="flex-shrink-0 mt-1">
                            {isChecked ? (
                              <CheckSquare className="w-6 h-6 text-green-600 dark:text-green-400" />
                            ) : (
                              <Square className="w-6 h-6 text-gray-400" />
                            )}
                          </div>

                          {/* Product Image */}
                          {item.imageUrl && (
                            <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          {/* Item Details */}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {item.productName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              SKU: {item.sku}
                            </div>
                          </div>

                          {/* Quantity Badge */}
                          <div className="flex-shrink-0 text-right">
                            <div className="inline-flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                              <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <div>
                                <div className="text-xl font-bold text-purple-700 dark:text-purple-300">
                                  {item.totalQuantity}
                                </div>
                                <div className="text-xs text-purple-600 dark:text-purple-400">
                                  {item.orderCount} order{item.orderCount !== 1 ? "s" : ""}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Summary */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalItems}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Unique SKUs
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {batch.pickList.reduce((sum, item) => sum + item.totalQuantity, 0)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Total Items
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {totalChecked}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Picked
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
