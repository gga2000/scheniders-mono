"use client";

import { useLanguage } from "@/hooks/use-language";
import { formatPhoneForDisplay, validatePhoneDetailed } from "@/lib/order-utils";
import { extractGovernorate, getAllGovernorateCodes } from "@/lib/address-validator";
import { generateWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Banknote, Calendar, Clock, Globe, MapPin, MessageCircle, Phone, Truck, User, CheckCircle, XCircle } from "lucide-react";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import type { OrderStatus } from "@/lib/supabase";

interface OrderCustomerCardProps {
    isEditing: boolean;
    order: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    formData: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    updateFormData: (key: string, value: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
    onStatusUpdate?: (orderId: string, status: OrderStatus, reason?: string) => Promise<{ success: boolean; error?: string }>;
    isUpdatingStatus: boolean;
    handleStatusChange: (status: OrderStatus) => void;
}

export function OrderCustomerCard({
    isEditing,
    order,
    formData,
    updateFormData,
    onStatusUpdate,
    isUpdatingStatus,
    handleStatusChange
}: OrderCustomerCardProps) {
    const { t } = useLanguage();
    const governorates = getAllGovernorateCodes();

    const displayValue = (key: string) => {
        if (isEditing && formData[key] !== undefined) {
            return formData[key];
        }
        return order?.[key];
    };

    const handleWhatsApp = () => {
        console.log('[WhatsApp] Button clicked', {
            phone: order.phone,
            isValid: validatePhoneDetailed(order.phone).isValid,
            orderId: order.order_id
        });

        try {
            const link = generateWhatsAppLink(
                order.phone,
                `مرحباً، بخصوص طلب ${order.order_id}`
            );
            console.log('[WhatsApp] Generated link:', link);

            const newWindow = window.open(link, "_blank");

            // Check if popup was blocked
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                console.warn('[WhatsApp] Popup blocked by browser');
                // Fallback: copy to clipboard
                navigator.clipboard.writeText(link).then(() => {
                    alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                }).catch(() => {
                    alert(`Popup blocked. Please allow popups or copy this link manually:\n${link}`);
                });
            } else {
                console.log('[WhatsApp] Window opened successfully');
            }
        } catch (error) {
            console.error('[WhatsApp] Error:', error);
            alert('حدث خطأ عند فتح واتساب. يرجى التحقق من رقم الهاتف.');
        }
    };

