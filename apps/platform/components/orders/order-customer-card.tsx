"use client";

import { useLanguage } from "@/hooks/use-language";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";
import { formatPhoneGrouped, validatePhoneDetailed } from "@/lib/order-utils";
import { useGroupedPhoneInput } from "@/hooks/use-grouped-phone-input";
import { GovernorateOptions } from "./governorate-options";
import { extractGovernorate, getAllGovernorateCodes } from "@/lib/address-validator";
import { cn } from "@/lib/utils";
import { Banknote, Calendar, CalendarClock, Clock, Globe, MapPin, MessageCircle, Phone, Truck, User, CheckCircle, XCircle, X, ArrowUpDown, BadgeCheck } from "lucide-react";
import { DateTimePicker } from "@scheniders/ui/datetime-picker";
import type { OrderStatus } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { isWhatsAppSlot, swapPhones, type WhatsAppSlot } from "@/lib/whatsapp-contact";
import { formatOrderDateTime, formatOrderDayMonthTime, formatScheduledDate, isScheduledToday, scheduleDayFromToday } from "@/lib/order-format-utils";

/**
 * "The customer told us to reach them here." Green + the WhatsApp glyph so it
 * reads the same way it does on the orders list.
 */
function WhatsAppBadge({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal text-emerald-700">
            <BadgeCheck className="h-3 w-3" />
            {label}
        </span>
    );
}

/** Marks (or unmarks) one slot as the number the customer asked to be contacted on. */
function DesignateWhatsAppButton({
    active,
    disabled,
    onClick,
    title,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "h-9 w-9 flex-shrink-0 rounded-lg border transition-all flex items-center justify-center",
                disabled
                    ? "border-[var(--card-border)] bg-gray-100 text-gray-400 cursor-not-allowed"
                    : active
                        ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
                        : "border-[var(--card-border)] bg-[var(--background)] text-muted hover:border-emerald-400 hover:text-emerald-600",
            )}
            title={title}
            aria-pressed={active}
        >
            <BadgeCheck className="h-4 w-4" />
        </button>
    );
}

interface OrderCustomerCardProps {
    isEditing: boolean;
    // ARCH-3: these were `any` with three eslint-disable lines to silence it.
    // Typed instead, which removes the suppressions rather than the warning.
    order: Order;
    formData: Partial<Order>;
    updateFormData: (key: string, value: unknown) => void;
    onStatusUpdate?: (orderId: string, status: OrderStatus, reason?: string) => Promise<{ success: boolean; error?: string }>;
    isUpdatingStatus: boolean;
    handleStatusChange: (status: OrderStatus) => void;
    /**
     * Field-level save error for the order date — set when the database
     * refused a future `created_at`. Shown under the field rather than as a
     * toast, so the merchant sees which control to use and keeps their edits.
     */
    orderDateError?: string | null;
    /** Lets the view-mode "choose the WhatsApp number" shortcut drop straight into editing. */
    onRequestEdit?: () => void;
    /**
     * Called after a `wa.me` chat is opened here, so the order records who made
     * contact. Passed in rather than hooked: this card renders in tests without
     * auth or query providers.
     */
    onContactRecorded?: (orderId: string) => void;
}

