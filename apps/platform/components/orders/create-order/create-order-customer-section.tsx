"use client";

import { DeliverySlotPicker } from "@/components/orders/delivery-slot-picker";
import { GiftToggle } from "@/components/orders/gift-toggle";
import { Input } from "@scheniders/ui/input";
import { Textarea } from "@scheniders/ui/textarea";
import { Label } from "@scheniders/ui/label";
import { cn } from "@/lib/utils";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import { User, Phone, MapPin, Banknote, CreditCard, Clock, Ban } from "lucide-react";
import { OrderCustomerRiskPanel } from "../order-customer-risk-panel";
import { GovernorateOptions } from "../governorate-options";
import type { CreateOrderModel } from "./use-create-order-model";
import { PrimeDistrictField } from "./prime-district-field";
import { PrimePhoneHint } from "./prime-phone-hint";

/** One section of CreateOrderModal. */
export function CreateOrderCustomerSection({ m }: { m: CreateOrderModel }) {
    const { getBlacklistEntry, t, orderType, formData, errors, updateField, phoneInput, secondaryPhoneInput } = m;
    return (
        <>
            {/* Customer Information — Card */}
            <div className="rounded-xl border border-[var(--card-border)] bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 border-b border-[var(--card-border)]">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-semibold text-foreground">{t("orders.create.customerInfo")}</span>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Customer Name */}
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted">{t("orders.create.customerName")} <span className="text-red-500">*</span></Label>
                            <Input
                                value={formData.customer_name}
                                onChange={(e) => updateField("customer_name", e.target.value)}
                                placeholder={t("orders.create.namePlaceholder")}
                                inputMode="text"
                                autoComplete="name"
                                className={cn(
                                    "h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] transition-all",
                                    errors.customer_name && "field-error animate-shake"
                                )}
                                data-error={!!errors.customer_name}
                            />
                            {errors.customer_name && <p className="field-error-text">{errors.customer_name}</p>}
                        </div>

                        {/* Primary Phone */}
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {t("orders.create.phone")} {orderType === "delivery" ? <span className="text-red-500">*</span> : <span className="text-gray-400">{t("orders.create.optional")}</span>}
                            </Label>
                            <Input
                                {...phoneInput}
                                onBlur={() => {
                                    if (formData.phone) {
                                        updateField("phone", normalizeIraqiPhone(formData.phone));
                                    }
                                }}
                                placeholder="07XX XXX XXXX"
                                dir="ltr"
                                inputMode="tel"
                                autoComplete="tel"
                                className={cn(
                                    "h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono transition-all",
                                    errors.phone && "field-error animate-shake"
                                )}
                                data-error={!!errors.phone}
                            />
                            {errors.phone ? <p className="field-error-text">{errors.phone}</p> : <PrimePhoneHint phone={formData.phone} delivery={orderType === "delivery"} />}
                            {/* Blacklist warning */}
                            {(() => {
                                const normalizedPhone = normalizeIraqiPhone(formData.phone);
                                const entry = normalizedPhone && getBlacklistEntry ? getBlacklistEntry(normalizedPhone) : null;
                                if (!entry) return null;
                                return (
                                    <div className="flex flex-row-reverse items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2.5 mt-1 text-right">
                                        <Ban className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-xs space-y-0.5">
                                            <p className="font-bold text-red-700 dark:text-red-400">{t("orders.create.blacklisted")}</p>
                                            <p className="text-red-600/90 dark:text-red-400/80">{t("orders.create.reason", { reason: entry.reason ?? "" })}</p>
                                            {entry.notes && <p className="text-red-500/80 dark:text-red-400/60">{entry.notes}</p>}
                                            {entry.added_by && <p className="text-muted text-[11px]">{t("orders.create.addedBy", { name: entry.added_by })}</p>}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                            {/* Pre-flight COD-risk panel (two-axis VALUE + RISK) */}
                            <OrderCustomerRiskPanel phone={formData.phone} />

                        {/* Secondary Phone */}
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {t("orders.create.secondPhone")} <span className="text-gray-400">{t("orders.create.optional")}</span>
                            </Label>
                            <Input
                                {...secondaryPhoneInput}
                                onBlur={() => {
                                    if (formData.secondary_phone) {
                                        updateField("secondary_phone", normalizeIraqiPhone(formData.secondary_phone));
                                    }
                                }}
                                placeholder="07XX XXX XXXX"
                                dir="ltr"
                                inputMode="tel"
                                autoComplete="tel"
                                className="h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono"
                            />
                        </div>

                        {/* Governorate (City) - Hidden for shop orders */}
                        {orderType === "delivery" && (
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted">{t("orders.create.governorate")}</Label>
                                <div className="relative">
                                    <select
                                        value={formData.city}
                                        onChange={(e) => updateField("city", e.target.value)}
                                        className={cn(
                                            "h-9 w-full appearance-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 pr-8 text-sm font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-[var(--card-border)]",
                                            !formData.city && "text-muted-foreground",
                                            errors.city && "field-error animate-shake"
                                        )}
                                        data-error={!!errors.city}
                                    >
                                        <option value="" disabled>{t("orders.create.pickGovernorate")}</option>
                                        <GovernorateOptions />
                                    </select>
                                    {errors.city && <p className="field-error-text">{errors.city}</p>}
                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Address - Hidden for shop orders */}
                    {orderType === "delivery" && (
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {t("orders.create.fullAddress")}
                            </Label>
                            <Textarea
                                value={formData.address_details}
                                onChange={(e) => updateField("address_details", e.target.value)}
                                placeholder={t("orders.create.addressPlaceholder")}
                                rows={2}
                                className={cn(
                                    "rounded-lg border-[var(--card-border)] bg-[var(--background)] resize-none transition-all text-sm",
                                    errors.address_details && "field-error animate-shake"
                                )}
                                data-error={!!errors.address_details}
                            />
                            {errors.address_details && <p className="field-error-text">{errors.address_details}</p>}
                        </div>
                    )}

                    <PrimeDistrictField m={m} />

                    {/* Payment Status + Delivery Slot Row */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        {/* Payment Status */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted">{t("orders.create.payment")}</span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateField("payment_status", "cod")}
                                    className={cn(
                                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all",
                                        formData.payment_status === "cod"
                                            ? "bg-amber-50 border-amber-300 text-amber-700"
                                            : "bg-white border-[var(--card-border)] text-muted hover:border-amber-200"
                                    )}
                                >
                                    <Banknote className="h-3 w-3" />
                                    {t("orders.create.cod")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateField("payment_status", "prepaid")}
                                    className={cn(
                                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all",
                                        formData.payment_status === "prepaid"
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                            : "bg-white border-[var(--card-border)] text-muted hover:border-emerald-200"
                                    )}
                                >
                                    <CreditCard className="h-3 w-3" />
                                    {t("orders.create.prepaid")}
                                </button>
                            </div>
                        </div>

                        {/* Delivery Slot - Only for delivery orders */}
                        {orderType === "delivery" && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {t("orders.create.deliverySlot")}
                                </span>
                                <DeliverySlotPicker
                                    value={formData.delivery_slot}
                                    onChange={(slot) => updateField("delivery_slot", slot)}
                                />
                            </div>
                        )}

                        {/* Gift - Only for delivery orders */}
                        {orderType === "delivery" && (
                            <GiftToggle
                                value={formData.is_gift ?? false}
                                onChange={(isGift) => updateField("is_gift", isGift)}
                                collectsCash={formData.payment_status === "cod"}
                            />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
