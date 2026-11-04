"use client";

import { Input } from "@scheniders/ui/input";
import { formatIQD, cn } from "@/lib/utils";
import { toWholeIqd } from "@/lib/order-money";
import { Package, Trash2, Truck, Pencil } from "lucide-react";
import { DiscountPresetSelector } from "../discount-preset-selector";
import type { CreateOrderModel } from "./use-create-order-model";
import { PrimeFeeLine } from "./prime-fee-line";

/** One section of CreateOrderModal. */
export function CreateOrderProductsSection({ m }: { m: CreateOrderModel }) {
    const { t, orderType, formData, errors, setShowProductPicker, discount, setDiscount, deliveryFee, setDeliveryFee, includeDeliveryFee, setIncludeDeliveryFee, editingPriceIndex, setEditingPriceIndex, updateItem, removeItem, subtotal, actualDeliveryFee, total } = m;
    return (
        <>
            {/* Products — Card */}
            <div className="rounded-xl border border-[var(--card-border)] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-b border-[var(--card-border)]">
                    <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-xs font-semibold text-foreground">{t("orders.create.products")}</span>
                        {formData.items.length > 0 && (
                            <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{formData.items.length}</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowProductPicker(true)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-all"
                    >
                        {t("orders.create.add")}
                    </button>
                </div>

                <div className="p-3">
                    {errors.items && (
                        <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg mb-2">{errors.items}</p>
                    )}

                    {formData.items.length === 0 ? (
                        <button
                            type="button"
                            onClick={() => setShowProductPicker(true)}
                            className={cn(
                                "w-full flex items-center justify-center gap-2 py-4 rounded-lg border border-dashed transition-all",
                                errors.items
                                    ? "border-red-300 bg-red-50/50 text-red-500 animate-shake"
                                    : "border-gray-200 bg-gray-50/30 text-gray-400 hover:border-green-300 hover:bg-green-50/30 hover:text-green-600"
                            )}
                            data-error={!!errors.items}
                        >
                            <Package className="w-4 h-4" />
                            <span className="text-xs font-medium">{t("orders.create.clickToAdd")}</span>
                        </button>
                    ) : (
                        <div className="space-y-1.5">
                            {formData.items.map((item, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-2.5 p-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                                        <Package className="w-4 h-4 text-purple-500" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-medium text-xs text-foreground truncate">{item.name}</p>
                                            <button
                                                type="button"
                                                onClick={() => updateItem(index, "is_open_box", !item.is_open_box)}
                                                className={cn(
                                                    "shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-semibold transition-all",
                                                    item.is_open_box
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                                )}
                                                title={item.is_open_box ? t("orders.create.openBox") : t("orders.create.newItem")}
                                            >
                                                {item.is_open_box ? t("orders.create.openBox") : t("orders.create.newItem")}
                                            </button>
                                        </div>
                                        {editingPriceIndex === index ? (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <Input
                                                    type="number"
                                                    value={item.price}
                                                    onChange={(e) => updateItem(index, "price", toWholeIqd(e.target.value))}
                                                    className="w-20 h-5 text-[11px] px-1.5 rounded border-green-300"
                                                    autoFocus
                                                    onBlur={() => setEditingPriceIndex(null)}
                                                    onKeyDown={(e) => e.key === "Enter" && setEditingPriceIndex(null)}
                                                />
                                                <span className="text-[11px] text-muted">x {item.quantity}</span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingPriceIndex(index)}
                                                className="text-[11px] text-muted hover:text-green-600 flex items-center gap-1 group"
                                            >
                                                {formatIQD(item.price)} x {item.quantity}
                                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <div className="flex items-center bg-white border border-[var(--card-border)] rounded-md">
                                            <button
                                                type="button"
                                                onClick={() => updateItem(index, "quantity", Math.max(1, item.quantity - 1))}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs"
                                            >
                                                -
                                            </button>
                                            <span className="w-5 text-center text-[11px] font-semibold">{item.quantity}</span>
                                            <button
                                                type="button"
                                                onClick={() => updateItem(index, "quantity", item.quantity + 1)}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs"
                                            >
                                                +
                                            </button>
                                        </div>

                                        <span className="text-xs font-bold text-foreground font-mono w-20 text-right">
                                            {formatIQD(item.price * item.quantity)}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            className="w-6 h-6 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-all"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pricing Summary — inside products card */}
                {formData.items.length > 0 && (
                    <div className="px-4 pb-4 space-y-2.5">
                        <div className="border-t border-[var(--card-border)] pt-3 space-y-2">
                            {/* Discount Preset */}
                            <DiscountPresetSelector
                                items={formData.items}
                                currentDiscount={discount}
                                onDiscountChange={setDiscount}
                            />

                            {/* Subtotal */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted">{t("orders.create.subtotal")}</span>
                                <span className="text-xs font-mono font-medium">{formatIQD(subtotal)}</span>
                            </div>

                            {/* Manual Discount */}
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted">{t("orders.create.discount")}</span>
                                <Input
                                    type="number"
                                    min="0"
                                    value={discount}
                                    onChange={(e) => setDiscount(toWholeIqd(e.target.value))}
                                    className="w-24 h-7 rounded-md border-[var(--card-border)] bg-white text-xs font-mono text-right"
                                    placeholder="0"
                                />
                            </div>

                            {/* Delivery Fee */}
                            {orderType === "delivery" && (
                                <div className="flex items-center justify-between gap-3 px-2.5 py-2 bg-blue-50/50 rounded-lg border border-blue-100/80">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={includeDeliveryFee}
                                            onChange={(e) => setIncludeDeliveryFee(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <Truck className="w-3 h-3 text-blue-500" />
                                        <span className="text-xs text-blue-700">{t("orders.create.typeDelivery")}</span>
                                    </label>
                                    {includeDeliveryFee && (
                                        <Input
                                            type="number"
                                            min="0"
                                            value={deliveryFee}
                                            onChange={(e) => setDeliveryFee(toWholeIqd(e.target.value))}
                                            className="w-20 h-6 rounded border-blue-200 bg-white text-[11px] font-mono text-right"
                                        />
                                    )}
                                </div>
                            )}

                            {/* Total */}
                            <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                                <span className="text-xs font-bold text-foreground">{t("orders.create.grandTotal")}</span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number"
                                        min="0"
                                        value={total}
                                        onChange={(e) => {
                                            const newTotal = toWholeIqd(e.target.value);
                                            const newDiscount = Math.max(0, Math.round(subtotal + actualDeliveryFee - newTotal));
                                            setDiscount(newDiscount);
                                        }}
                                        className="w-24 h-7 rounded-md border-[var(--card-border)] bg-white text-xs font-mono text-right font-bold text-green-700"
                                    />
                                    <span className="text-[11px] text-muted">IQD</span>
                                </div>
                            </div>

                            <PrimeFeeLine m={m} />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