export function OrderCustomerCard({
    isEditing,
    order,
    formData,
    updateFormData,
    onStatusUpdate,
    isUpdatingStatus,
    handleStatusChange,
    orderDateError,
    onRequestEdit,
    onContactRecorded,
}: OrderCustomerCardProps) {
    const { t } = useLanguage();
    const governorates = getAllGovernorateCodes();

    // Postponing is `scheduled_date`, never a forward-dated `created_at` — the
    // database rejects that (trg_orders_created_at_not_future).
    const scheduledDate: string | null = (
        isEditing && formData.scheduled_date !== undefined ? formData.scheduled_date : order?.scheduled_date
    ) || null;

    // The picker shows the viewer's local calendar, so read the picked day back
    // in local time. The shortcuts count Baghdad days (scheduleDayFromToday).
    const pickedDayKey = (isoString: string) => new Date(isoString).toLocaleDateString("en-CA");

    const displayValue = <K extends keyof Order>(key: K): Order[K] | undefined => {
        if (isEditing && formData[key] !== undefined) {
            return formData[key];
        }
        return order?.[key];
    };

    // Inputs show 4-3-4 grouping; formData keeps the un-spaced value as before.
    const phoneInput = useGroupedPhoneInput((displayValue("phone") || "") as string, (value) => updateFormData("phone", value));
    const secondaryPhoneInput = useGroupedPhoneInput((displayValue("secondary_phone") || "") as string, (value) => updateFormData("secondary_phone", value));

    // A row read without `whatsapp_contact_slot` (the detail view before
    // 20261014120000 adds it) does not say whether a line was designated.
    // Offering the controls then would swap or clear a designation this card
    // cannot see, so they stay hidden until the value is known.
    const slotKnown = order.whatsapp_contact_slot !== undefined;

    // Read through `displayValue` so the controls behave the same in edit mode
    // (pending form state) and view mode (saved order).
    const currentPhones = {
        phone: (displayValue("phone") || "") as string,
        secondary_phone: (displayValue("secondary_phone") || "") as string,
        whatsapp_contact_slot: (displayValue("whatsapp_contact_slot") || null) as WhatsAppSlot | null,
    };

    const handleSwapPhones = () => {
        const swapped = swapPhones(currentPhones);
        updateFormData("phone", swapped.phone);
        updateFormData("secondary_phone", swapped.secondary_phone ?? "");
        updateFormData("whatsapp_contact_slot", swapped.whatsapp_contact_slot);
    };

    /** Toggle: designating the slot that is already designated clears it. */
    const handleDesignateWhatsApp = (slot: WhatsAppSlot) => {
        updateFormData(
            "whatsapp_contact_slot",
            currentPhones.whatsapp_contact_slot === slot ? null : slot,
        );
    };

    const designateTitle = (slot: WhatsAppSlot): string => {
        const number = slot === "primary" ? currentPhones.phone : currentPhones.secondary_phone;
        if (!number.trim()) return t("orders.phone.enterFirst");
        return isWhatsAppSlot(currentPhones, slot) ? t("orders.phone.undesignate") : t("orders.phone.designate");
    };

    const handleWhatsApp = () => {
        openWhatsAppChat(order.phone, `مرحباً، بخصوص طلب ${order.order_id}`, t, () => onContactRecorded?.(order.id));
    };

    const handleSecondaryWhatsApp = () => {
        if (!order.secondary_phone) return;
        openWhatsAppChat(order.secondary_phone, `مرحباً، بخصوص طلب ${order.order_id}`, t, () => onContactRecorded?.(order.id));
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
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] text-right"
                                >
                                    <option value="" disabled>{t("orderDetail.selectProvince")}</option>
                                    <GovernorateOptions />
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
                            {slotKnown && isWhatsAppSlot(currentPhones, "primary") && <WhatsAppBadge label={t("orders.phone.whatsappBadge")} />}
                            {isEditing && slotKnown && (
                                <button
                                    type="button"
                                    onClick={handleSwapPhones}
                                    disabled={!currentPhones.secondary_phone.trim()}
                                    className={cn(
                                        "ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal transition-colors",
                                        currentPhones.secondary_phone.trim()
                                            ? "text-foreground/70 hover:bg-[var(--background)] hover:text-foreground"
                                            : "text-muted/50 cursor-not-allowed",
                                    )}
                                    title={t("orders.phone.swapTitle")}
                                >
                                    <ArrowUpDown className="h-3 w-3" />
                                    {t("orders.phone.swap")}
                                </button>
                            )}
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
                                        {...phoneInput}
                                        inputMode="tel"
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
                                        {formatPhoneGrouped(order.phone) || "—"}
                                    </span>
                                </div>
                            )}
                            {isEditing && slotKnown && (
                                <DesignateWhatsAppButton
                                    active={isWhatsAppSlot(currentPhones, "primary")}
                                    disabled={!currentPhones.phone.trim()}
                                    onClick={() => handleDesignateWhatsApp("primary")}
                                    title={designateTitle("primary")}
                                />
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
                            {slotKnown && isWhatsAppSlot(currentPhones, "secondary") && <WhatsAppBadge label={t("orders.phone.whatsappBadge")} />}
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
                                        {...secondaryPhoneInput}
                                        inputMode="tel"
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
                                        {formatPhoneGrouped(order.secondary_phone) || "—"}
                                    </span>
                                </div>
                            )}
                            {isEditing && slotKnown && (
                                <DesignateWhatsAppButton
                                    active={isWhatsAppSlot(currentPhones, "secondary")}
                                    disabled={!currentPhones.secondary_phone.trim()}
                                    onClick={() => handleDesignateWhatsApp("secondary")}
                                    title={designateTitle("secondary")}
                                />
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

                    {/* View mode has no inputs, so offer the one-click way in. */}
                    {!isEditing && slotKnown && onRequestEdit && !order.whatsapp_contact_slot && (
                        <button
                            type="button"
                            onClick={onRequestEdit}
                            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {order.secondary_phone ? t("orders.phone.chooseWhatsApp") : t("orders.phone.addWhatsApp")}
                        </button>
                    )}
                </div>

                {/* Row 4: Date, Delivery ID, Source */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Order Date */}
                    <div>
                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Calendar className="w-3 h-3" />
                            {t("orderDetail.orderDate")}
                            {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full uppercase tracking-wider">
                                    {t("orderDetail.dateCorrected")}
                                </span>
                            )}
                        </span>
                        {isEditing ? (
                            <>
                                {/* "now" is resolved on each interaction, so a form left open does not clamp against a stale clock. */}
                                <DateTimePicker
                                    value={displayValue("created_at") as string}
                                    onChange={(isoString) => updateFormData("created_at", isoString)}
                                    showTime={true}
                                    maxDate="now"
                                    className={cn("h-[38px]", orderDateError && "ring-1 ring-red-400 rounded-lg")}
                                />
                                {orderDateError ? (
                                    <p role="alert" className="mt-1 text-[11px] leading-tight text-red-600">
                                        {orderDateError}
                                    </p>
                                ) : (
                                    <p className="mt-1 text-[11px] leading-tight text-muted">
                                        {t("orderDetail.orderDateHint")}
                                    </p>
                                )}
                            </>
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
                                        {formatOrderDateTime(order.created_at)}
                                    </span>
                                    {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                        <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-md shadow-sm"
                                            title={t("orderDetail.originalDate")}
                                        >
                                            <Calendar className="w-3 h-3 text-amber-600" />
                                            <span className="text-amber-500 mr-0.5">{t("orders.ui.wasLower")}</span>
                                            {formatOrderDayMonthTime(order.original_created_at)}
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
                                    <option value="delivery_import">{t("orders.ui.sourceDeliveryImport")}</option>
                                    <option value="shop">{t("orderDetail.source.shop")}</option>
                                    <option value="other">{t("orders.source.other")}</option>
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
                                                    <span className="text-sm font-medium">{t("orders.source.other")}</span>
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
                                            "flex-1 text-[11px] py-1.5 rounded-md transition-all font-medium mx-0.5 whitespace-nowrap",
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

                {/* Scheduled For — the postpone control. Keeps the placement date honest. */}
                <div className="border-t border-gray-100 pt-3 mt-1">
                    <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                        <CalendarClock className="h-3 w-3" />
                        {t("orderDetail.scheduledFor")}
                    </span>
                    {isEditing ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="sm:w-56">
                                <DateTimePicker
                                    value={scheduledDate ? `${scheduledDate}T00:00:00` : null}
                                    onChange={(isoString) => updateFormData("scheduled_date", pickedDayKey(isoString))}
                                    showTime={false}
                                    minDate="now"
                                    className="h-[38px]"
                                />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => updateFormData("scheduled_date", scheduleDayFromToday(1))}
                                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                    {t("orderDetail.tomorrow")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateFormData("scheduled_date", scheduleDayFromToday(3))}
                                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                    {t("orderDetail.inThreeDays")}
                                </button>
                                {scheduledDate && (
                                    <button
                                        type="button"
                                        onClick={() => updateFormData("scheduled_date", null)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-muted hover:bg-gray-100 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                        {t("orderDetail.clearSchedule")}
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="min-h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                            {scheduledDate ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                                    <Calendar className="w-3 h-3" />
                                    {isScheduledToday(scheduledDate)
                                        ? `${t("orderDetail.scheduledToday")} · ${formatScheduledDate(scheduledDate)}`
                                        : formatScheduledDate(scheduledDate)}
                                </span>
                            ) : (
                                <span className="text-sm text-muted">{t("orderDetail.notScheduled")}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
