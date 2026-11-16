"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";
import { formatPhoneGrouped, validatePhoneDetailed } from "@/lib/order-utils";
import { useGroupedPhoneInput } from "@/hooks/use-grouped-phone-input";
import { GovernorateOptions } from "./governorate-options";
import { PrimeDistrictField } from "./prime-district-field";
import { readPrimeDistrict } from "@/lib/prime/district";
import { getAllGovernorateCodes } from "@/lib/address-validator";
import { cn } from "@/lib/utils";
import { Banknote, Calendar, CalendarClock, Clock, Globe, MapPin, MessageCircle, Phone, Truck, User, CheckCircle, XCircle, X, ArrowUpDown, BadgeCheck } from "lucide-react";
import { DateTimePicker } from "@scheniders/ui/datetime-picker";
import { DeliverySlotPicker } from "./delivery-slot-picker";
import { GiftToggle } from "./gift-toggle";
import { GiftChip } from "./card/gift-chip";
import { formatDeliverySlot, parseDeliverySlot } from "@/lib/orders/delivery-slot";
import type { OrderStatus } from "@/lib/supabase";
import type { Order, OrderSource } from "@/types/order";
import { SourceBadge } from "./card/source-badge";
import { isWhatsAppSlot, swapPhones, type WhatsAppSlot } from "@/lib/whatsapp-contact";
import { formatOrderNamedDateTime, formatScheduledDate, isScheduledToday, scheduleDayFromToday } from "@/lib/order-format-utils";

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

/** A saved fact outside editing: plain text, so it does not read as a form field. */
const FACT = "min-h-[28px] flex items-center";

