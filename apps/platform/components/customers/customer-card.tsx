"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, MessageCircle, Phone, Tag, X, Check, User } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    customerAccent,
    recencyStatus,
    valueTierKey,
    firstDeliveryPending,
    FIRST_DELIVERY_DOT,
    effectiveSuccessRate,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip, WHATSAPP_TONE } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags, CARD_TOOLTIP } from "@/components/customers/customer-status-flags";
import { Tooltip } from "@/components/ui/tooltip";
import { CustomerQuickActions } from "@/components/customers/customer-quick-actions";
import { formatPhoneDisplay, monogram, spentLabel, toIraqE164 } from "@/lib/customer-format";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";

interface CustomerCardProps {
    customer: PaginatedCustomer;
    onClick?: () => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}

/**
 * A compact customer card: who (name, phone, place), one value-or-risk pill
 * with the order-outcome flags, the three numbers, recency and the contact
 * actions. An unsafe customer shows the risk instead of the value tier.
 */
export function CustomerCard({ customer, onClick, isSelected, onToggleSelect }: CustomerCardProps) {
    const { t, language } = useLanguage();
    const { can } = usePermission();
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const [quickOpen, setQuickOpen] = useState(false);

    const value = customer.value_tier;
    const risk = customer.risk_level;
    const unsafe = risk === "blocked" || risk === "high";
    // The avatar takes the risk colour when COD is unsafe, never a green value tier.
    const accent = customerAccent(value, risk);
    const pending = firstDeliveryPending(customer);
    const recency = recencyStatus(customer.last_order_date, t, language);
    const success = effectiveSuccessRate(customer);
    const e164 = toIraqE164(customer.phone);
    const gov = customer.governorate ? governorateLabel(customer.governorate, language) || customer.governorate : null;

    return (
        <div
            onClick={onClick}
            className={cn(
                "@container relative h-full flex flex-col rounded-2xl border border-(--card-border) p-4 cursor-pointer transition-shadow group",
                unsafe ? "bg-rose-50/50 dark:bg-rose-500/5" : "bg-(--card-bg)",
                "shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
                isSelected && "ring-2 ring-foreground",
            )}
        >
            {/* Identity: the avatar turns into the select box on hover or once selected */}
            <div className="flex items-center gap-3 min-w-0">
                <span className="relative w-10 h-10 shrink-0">
                    <span className={cn(
                        "absolute inset-0 rounded-xl flex items-center justify-center font-bold text-sm transition-opacity",
                        accent.surfaceBg, accent.surfaceText,
                        onToggleSelect && (isSelected ? "opacity-0" : "group-hover:opacity-0"),
                    )}>
                        {customer.has_name ? monogram(customer.name) : <User className="w-4 h-4" />}
                    </span>
                    {onToggleSelect && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                            className={cn(
                                "absolute inset-0 rounded-xl border flex items-center justify-center transition-opacity",
                                isSelected
                                    ? "opacity-100 bg-foreground border-foreground text-background"
                                    : "opacity-0 group-hover:opacity-100 bg-(--card-bg) border-(--card-border) text-muted-foreground/40",
                            )}
                            aria-label={t("customers.bulk.select", "Select")}
                            aria-pressed={!!isSelected}
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    {/* A real link, so a profile can be opened in a new tab; a plain click opens the drawer. */}
                    <Link
                        href={`/customers/${encodeURIComponent(customer.phone)}`}
                        onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey) { e.stopPropagation(); return; }
                            e.preventDefault();
                        }}
                        dir="auto"
                        className="block font-bold text-foreground truncate text-left hover:underline underline-offset-2"
                    >
                        {customer.name}
                    </Link>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
                        {customer.has_name && <span className="font-mono tabular-nums whitespace-nowrap shrink-0">{formatPhoneDisplay(customer.phone)}</span>}
                        {gov && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span dir="auto" className="truncate">{gov}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* One status row: value tier (or the risk when COD is unsafe), caution, then the
                outcome flags. Two chips fit a card, so the rest is a counted "+N" (named in its
                tooltip). Caution keeps its full words, as on every other surface; on a card too
                narrow for both words (under 16rem, the 4-column grid at 1280) the value pill
                gives way instead and shows its icon alone. Only then does it carry a tooltip
                with the tier's name (and the name stays for screen readers); a pill that shows
                its word needs none. Every chip but the "+N" may still shrink (min-w-0, its word truncated),
                so the "+N" is never pushed off the row. Clipped sideways only, so the tooltips
                can open above the row. */}
            <div className="mt-3 flex items-center gap-1.5 h-6 overflow-x-clip">
                {unsafe ? (
                    <RiskChip risk={risk} className="min-w-0" />
                ) : risk === "caution" ? (
                    <Tooltip content={t(valueTierKey(value))} align="start" className="min-w-0" contentClassName={cn(CARD_TOOLTIP, "@min-[16rem]:hidden")}>
                        <ValuePill tier={value} variant="compact" className="min-w-0 @max-[16rem]:px-1.5" labelClassName="@max-[16rem]:sr-only" />
                    </Tooltip>
                ) : (
                    <ValuePill tier={value} variant="compact" className="min-w-0" />
                )}
                {risk === "caution" && <RiskChip risk={risk} className="min-w-0" />}
                <CustomerStatusFlags customer={customer} max={risk === "caution" ? 0 : 1} className="contents" />
            </div>

            {/* The three numbers, each with its label, so the delivery rate is never a bare icon */}
            <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 text-[13px]">
                <div className="min-w-0 flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground truncate">{t("customers.orders")}</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{customer.total_orders.toLocaleString("en-US")}</dd>
                </div>
                <div className="min-w-0 flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground truncate" title={t("customers.spentOnItemsHint")}>{t("customers.spentOnItems")}</dt>
                    <dd className="font-semibold text-foreground tabular-nums truncate">{spentLabel(customer.total_spent, pending)}</dd>
                </div>
                <div className="min-w-0 flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground truncate">{t("customers.table.success")}</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{pending ? "—" : `${success}%`}</dd>
                </div>
            </dl>

            {/* Recency + actions */}
            <div className="mt-auto pt-3">
                <div className="pt-3 border-t border-(--card-border) flex items-center justify-between gap-2">
                    {/* The dot is recency only (active, cooling, dormant); risk has its own pill. */}
                    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground min-w-0" title={pending ? t("customers.card.firstDeliveryPending") : recency.label}>
                        <span className={cn("w-2 h-2 rounded-full shrink-0", pending ? FIRST_DELIVERY_DOT : recency.dot)} aria-hidden />
                        <span dir="auto" className="truncate">
                            {pending ? t("customers.card.firstDelivery") : <><span className="sr-only">{recency.stateLabel}: </span>{recency.ago}</>}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                        {canEdit && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setQuickOpen(true); }}
                                className="w-9 h-9 rounded-lg border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                                aria-label={t("customers.quick.title", "Tag or note")}
                            >
                                <Tag className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${e164}`, "_blank"); }}
                            className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-colors", WHATSAPP_TONE)}
                            aria-label={t("customers.actions.whatsapp")}
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); window.location.href = `tel:+${e164}`; }}
                            className="w-9 h-9 rounded-lg border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                            aria-label={t("customers.actions.call")}
                        >
                            <Phone className="w-4 h-4" />
                        </button>
                    </span>
                </div>
            </div>

            {/* Quick tag/note overlay */}
            <AnimatePresence>
                {quickOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 z-20 bg-(--card-bg) rounded-2xl border border-(--card-border) p-4 overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-sm font-bold inline-flex items-center gap-2"><Tag className="w-4 h-4 text-muted-foreground" />{t("customers.quick.title", "Quick actions")}</span>
                            <button onClick={() => setQuickOpen(false)} className="w-9 h-9 -m-1 rounded-lg border border-(--card-border) flex items-center justify-center text-muted-foreground hover:bg-muted/40" aria-label={t("common.close", "Close")}>
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <CustomerQuickActions phone={customer.phone} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
