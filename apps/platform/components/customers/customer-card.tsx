"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, MessageCircle, Phone, Tag, X, Check, User, Truck } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    customerAccent,
    recencyStatus,
    firstDeliveryPending,
    effectiveSuccessRate,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip, WHATSAPP_TONE } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags } from "@/components/customers/customer-status-flags";
import { CustomerQuickActions } from "@/components/customers/customer-quick-actions";
import { formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";
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
    const recency = recencyStatus(customer.last_order_date, risk, t);
    const success = effectiveSuccessRate(customer);
    const e164 = toIraqE164(customer.phone);
    const gov = customer.governorate ? governorateLabel(customer.governorate, language) || customer.governorate : null;
    const orders = customer.total_orders === 1
        ? t("customers.card.orderOne", "1 order")
        : t("customers.card.orderMany", { count: customer.total_orders.toLocaleString("en-US") });

    return (
        <motion.div
            onClick={onClick}
            whileHover={{ y: -2 }}
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

            {/* One status row: value tier (or the risk when COD is unsafe), caution, outcome flags.
                Flags past what fits are counted as "+N" rather than silently hidden. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 h-6 overflow-hidden">
                {unsafe ? <RiskChip risk={risk} /> : <ValuePill tier={value} variant="compact" />}
                {risk === "caution" && <RiskChip risk={risk} />}
                <CustomerStatusFlags customer={customer} max={risk === "caution" ? 1 : 2} className="contents" />
            </div>

            {/* The three numbers */}
            <div className="mt-2.5 flex items-center gap-1.5 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden">
                <span className="text-foreground font-medium tabular-nums">{orders}</span>
                <span className="text-(--card-border)">·</span>
                <span className="font-medium text-foreground tabular-nums">
                    {pending && customer.total_spent === 0 ? "—" : formatIQD(customer.total_spent)}
                </span>
                {!pending && (
                    <>
                        <span className="text-(--card-border)">·</span>
                        {/* Delivery rate: the truck marks it; the word shows when the card is wide enough. */}
                        <span className="inline-flex items-center gap-1 min-w-0" title={t("customers.card.delivered")}><Truck className="w-3.5 h-3.5 shrink-0" aria-hidden /><span className="font-medium text-foreground tabular-nums">{success}%</span><span className="sr-only @[19rem]:not-sr-only"> {t("customers.card.delivered")}</span></span>
                    </>
                )}
            </div>

            {/* Recency + actions */}
            <div className="mt-auto pt-3">
                <div className="pt-3 border-t border-(--card-border) flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground min-w-0" title={pending ? undefined : recency.label}>
                        <span className={cn("w-2 h-2 rounded-full shrink-0", pending ? "bg-blue-400" : recency.dot)} />
                        <span dir="auto" className="truncate">{pending ? t("customers.card.firstDeliveryPending") : recency.ago}</span>
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
        </motion.div>
    );
}
