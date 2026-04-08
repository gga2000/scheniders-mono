"use client";

import { motion } from "framer-motion";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { Product, getStockStatus } from "@/lib/supabase";

interface LowStockAlertProps {
    products: Product[];
    onDismiss?: () => void;
    onViewProduct?: (product: Product) => void;
}

export function LowStockAlert({ products, onDismiss, onViewProduct }: LowStockAlertProps) {
    const lowStockProducts = products.filter(
        (p) => !p.is_archived && getStockStatus(p) !== "in_stock"
    );

    if (lowStockProducts.length === 0) return null;

    const outOfStock = lowStockProducts.filter((p) => getStockStatus(p) === "out_of_stock");
    const lowStock = lowStockProducts.filter((p) => getStockStatus(p) === "low_stock");

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative overflow-hidden rounded-2xl"
        >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-50 to-rose-50" />

            <div className="relative p-4 flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900">
                        Stock Alert
                    </h3>
                    <p className="text-sm text-amber-700 mt-0.5">
                        {outOfStock.length > 0 && (
                            <span className="font-medium text-rose-600">
                                {outOfStock.length} out of stock
                            </span>
                        )}
                        {outOfStock.length > 0 && lowStock.length > 0 && " • "}
                        {lowStock.length > 0 && (
                            <span className="font-medium text-amber-600">
                                {lowStock.length} low stock
                            </span>
                        )}
                    </p>

                    {/* Product list preview */}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {lowStockProducts.slice(0, 3).map((product) => (
                            <button
                                key={product.id}
                                onClick={() => onViewProduct?.(product)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${getStockStatus(product) === "out_of_stock"
                                        ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                    }`}
                            >
                                {product.name}
                                <span className="opacity-70">({product.stock_quantity})</span>
                            </button>
                        ))}
                        {lowStockProducts.length > 3 && (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs text-amber-600">
                                +{lowStockProducts.length - 3} more
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {onViewProduct && lowStockProducts.length > 0 && (
                        <button
                            onClick={() => onViewProduct(lowStockProducts[0])}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors"
                        >
                            View All
                            <ArrowRight className="w-3 h-3" />
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-amber-600" />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
