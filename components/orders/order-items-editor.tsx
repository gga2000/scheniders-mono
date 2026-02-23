"use client";

import { useLanguage } from "@/hooks/use-language";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Package, X } from "lucide-react";
import { DiscountBadge } from "./discount-badge";
import { DiscountPresetSelector } from "./discount-preset-selector";

interface OrderItemsEditorProps {
    isEditing: boolean;
    order: any;
    formData: any;
    updateFormData: (key: string, value: any) => void;
    handleAddItem: () => void;
    handleUpdateItemQuantity: (index: number, newQuantity: number) => void;
    handleRemoveItem: (index: number) => void;
}

export function OrderItemsEditor({
    isEditing,
    order,
    formData,
    updateFormData,
    handleAddItem,
    handleUpdateItemQuantity,
    handleRemoveItem
}: OrderItemsEditorProps) {
    const { t } = useLanguage();

    const displayValue = (key: string) => {
        if (isEditing && formData[key] !== undefined) {
            return formData[key];
        }
        return order?.[key];
    };

    return (
        <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                <Package className="h-4 w-4 text-muted" />
                <span className="font-semibold text-foreground">{t("orderDetail.products")}</span>
                <span className="text-xs text-muted">
                    {order.items?.length || 0} {t("orderDetail.item")}
                </span>
                {/* Add Product Button */}
                {isEditing && (
                    <button
                        className="ml-auto px-3 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-all flex items-center gap-1"
                        onClick={handleAddItem}
                    >
                        <span className="text-sm">+</span> {t("orderDetail.addProduct")}
                    </button>
                )}
            </div>
            <div className="divide-y divide-[var(--card-border)]">
                {(() => {
                    const itemsToShow = isEditing ? (formData.items || order.items || []) : (order.items || []);
                    return itemsToShow.length > 0 ? (
                        (itemsToShow as any[]).map((item, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 hover:bg-[var(--background)] transition-colors group">
                                {/* Product image */}
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-[var(--background)] flex items-center justify-center">
                                        <Package className="w-5 h-5 text-muted" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{item.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted">
                                        {isEditing ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleUpdateItemQuantity(index, item.quantity - 1)}
                                                    className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                                                    disabled={item.quantity <= 1}
                                                >
                                                    -
                                                </button>
                                                <span className="w-6 text-center font-medium">{item.quantity}</span>
                                                <button
                                                    onClick={() => handleUpdateItemQuantity(index, item.quantity + 1)}
                                                    className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ) : (
                                            <span>×{item.quantity}</span>
                                        )}
                                        <span>•</span>
                                        <span>{formatIQD(item.price)}</span>
                                    </div>
                                </div>
                                <span className="font-bold text-foreground font-mono">
                                    {formatIQD(item.price * item.quantity)}
                                </span>
                                {/* Remove Button - Show when editing */}
                                {isEditing && (
                                    <button
                                        className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-all flex items-center justify-center"
                                        onClick={() => handleRemoveItem(index)}
                                        title={t("orderDetail.deleteItem")}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="p-6 text-center text-muted">{t("orderDetail.noItems")}</div>
                    );
                })()}
            </div>
            {/* Discount + Total */}
            <div className="border-t border-[var(--card-border)]">
                {/* Discount Preset Selector (Edit Mode Only) */}
                {isEditing && (
                    <div className="px-4 py-3">
                        <DiscountPresetSelector
                            items={(formData.items || order.items || []) as any[]}
                            currentDiscount={(displayValue("discount_amount") as number) || 0}
                            onDiscountChange={(val) => updateFormData("discount_amount", val)}
                        />
                    </div>
                )}
                {/* Discount Row */}
                <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm text-muted">{t("orderDetail.customDiscount")}</span>
                    {isEditing ? (
                        <input
                            type="number"
                            value={(displayValue("discount_amount") as number) || 0}
                            onChange={(e) => updateFormData("discount_amount", Number(e.target.value))}
                            className="w-24 px-2 py-1 text-right bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                            placeholder="0"
                        />
                    ) : (
                        order.discount_amount ? (
                            <DiscountBadge
                                price={Number(order.price)}
                                discountAmount={order.discount_amount}
                                className="text-xs px-2.5 py-1"
                            />
                        ) : (
                            <span className="font-mono text-muted">—</span>
                        )
                    )}
                </div>
                {/* Total */}
                <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                    <span className="font-semibold text-foreground">{t("orderDetail.grandTotal")}</span>
                    {isEditing ? (
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={(displayValue("price") as number) || 0}
                                    onChange={(e) => updateFormData("price", Number(e.target.value))}
                                    className="w-28 px-3 py-1.5 text-right bg-white border border-[var(--card-border)] rounded-lg text-foreground font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-200"
                                    placeholder="0"
                                />
                                <span className="text-xs text-muted">IQD</span>
                            </div>
                            {/* Show calculated vs manual difference as audit trail */}
                            {(() => {
                                const items = (formData.items || order.items || []) as any[];
                                const calculatedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                const manualPrice = (displayValue("price") as number) || 0;
                                const diff = manualPrice - calculatedTotal;
                                if (diff !== 0) {
                                    return (
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <span className="text-muted">{t("orderDetail.calculated")} {formatIQD(calculatedTotal)}</span>
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded font-medium",
                                                diff > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                            )}>
                                                {diff > 0 ? "+" : ""}{formatIQD(diff)}
                                            </span>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    ) : (
                        <span className="text-lg font-bold text-foreground font-mono">
                            {formatIQD(Number(order.price) - (order.discount_amount || 0))}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
