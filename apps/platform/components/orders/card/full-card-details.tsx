"use client";

import { CodRiskChip } from "@/components/orders/cod-risk-chip";
import { Fragment, type CSSProperties } from "react";
import { GeminiBadge } from "@/components/orders/gemini-badge";
import { HighlightedText } from "@scheniders/ui/highlighted-text";
import { HighlightedPhone } from "../highlighted-phone";
import { cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { MessageCircle, MapPin, Phone, Package, AlertTriangle, FileText, ClipboardCopy } from "lucide-react";
import type { OrderCardModel } from "./use-order-card-model";

/** One section of the full order card; see FullOrderCard in ../order-card.tsx. */
export function FullCardDetails({ m }: { m: OrderCardModel }) {
    const { failedImageUrls, actualInternalNotes, actualNotes, compact, editable, fullAddress, governorateCode, hasDuplicates, isNew, isVerifiedCustomer, items, localSearchQuery, markImageFailed, order, orderReasonInfo, primaryIsWhatsApp, riskLevel, secondaryIsWhatsApp, t, thumbnailUrl } = m;
    const attention = order.needs_attention ? (order.attention_reasons ?? []) : [];
    return (
        <>
            {/* CENTER SECTION: Product, Phone, Address */}
            <div className="flex-1 min-w-0 space-y-2 hidden md:block overflow-hidden">
                {/* Product Row */}
                <div className="flex items-center gap-3">
                    {/* Product Thumbnail - hidden in semi-compact */}
                    {compact === 0 && items.length > 1 && (
                        <div className="relative h-12 w-14 flex-shrink-0" data-multi-item-stack="true">
                            {items.slice(0, 3).map((item, idx, shown) => {
                                const url = item.image_url && !failedImageUrls.has(item.image_url) ? item.image_url : null;
                                const behind = shown.length - 1 - idx;
                                return (
                                    <div
                                        key={idx}
                                        className="absolute h-11 w-11 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--background)] shadow-sm dark:border-white/10"
                                        style={{ left: idx * 6, top: behind === 0 ? 0 : 5, zIndex: idx + 1, transform: behind === 0 ? undefined : `rotate(${-8 * behind}deg)` }}
                                    >
                                        {url ? (
                                            <img src={url} alt={item.name} onError={() => markImageFailed(url)} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center"><Package className="h-4 w-4 text-muted dark:text-white/40" /></div>
                                        )}
                                    </div>
                                );
                            })}
                            <span className="absolute -bottom-1 right-0 z-10 rounded-full bg-foreground px-1.5 text-[11px] font-extrabold leading-4 text-background">{items.length}</span>
                        </div>
                    )}
                    {compact === 0 && items.length <= 1 && (thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={items[0].name}
                            onError={() => markImageFailed(thumbnailUrl)}
                            className="w-12 h-12 rounded-xl object-cover border border-[var(--card-border)] flex-shrink-0 dark:border-white/10 dark:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                        />
                    ) : (
                        <div className={cn(
                            "w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 dark:shadow-[0_0_10px_rgba(255,255,255,0.05)]",
                            isNew
                                ? "bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20"
                                : "bg-[var(--background)] border-[var(--card-border)] dark:bg-[#1E1E1E] dark:border-white/10"
                        )}>
                            <Package className={cn("w-5 h-5", isNew ? "text-orange-600 dark:text-orange-400" : "text-muted dark:text-white/40")} />
                        </div>
                    ))}

                    {/* Product Names */}
                    <div className="flex-1 min-w-0">
                        {items.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                <div
                                    className={cn(
                                        "contents",
                                        items.length > 1 && "!flex flex-wrap items-center gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-1 dark:border-amber-500/20 dark:bg-amber-500/10"
                                    )}
                                    data-multi-item={items.length > 1 ? "true" : undefined}
                                >
                                {items.map((item, idx) => {
                                    // Only color quantity badge if > 1
                                    const quantityColor = item.quantity === 1
                                        ? 'bg-[var(--background)] text-muted border-[var(--card-border)]'
                                        : item.quantity === 2
                                            ? 'bg-orange-100 text-orange-700 border-orange-300'
                                            : 'bg-rose-100 text-rose-700 border-rose-300';

                                    return (
                                        <Fragment key={idx}>
                                        {idx > 0 && (
                                            <span aria-hidden="true" className="mx-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-extrabold text-white">+</span>
                                        )}
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium text-foreground",
                                                items.length > 1
                                                    ? "bg-white/80 dark:bg-white/5"
                                                    : "bg-[var(--background)] border-l-[3px] dark:bg-gradient-to-r dark:from-white/5 dark:to-transparent"
                                            )}
                                            data-product-line={items.length > 1 ? undefined : ""}
                                            // --product-hue lets the dark theme re-tone the product's own colour to the shared lightness step.
                                            style={items.length > 1 ? undefined : ({ borderLeftColor: item.tag_color || '#22c55e', "--product-hue": item.tag_color || '#22c55e' } as CSSProperties)}
                                        >
                                            {item.name}
                                            <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold border ${quantityColor}`}>
                                                ×{item.quantity}
                                            </span>
                                            {item.is_ai_extracted && <GeminiBadge />}
                                            {(item as { is_open_box?: boolean }).is_open_box && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                    {t("orders.card.openBox")}
                                                </span>
                                            )}
                                            {/* Reason Tag - shows for return, rejected, cancelled orders */}
                                            {orderReasonInfo?.reason && idx === 0 && (
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-[11px] font-bold border",
                                                    ['return', 'rejected', 'cancelled'].includes(orderReasonInfo.type || '') && "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
                                                    orderReasonInfo.type === 'no_response' && "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
                                                    !['return', 'rejected', 'cancelled', 'no_response'].includes(orderReasonInfo.type || '') && "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20"
                                                )}>
                                                    {orderReasonInfo.reason}
                                                </span>
                                            )}
                                        </span>
                                        </Fragment>
                                    );
                                })}
                                {items.length > 1 && (
                                    <span className="px-2 text-xs font-extrabold text-amber-700 dark:text-amber-400">
                                        {t("orders.card.totalPieces", { count: items.reduce((sum, item) => sum + item.quantity, 0) })}
                                    </span>
                                )}
                                </div>
                                {/* Review Required Tag - Next to items */}
                                {(riskLevel === 'high' || riskLevel === 'blocked') &&
                                    ['new', 'contacted', 'confirmed'].includes(order.status) && (
                                        <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-red-100 text-red-700 animate-pulse border border-red-200 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20">
                                            {t("orders.ui.reviewRequired")}
                                        </span>
                                    )}
                                {/* Review Duplicate Order Tag - Next to items */}
                                {hasDuplicates && !isVerifiedCustomer &&
                                    ['new', 'contacted', 'confirmed'].includes(order.status) && (
                                        <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-orange-100 text-orange-700 animate-pulse border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20">
                                            {t("orders.ui.reviewRequired")}
                                        </span>
                                    )}
                                {/* Delivery Attention Flag - prominent, next to items like Review Required */}
                                {attention.some(r => r.startsWith('delivery_')) && (
                                    <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-100 text-amber-700 animate-pulse border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {attention.includes('delivery_prime_cancel_by_hand') ? t("orders.card.attn.delivery_prime_cancel_by_hand") :
                                            attention.includes('delivery_prime_edit_refused') ? t("orders.card.attn.delivery_prime_edit_refused") :
                                        attention.includes('delivery_price_changed') ? t("orders.card.attn.delivery_price_changed") :
                                            attention.includes('delivery_force_delivered') ? t("orders.card.attn.delivery_force_delivered") :
                                                attention.includes('delivery_amount_mismatch') ? t("orders.card.attn.delivery_amount_mismatch") :
                                                    attention.includes('delivery_phone_mismatch') ? t("orders.card.attn.delivery_phone_mismatch") :
                                                        attention.includes('delivery_already_delivered') ? t("orders.card.attn.delivery_already_delivered") :
                                                            attention.includes('delivery_wrong_status') ? t("orders.card.attn.delivery_wrong_status") :
                                                                attention.includes('delivery_partial_delivery') ? t("orders.card.attn.delivery_partial_delivery") :
                                                                    attention.includes('delivery_courier_cancelled') ? t("orders.card.attn.delivery_courier_cancelled") :
                                                                        attention.includes('delivery_returning') ? t("orders.card.attn.delivery_returning") :
                                                                            t("orders.card.attn.deliveryReview")}
                                    </span>
                                )}
                                {/* COD risk signals stamped by the storefront at checkout (cod_risk_signals) */}
                                <CodRiskChip
                                    variant="card"
                                    needsAttention={order.needs_attention}
                                    attentionReasons={order.attention_reasons}
                                />
                                {/* WhatsApp Attention Flag - shows when message sending failed */}
                                {order.needs_attention && order.attention_reasons?.some(r => r.startsWith('whatsapp_')) && (
                                    <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-red-100 text-red-700 animate-pulse border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20" title={order.delivery_note || t("orders.card.attn.whatsappSendFailed")}>
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {order.attention_reasons!.includes('whatsapp_shop_wallet_empty') ? t("orders.card.attn.whatsapp_shop_wallet_empty") :
                                            order.attention_reasons!.includes('whatsapp_wallet_empty') ? t("orders.card.attn.whatsapp_wallet_empty") :
                                            order.attention_reasons!.includes('whatsapp_invalid_number') ? t("orders.card.attn.whatsapp_invalid_number") :
                                            order.attention_reasons!.includes('whatsapp_rate_limited') ? t("orders.card.attn.whatsapp_rate_limited") :
                                                order.attention_reasons!.includes('whatsapp_network_error') ? t("orders.card.attn.whatsapp_network_error") :
                                                    order.attention_reasons!.includes('whatsapp_config_error') ? t("orders.card.attn.whatsapp_config_error") :
                                                        t("orders.card.attn.whatsappFailed")}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-sm text-muted">{t("orders.card.noProducts")}</span>
                        )}
                    </div>
                </div>

                {/* Phone & Address Row - Desktop only */}
                <div className="hidden md:flex items-center gap-4 text-sm overflow-hidden">
                    {/* Primary Phone */}
                    <div className="flex items-center gap-1.5 text-foreground">
                        {/* Validation indicator */}
                        {!validatePhoneDetailed(order.phone).isValid && (
                            <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.phone).errorMessageAr}>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                            </span>
                        )}
                        {primaryIsWhatsApp ? (
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" aria-label={t("orders.phone.whatsappLine")} />
                        ) : (
                            <Phone className="w-3.5 h-3.5 text-muted" />
                        )}
                        <span className={cn(
                            "font-mono text-sm",
                            !validatePhoneDetailed(order.phone).isValid && "text-red-600 dark:text-rose-400",
                            hasDuplicates && !isVerifiedCustomer && "text-orange-600 font-semibold dark:text-orange-400",
                            hasDuplicates && isVerifiedCustomer && "text-emerald-600 font-semibold dark:text-emerald-400",
                            !(!validatePhoneDetailed(order.phone).isValid) && !(hasDuplicates) && "dark:text-[#D4D4D4]",
                            // The stated contact line wins the colour: it is the number to dial.
                            primaryIsWhatsApp && validatePhoneDetailed(order.phone).isValid && "text-emerald-600 font-semibold dark:text-emerald-400"
                        )}>
                            {editable("phone", order.phone || "", <HighlightedPhone phone={order.phone} query={localSearchQuery} />, "font-mono")}
                        </span>
                        {/* Duplicate/Returning customer icon next to phone */}
                        {hasDuplicates && (
                            <ClipboardCopy className={cn(
                                "w-3.5 h-3.5",
                                isVerifiedCustomer ? "text-emerald-500" : "text-orange-500"
                            )} />
                        )}
                    </div>

                    {/* Secondary Phone */}
                    {order.secondary_phone && (
                        <>
                            <span className="text-[var(--card-border)]">|</span>
                            <div className="flex items-center gap-1.5 text-foreground">
                                {/* Validation indicator */}
                                {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                    <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.secondary_phone).errorMessageAr}>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                    </span>
                                )}
                                {secondaryIsWhatsApp ? (
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-500" aria-label={t("orders.phone.whatsappLine")} />
                                ) : (
                                    <Phone className="w-3.5 h-3.5 text-muted" />
                                )}
                                <span className={cn(
                                    "font-mono text-sm",
                                    !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600",
                                    secondaryIsWhatsApp && validatePhoneDetailed(order.secondary_phone).isValid && "text-emerald-600 font-semibold dark:text-emerald-400"
                                )}>
                                    <HighlightedPhone phone={order.secondary_phone} query={localSearchQuery} />
                                </span>
                            </div>
                        </>
                    )}

                    {/* Divider */}
                    {fullAddress && (
                        <>
                            <span className="text-[var(--card-border)]">|</span>
                            {/* Address */}
                            <div className="flex items-center gap-1.5 text-muted flex-1 min-w-0">
                                {/* Only show warning if address_details is empty */}
                                {(!order.address_details || order.address_details.trim() === '') && (
                                    <span
                                        className="relative flex h-2.5 w-2.5 flex-shrink-0"
                                        title={t("orders.card.noAddressDetails")}
                                    >
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                                    </span>
                                )}
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate text-right" title={fullAddress}>{editable("address_details", order.address_details || "", <HighlightedText text={fullAddress} query={localSearchQuery} />)}</span>
                                {/* Show governorate code - computed from stored value or extracted from city */}
                                {governorateCode && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-semibold flex-shrink-0">
                                        {governorateCode}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Notes Row - Order Notes (amber) and Internal Notes (blue) - hidden in semi-compact and for abandoned orders */}
                {compact === 0 && order.status !== "pending_checkout" && (
                    <div className="flex flex-wrap gap-2">
                        {actualNotes && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-amber-200">
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate" title={actualNotes}>{actualNotes}</span>
                            </div>
                        )}
                        {actualInternalNotes && (
                            <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-blue-200">
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate" title={actualInternalNotes}>{actualInternalNotes}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