    const handleSecondaryWhatsApp = () => {
        if (!order.secondary_phone) return;

        console.log('[WhatsApp] Secondary phone button clicked', {
            phone: order.secondary_phone,
            isValid: validatePhoneDetailed(order.secondary_phone).isValid
        });

        try {
            const link = generateWhatsAppLink(
                order.secondary_phone,
                `مرحباً، بخصوص طلب ${order.order_id}`
            );
            const newWindow = window.open(link, "_blank");

            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                navigator.clipboard.writeText(link).then(() => {
                    alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                }).catch(() => {
                    alert(`Popup blocked. Link: ${link}`);
                });
            }
        } catch (error) {
            console.error('[WhatsApp] Error:', error);
            alert('حدث خطأ عند فتح واتساب.');
        }
    };

    return (
        <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden order-detail-customer">
            <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted" />
                    <span className="font-semibold text-foreground">{t("orderDetail.customerInfo")}</span>
                </div>
                {/* Refund Status Buttons - Only for return orders in return_pending status */}
                {order.is_return && order.status === "return_pending" && onStatusUpdate && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleStatusChange("refund_delivered")}
                            disabled={isUpdatingStatus}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all text-xs font-medium disabled:opacity-50"
                        >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t("orderDetail.refundDelivered")}
                        </button>
                        <button
                            onClick={() => handleStatusChange("refund_failed")}
                            disabled={isUpdatingStatus}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all text-xs font-medium disabled:opacity-50"
                        >
                            <XCircle className="h-3.5 w-3.5" />
                            {t("orderDetail.refundFailed")}
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 grid gap-4">
                {/* Row 1: Name, Governorate, Governorate Code - 3 equal columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Name */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.name")}</span>
                        {isEditing ? (
                            <input
                                value={displayValue("customer_name") as string}
                                onChange={(e) => updateFormData("customer_name", e.target.value)}
                                className="w-full h-[38px] px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                            />
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                            </div>
                        )}
                    </div>
                    {/* Governorate */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.province")}</span>
                        {isEditing ? (
                            <div className="relative">
                                <select
                                    value={(displayValue("city") || "") as string}
                                    onChange={(e) => {
                                        const selectedGov = governorates.find(g => g.nameAr === e.target.value);
                                        updateFormData("city", e.target.value);
                                        // Auto-update governorate code when city is selected
                                        if (selectedGov) {
                                            updateFormData("governorate_code", selectedGov.code);
                                        }
                                    }}
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                >
                                    <option value="" disabled>{t("orderDetail.selectProvince")}</option>
                                    {governorates.map((gov) => (
                                        <option key={gov.code} value={gov.nameAr}>
                                            {gov.nameAr}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <p className="text-sm font-medium text-foreground">{order.city || "—"}</p>
                            </div>
                        )}
                    </div>
                    {/* Governorate Code */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.provinceCode")}</span>
                        {isEditing ? (
                            <div className="relative">
                                <select
                                    value={(displayValue("governorate_code") || "") as string}
                                    onChange={(e) => {
                                        updateFormData("governorate_code", e.target.value);
                                    }}
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                >
                                    <option value="">{t("orderDetail.noCode")}</option>
                                    {governorates.map((gov) => (
                                        <option key={gov.code} value={gov.code}>
                                            {gov.code} - {gov.nameAr}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <p className="text-sm font-medium text-foreground font-mono">
                                    {(() => {
                                        const code = order.governorate_code || order.validated_governorate_code;
                                        if (code) return code;
                                        // If not stored, extract from city
                                        if (order.city) {
                                            const { governorate } = extractGovernorate(order.city, undefined, order.address_details);
                                            if (governorate?.code) return governorate.code;
                                        }
                                        return <span className="text-muted">—</span>;
                                    })()}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 2: Full Address */}
                <div>
                    <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1">
                        <MapPin className="h-3 w-3" />
                        {t("orderDetail.fullAddress")}
                        {(!order.address_details || order.address_details.trim() === '') && (
                            <span className="relative flex h-2.5 w-2.5 ml-1" title="لا يوجد تفاصيل عنوان">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                            </span>
                        )}
                    </span>
                    {isEditing ? (
                        <textarea
                            value={(displayValue("address_details") || "") as string}
                            onChange={(e) => updateFormData("address_details", e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] resize-none"
                        />
                    ) : (
                        <p className="text-sm font-medium text-foreground bg-[var(--background)] border border-[var(--card-border)] px-3 py-2.5 rounded-lg leading-relaxed min-h-[38px] flex items-center">
                            {order.address_details || t("orderDetail.noAddress")}
                        </p>
                    )}
                </div>

                {/* Row 3: Phone Numbers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Primary Phone */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Phone className="w-3 h-3" />
                            {t("orderDetail.primaryPhone")}
                            {!isEditing && !validatePhoneDetailed(order.phone).isValid && (
                                <span className="relative flex h-2.5 w-2.5 ml-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            {isEditing ? (
                                <div className="flex-1 relative">
                                    <input
                                        value={displayValue("phone") as string}
                                        onChange={(e) => updateFormData("phone", e.target.value)}
                                        dir="ltr"
                                        className={cn(
                                            "w-full h-[38px] px-3 bg-[var(--background)] border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                            !validatePhoneDetailed(displayValue("phone") as string).isValid
                                                ? "border-red-300 focus:ring-red-200"
                                                : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                        )}
                                    />
                                    {!validatePhoneDetailed(displayValue("phone") as string).isValid && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                            </span>
                                            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                {validatePhoneDetailed(displayValue("phone") as string).errorMessageAr}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={cn(
                                    "flex-1 h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg",
                                    !validatePhoneDetailed(order.phone).isValid && "border-red-200 bg-red-50"
                                )}>
                                    <span
                                        className={cn(
                                            "font-mono text-sm font-medium text-foreground",
                                            !validatePhoneDetailed(order.phone).isValid && "text-red-600"
                                        )}
                                        dir="ltr"
                                    >
                                        {formatPhoneForDisplay(order.phone) || "—"}
                                    </span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleWhatsApp}
                                disabled={!validatePhoneDetailed(order.phone).isValid}
                                className={cn(
                                    "w-9 h-9 rounded-lg transition-all flex items-center justify-center flex-shrink-0",
                                    validatePhoneDetailed(order.phone).isValid
                                        ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)]"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                                title={validatePhoneDetailed(order.phone).isValid ? t("orderDetail.whatsApp") : validatePhoneDetailed(order.phone).errorMessageAr}
                            >
                                <MessageCircle className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {/* Secondary Phone */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Phone className="w-3 h-3" />
                            {t("orderDetail.secondaryPhone")}
                            {!isEditing && order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && (
                                <span className="relative flex h-2.5 w-2.5 ml-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            {isEditing ? (
                                <div className="flex-1 relative">
                                    <input
                                        value={(displayValue("secondary_phone") || "") as string}
                                        onChange={(e) => updateFormData("secondary_phone", e.target.value)}
                                        dir="ltr"
                                        placeholder={t("orderDetail.optional")}
                                        className={cn(
                                            "w-full h-[38px] px-3 bg-[var(--background)] border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                            (displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid
                                                ? "border-red-300 focus:ring-red-200"
                                                : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                        )}
                                    />
                                    {(displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                            </span>
                                            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                {validatePhoneDetailed(displayValue("secondary_phone") as string).errorMessageAr}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={cn(
                                    "flex-1 h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg",
                                    order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && "border-red-200 bg-red-50"
                                )}>
                                    <span
                                        className={cn(
                                            "font-mono text-sm font-medium text-foreground",
                                            order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600"
                                        )}
                                        dir="ltr"
                                    >
                                        {formatPhoneForDisplay(order.secondary_phone) || "—"}
                                    </span>
                                </div>
                            )}
                            {order.secondary_phone && validatePhoneDetailed(order.secondary_phone).isValid && (
                                <button
                                    type="button"
                                    onClick={handleSecondaryWhatsApp}
                                    className="w-9 h-9 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center flex-shrink-0"
                                    title={t("orderDetail.whatsApp")}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Row 4: Date, Delivery ID, Source */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Order Date */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Calendar className="w-3 h-3" />
                            {t("orderDetail.orderDate")}
                            {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full uppercase tracking-wider">
                                    Modified
                                </span>
                            )}
                        </span>
                        {isEditing ? (
                            <DateTimePicker
                                value={displayValue("created_at") as string}
                                onChange={(isoString) => updateFormData("created_at", isoString)}
                                showTime={true}
                                className="h-[38px]"
                            />
                        ) : (
                            <div className={cn(
                                "min-h-[38px] py-1 flex flex-col justify-center px-3 rounded-lg transition-all",
                                order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime()
                                    ? "bg-amber-50/60 border border-amber-200/80 border-l-[3px] border-l-amber-400"
                                    : "bg-[var(--background)] border border-[var(--card-border)]"
                            )}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn(
                                        "font-mono text-sm",
                                        order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime()
                                            ? "text-amber-900 font-semibold"
                                            : "text-foreground"
                                    )}>
                                        {new Date(order.created_at).toLocaleString('en-US', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true
                                        })}
                                    </span>
                                    {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                        <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-md shadow-sm"
                                            title={t("orderDetail.originalDate") || "Original Date"}
                                        >
                                            <Calendar className="w-3 h-3 text-amber-600" />
                                            <span className="text-amber-500 mr-0.5">was</span>
                                            {new Date(order.original_created_at).toLocaleString('en-US', {
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Delivery Order ID */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Truck className="w-3 h-3" />
                            {t("orderDetail.trackingNo")}
                        </span>
                        {isEditing ? (
                            <input
                                value={(displayValue("delivery_order_id") || "") as string}
                                onChange={(e) => updateFormData("delivery_order_id", e.target.value)}
                                dir="ltr"
                                placeholder={t("orderDetail.trackingPlaceholder")}
                                className="w-full h-[38px] px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                            />
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <span className="font-mono text-sm text-foreground">
                                    {order.delivery_order_id || <span className="text-muted">{t("orderDetail.notSet")}</span>}
                                </span>
                            </div>
                        )}
                    </div>
                    {/* Source */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Globe className="w-3 h-3" />
                            {t("orderDetail.source")}
                        </span>
                        {isEditing ? (
                            <div className="relative">
                                <select
                                    value={(displayValue("source") || "other") as string}
                                    onChange={(e) => updateFormData("source", e.target.value)}
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                >
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="lightfunnels">LightFunnels</option>
                                    <option value="meta">Instagram (Meta)</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="delivery_import">Delivery Import</option>
                                    <option value="shop">{t("orderDetail.source.shop")}</option>
                                    <option value="other">Other</option>
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                {(() => {
                                    const src = order.source || 'other';
                                    switch (src) {
                                        case 'whatsapp':
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                                    <span className="text-sm font-medium">WhatsApp</span>
                                                </div>
                                            );
                                        case 'lightfunnels':
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                    <span className="text-sm font-medium">LightFunnels</span>
                                                </div>
                                            );
                                        case 'meta':
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600" />
                                                    <span className="text-sm font-medium">Instagram</span>
                                                </div>
                                            );
                                        case 'tiktok':
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-black" />
                                                    <span className="text-sm font-medium">TikTok</span>
                                                </div>
                                            );
                                        case 'shop':
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                    <span className="text-sm font-medium">{t("orderDetail.source.shop")}</span>
                                                </div>
                                            );
                                        default:
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                                                    <span className="text-sm font-medium">Other</span>
                                                </div>
                                            );
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment & Delivery Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-3 mt-1">
                    {/* Payment Status (With Edit) */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                            <Banknote className="h-3 w-3" />
                            {t("orderDetail.paymentStatus")}
                        </span>
                        {isEditing ? (
                            <div className="flex bg-[var(--background)] rounded-lg border border-[var(--card-border)] p-1">
                                {(["cod", "prepaid", "pending", "partial"] as const).map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => updateFormData("payment_status", status)}
                                        className={cn(
                                            "flex-1 text-xs py-1.5 rounded-md transition-all font-medium",
                                            (formData.payment_status || order.payment_status) === status
                                                ? "bg-white shadow-sm text-foreground ring-1 ring-black/5"
                                                : "text-muted hover:text-foreground hover:bg-white/50"
                                        )}
                                    >
                                        {status === "cod" ? t("orderDetail.payment.cod") : status === "prepaid" ? t("orderDetail.payment.prepaid") : status === "partial" ? t("orderDetail.payment.partial") : t("orderDetail.pending")}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <span className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-semibold",
                                    order.payment_status === "prepaid" ? "bg-emerald-100 text-emerald-800" :
                                        order.payment_status === "cod" ? "bg-amber-100 text-amber-800" :
                                            order.payment_status === "partial" ? "bg-blue-100 text-blue-800" :
                                                "bg-gray-100 text-gray-800"
                                )}>
                                    {order.payment_status === "cod" ? t("orderDetail.payment.cod") : order.payment_status === "prepaid" ? t("orderDetail.payment.prepaidFull") : order.payment_status === "partial" ? t("orderDetail.payment.partialFull") : t("orderDetail.pending")}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Delivery Slot (With Edit) */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                            <Clock className="h-3 w-3" />
                            {t("orderDetail.preferredDelivery")}
                        </span>
                        {isEditing ? (
                            <div className="flex bg-[var(--background)] rounded-lg border border-[var(--card-border)] p-1">
                                {[
                                    { id: "morning", label: t("orderDetail.slot.morning") },
                                    { id: "afternoon", label: t("orderDetail.slot.afternoon") },
                                    { id: "evening", label: t("orderDetail.slot.evening") }
                                ].map((slot) => (
                                    <button
                                        key={slot.id}
                                        onClick={() => updateFormData("delivery_slot", slot.id)}
                                        className={cn(
                                            "flex-1 text-[10px] py-1.5 rounded-md transition-all font-medium mx-0.5 whitespace-nowrap",
                                            (formData.delivery_slot || order.delivery_slot) === slot.id
                                                ? "bg-white shadow-sm text-foreground ring-1 ring-black/5"
                                                : "text-muted hover:text-foreground hover:bg-white/50"
                                        )}
                                    >
                                        {slot.label}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                <span className="text-sm text-foreground font-medium">
                                    {order.delivery_slot ?
                                        (order.delivery_slot === "morning" ? t("orderDetail.slot.morningFull") :
                                            order.delivery_slot === "afternoon" ? t("orderDetail.slot.afternoonFull") :
                                                t("orderDetail.slot.eveningFull"))
                                        : t("orderDetail.unspecified")
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
