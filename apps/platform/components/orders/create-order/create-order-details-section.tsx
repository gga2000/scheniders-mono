"use client";

import { Input } from "@scheniders/ui/input";
import { Label } from "@scheniders/ui/label";
import { cn } from "@/lib/utils";
import { Package, X, Hash, AlertTriangle, Check, Store, Truck, Loader2, Sparkles, CalendarClock } from "lucide-react";
import { DateTimePicker } from "@scheniders/ui/datetime-picker";
import { formatScheduledDate } from "@/lib/order-format-utils";
import { ORDER_SOURCES } from "./use-create-order-model";
import type { CreateOrderModel } from "./use-create-order-model";

/** One section of CreateOrderModal. */
export function CreateOrderDetailsSection({ m }: { m: CreateOrderModel }) {
    const { t, orderType, formData, orderIdStatus, isCheckingId, isAnalyzingImage, uploadedImage, setShowBulkUpload, customCreatedAt, setCustomCreatedAt, postponeTo, handleOrderTypeChange, handleOrderIdChange, updateField, handleRemoveImage, handleImageUpload } = m;
    return (
        <>
            {/* Row 1: Order Type + Date/Time Picker */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => handleOrderTypeChange("delivery")}
                        className={cn(
                            "flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all",
                            orderType === "delivery"
                                ? "border-green-400 bg-green-50 text-green-700 shadow-sm"
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                        )}
                    >
                        <Truck className="h-3.5 w-3.5" />
                        {t("orders.create.typeDelivery")}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOrderTypeChange("shop")}
                        className={cn(
                            "flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all",
                            orderType === "shop"
                                ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                        )}
                    >
                        <Store className="h-3.5 w-3.5" />
                        {t("orders.create.typeShop")}
                    </button>
                </div>
                <DateTimePicker
                    value={customCreatedAt}
                    onChange={(iso) => setCustomCreatedAt(iso)}
                    showTime={true}
                />
            </div>
            {/* A future date postpones the order (scheduled_date); the
                placement date stays today. See routeCreateOrderDate. */}
            {postponeTo && (
                <p className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg -mt-2 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    {t("orders.create.scheduledNote", { date: formatScheduledDate(postponeTo) })}
                </p>
            )}
            {orderType === "shop" && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg -mt-2">
                    {t("orders.create.shopNote")}
                </p>
            )}

            {/* Row 2: Order ID + Source */}
            <div className="grid grid-cols-2 gap-3">
                {/* Order ID */}
                <div className="space-y-1">
                    <Label className="text-[11px] text-muted flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {t("orders.create.orderIdOptional")}
                    </Label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-mono">#</span>
                        <Input
                            value={formData.order_id || ""}
                            onChange={(e) => handleOrderIdChange(e.target.value)}
                            placeholder={t("orders.create.auto")}
                            dir="ltr"
                            className={cn(
                                "h-9 pl-7 rounded-lg font-mono text-sm",
                                orderIdStatus === "exists"
                                    ? "border-red-300 bg-red-50"
                                    : orderIdStatus === "available"
                                        ? "border-green-300 bg-green-50"
                                        : "border-[var(--card-border)] bg-[var(--background)]"
                            )}
                        />
                        {formData.order_id && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {isCheckingId ? (
                                    <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                ) : orderIdStatus === "available" ? (
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : orderIdStatus === "exists" ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                ) : null}
                            </div>
                        )}
                    </div>
                    {orderIdStatus === "exists" && (
                        <p className="text-[11px] text-red-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {t("orders.create.exists")}
                        </p>
                    )}
                </div>

                {/* Source - moved here from customer section */}
                <div className="space-y-1">
                    <Label className="text-[11px] text-muted">{t("orders.create.source")}</Label>
                    <div className="flex flex-wrap gap-1">
                        {ORDER_SOURCES.map((source) => (
                            <button
                                key={source.id}
                                type="button"
                                onClick={() => updateField("source", source.id)}
                                className={cn(
                                    "flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-all",
                                    formData.source === source.id
                                        ? "border-green-300 bg-green-50 text-green-700"
                                        : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                                )}
                                title={t(source.labelKey)}
                            >
                                <source.icon className={cn("h-3 w-3", formData.source === source.id ? source.color : "")} />
                                <span className="hidden sm:inline">{t(source.labelKey)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Row 3: AI Upload - Compact Strip */}
            <div className="space-y-1.5">
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="chat-image-upload"
                    disabled={isAnalyzingImage}
                />
                <label
                    htmlFor="chat-image-upload"
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed cursor-pointer transition-all",
                        isAnalyzingImage
                            ? "border-purple-300 bg-purple-50/50 cursor-wait"
                            : uploadedImage
                                ? "border-purple-400 bg-purple-50/50"
                                : "border-gray-300 bg-gray-50/30 hover:border-purple-400 hover:bg-purple-50/30"
                    )}
                >
                    {isAnalyzingImage ? (
                        <Loader2 className="h-4 w-4 text-purple-600 animate-spin shrink-0" />
                    ) : uploadedImage ? (
                        <div className="relative">
                            <img src={uploadedImage} alt="" className="w-8 h-8 rounded-lg object-cover border border-purple-300" />
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); handleRemoveImage(); }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                            >
                                <X className="h-2.5 w-2.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                            <Sparkles className="h-4 w-4 text-purple-600" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                            {isAnalyzingImage ? t("orders.create.analyzing") : uploadedImage ? t("orders.create.analyzed") : t("orders.create.uploadChat")}
                        </p>
                        {!isAnalyzingImage && !uploadedImage && (
                            <p className="text-[11px] text-gray-400 mt-0.5">{t("orders.create.uploadChatHint")}</p>
                        )}
                    </div>
                    {uploadedImage && !isAnalyzingImage && (
                        <Check className="h-4 w-4 text-purple-600 shrink-0" />
                    )}
                </label>
                <button
                    type="button"
                    onClick={() => setShowBulkUpload(true)}
                    className="text-[11px] text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 hover:underline transition-all"
                >
                    <Package className="h-3 w-3" />
                    {t("orders.create.bulkUpload")}
                </button>
            </div>
        </>
    );
}