/** Sources a merchant picks by hand when editing; the order's own source is always listed too. */
const PICKABLE_SOURCES: readonly OrderSource[] = ["whatsapp", "lightfunnels", "meta", "tiktok", "delivery_import", "shop", "other"];

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
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const governorates = getAllGovernorateCodes();
    const storedArea = readPrimeDistrict(order.prime_district);

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

    const editedSource: OrderSource = displayValue("source") || "other";

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
                {/* Row 1: Name, Governorate, and the governorate code while editing */}
                <div className={cn("grid grid-cols-1 gap-3", isEditing ? "md:grid-cols-3" : "md:grid-cols-2")}>
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
                            <div className={FACT}>
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
                            <div className={FACT}>
                                <p className="text-sm font-medium text-foreground">{order.city || "—"}</p>
                            </div>
                        )}
                    </div>
                    {/* The governorate the courier routes to (stored as its code), named, for fixing a mismatch with the one above */}
                    {isEditing && (
                        <div>
                            <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.provinceCode")}</span>
                            <div className="relative">
                                <select
                                    value={(displayValue("governorate_code") || "") as string}
                                    onChange={(e) => {
                                        updateFormData("governorate_code", e.target.value);
                                    }}
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                >
                                    <option value="">{t("orderDetail.noCode")}</option>
                                    {governorates.map((gov) => (
                                        // The governorate by its own name; the courier code stays the stored value only
                                        // (round 16 critic: «KOT - واسط» in an Arabic window).
                                        <option key={gov.code} value={gov.code}>
                                            {language === "ar" ? gov.nameAr : gov.nameEn}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>
                    )}
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
                        <p className={cn("text-sm font-medium leading-relaxed", FACT, order.address_details ? "text-foreground" : "text-muted")}>
                            {order.address_details || t("orderDetail.noAddress")}
                        </p>
                    )}
                </div>

                {/* Prime area: picked while editing; its name stays readable otherwise */}
                {isEditing ? (
                    <PrimeDistrictField
                        city={(displayValue("city") || "") as string}
                        address={(displayValue("address_details") || "") as string}
                        value={displayValue("prime_district")}
                        onChange={(district) => updateFormData("prime_district", district)}
                    />
                ) : (
                    storedArea && (
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                            <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#315EA8]">
                                <span className="h-1.5 w-3 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                            </span>
                            <span dir={dir} className="text-left">
                                {t("orders.prime.newOrder.areaLine", { area: storedArea.name })}
                            </span>
                        </p>
                    )
                )}

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
                                            : "text-muted-foreground/50 cursor-not-allowed",
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
                                <div className={cn("flex-1", FACT)}>
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
                                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                                title={validatePhoneDetailed(order.phone).isValid ? t("orderDetail.whatsApp") : validatePhoneDetailed(order.phone).errorMessageAr}
                            >
                                <MessageCircle className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {/* Secondary Phone: left out of the plain view when there is none */}
                    {(isEditing || order.secondary_phone) && (
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
                                    <div className={cn("flex-1", FACT)}>
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
                                        className="w-9 h-9 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 transition-all flex items-center justify-center flex-shrink-0"
                                        title={t("orderDetail.whatsApp")}
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

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
                                    language={language}
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
                                "min-h-[28px] flex flex-col justify-center rounded-lg",
                                order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime()
                                    && "py-1 px-3 bg-amber-50/60 border border-amber-200/80 border-l-[3px] border-l-amber-400"
                            )}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn(
                                        "font-mono text-sm",
                                        order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime()
                                            ? "text-amber-900 font-semibold"
                                            : "text-foreground"
                                    )}>
                                        {/* Isolated in the page's direction, so an Arabic date reads day first: «14 تشرين الثاني · 07:01 ص» */}
                                        <bdi dir={dir}>{formatOrderNamedDateTime(order.created_at, language)}</bdi>
                                    </span>
                                    {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                        <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-md shadow-sm"
                                            title={t("orderDetail.originalDate")}
                                        >
                                            <Calendar className="w-3 h-3 text-amber-600" />
                                            <span className="text-amber-500 mr-0.5">{t("orders.ui.wasLower")}</span>
                                            <bdi dir={dir}>{formatOrderNamedDateTime(order.original_created_at, language)}</bdi>
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
                            <div className={FACT}>
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
                                    value={editedSource}
                                    onChange={(e) => updateFormData("source", e.target.value)}
                                    className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                >
                                    {(PICKABLE_SOURCES.includes(editedSource) ? PICKABLE_SOURCES : [editedSource, ...PICKABLE_SOURCES]).map((s) => (
                                        <option key={s} value={s}>{t(`reports.source.name.${s}`, s)}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        ) : (
                            // The same chip as the order's card, so the two never
                            // disagree; sources the card shows no chip for get
                            // their shared name (reports.source.name.*).
                            <div data-testid="order-source" className={FACT}>
                                <SourceBadge source={order.source || "other"} fallback={
                                    <span className="text-sm font-medium">{t(`reports.source.name.${order.source || "other"}`, order.source || "other")}</span>
                                } />
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
                            <div className={FACT}>
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
                            <DeliverySlotPicker
                                value={parseDeliverySlot((formData.delivery_slot ?? order.delivery_slot) as string | undefined)}
                                onChange={(slot) => updateFormData("delivery_slot", slot ?? null)}
                            />
                        ) : (
                            <div className={FACT}>
                                <span className="text-sm text-foreground font-medium">
                                    {(() => {
                                        const slot = parseDeliverySlot(order.delivery_slot);
                                        return slot ? formatDeliverySlot(slot, language === "ar" ? "ar" : "en") : t("orderDetail.unspecified");
                                    })()}
                                </span>
                            </div>
                        )}
                        {isEditing ? (
                            <GiftToggle
                                className="mt-2"
                                value={formData.is_gift ?? order.is_gift ?? false}
                                onChange={(isGift) => updateFormData("is_gift", isGift)}
                                collectsCash={(formData.payment_status || order.payment_status) === "cod"}
                            />
                        ) : (
                            <GiftChip isGift={order.is_gift} className="mt-2" />
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
                                    language={language}
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
                        <div className={FACT}>
                            {scheduledDate ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                                    <Calendar className="w-3 h-3" />
                                    {isScheduledToday(scheduledDate)
                                        ? `${t("orderDetail.scheduledToday")} · ${formatScheduledDate(scheduledDate, language)}`
                                        : formatScheduledDate(scheduledDate, language)}
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
