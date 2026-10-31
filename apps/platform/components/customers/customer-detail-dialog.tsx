"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomerStore } from "@/store/use-customer-store";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    X, Phone, MapPin, Calendar, MessageCircle, Plus, ExternalLink, Tag, Star,
    Package, ChevronDown, User, Home, ShoppingBag, StickyNote, ShieldCheck, CreditCard, Truck, Ban,
} from "lucide-react";
import { cn, formatIQD, getStatusLabel } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { trustEngine } from "@/lib/fraud-detector";
import { governorateLabel } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    hasRatedScore, averageBasket, displayScore, effectiveSuccessRate, codRiskKey, VALUE_META,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags } from "@/components/customers/customer-status-flags";
import { CustomerQuickActions } from "@/components/customers/customer-quick-actions";
import { monogram, formatPhoneDisplay, toIraqE164 } from "@/lib/customer-format";
import { addToBlacklist, removeFromBlacklist, fetchBlacklistEntry } from "@/lib/blacklist";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { usePermission } from "@/hooks/use-permission";
import { toast } from "@/hooks/use-toast";
import { PERMISSIONS } from "@/lib/permissions";

// Opened on demand from the footer; kept out of the customers page bundle.
const BlacklistDialog = dynamic(() => import("@/components/orders/blacklist-dialog").then((m) => m.BlacklistDialog), { ssr: false });
const CreateOrderModal = dynamic(() => import("@/components/orders/create-order-modal").then((m) => m.CreateOrderModal), { ssr: false });

interface OrderItem { name?: string; price?: number; quantity?: number; image_url?: string }
interface DialogOrder {
    id: string;
    order_id: string | null;
    created_at: string;
    items: unknown;
    price: number;
    discount_amount: number | null;
    delivery_fee: number | null;
    notes: string | null;
    address_details: string | null;
    city: string | null;
    governorate_code: string | null;
    status: string;
    payment_status: string | null;
    is_return: boolean | null;
    customer_name: string | null;
    secondary_phone: string | null;
}
type IdentityEvent = { type: "name" | "city" | "address" | "phone"; value: string; at: string };

const STATUS_CLS: Record<string, string> = {
    new: "bg-orange-100 text-orange-800",
    contacted: "bg-amber-100 text-amber-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    in_transit: "bg-blue-100 text-blue-800",
    delivered: "bg-teal-100 text-teal-800",
    completed: "bg-emerald-200 text-emerald-900",
    rejected: "bg-rose-100 text-rose-800",
    no_response: "bg-slate-100 text-slate-600",
    cancelled: "bg-zinc-100 text-zinc-700",
    return_pending: "bg-fuchsia-100 text-fuchsia-800",
    refund_delivered: "bg-pink-200 text-pink-900",
    suspended: "bg-orange-100 text-orange-800",
    pending_checkout: "bg-yellow-100 text-yellow-800",
};

const PAYMENT_KEY: Record<string, string> = {
    cod: "orderDetail.payment.cod",
    paid: "orderDetail.payment.prepaid",
    prepaid: "orderDetail.payment.prepaid",
    partial: "orderDetail.payment.partial",
};

function paymentLabel(status: string, t: Translate) {
    const key = PAYMENT_KEY[status];
    return key ? t(key) : status;
}

/** Arabic month names with Western digits, like the rest of the app. */
type Translate = ReturnType<typeof useLanguage>["t"];

const dateLocale = (locale: string) => (locale === "ar" ? "ar-IQ-u-nu-latn" : "en-GB");

function fmtDate(locale: string, d?: string | null) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString(dateLocale(locale), { day: "numeric", month: "short", year: "numeric" });
}
function monthYear(locale: string, d?: string | null) {
    if (!d) return "—";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString(dateLocale(locale), { month: "short", year: "numeric" });
}

function useCustomerDialogData(phone: string | null, limit = 60) {
    // Every read is limited to the active tenant: RLS alone would merge the
    // same phone's history across every tenant the user belongs to.
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-dialog", tenantId, phone, limit],
        enabled: !!phone && !!tenantId,
        staleTime: 5 * 60 * 1000,
        // "Load more" raises `limit`, which is a new key: keep showing the
        // current orders while the longer list loads instead of blanking.
        // A different customer or store still starts empty.
        placeholderData: (previous, previousQuery) =>
            previousQuery?.queryKey[1] === tenantId && previousQuery.queryKey[2] === phone
                ? previous
                : undefined,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const normalized = trustEngine.normalizePhone(phone as string);
            const variants = [normalized, `0${normalized}`, `964${normalized}`, `+964${normalized}`];

            const [ordersRes, reliabilityRes, trustRes, tagRes, noteRes] = await Promise.all([
                // Live orders of this store, matched on the normalized phone.
                supabase.rpc("get_customer_order_history", { p_phone: normalized })
                    .select("id, order_id, created_at, items, price, discount_amount, delivery_fee, notes, address_details, city, governorate_code, status, payment_status, is_return, customer_name, secondary_phone")
                    .order("created_at", { ascending: false }).limit(limit),
                // Same order count as the list and the profile.
                supabase.rpc("get_customer_reliability", { p_phone: normalized }),
                supabase.from("customer_trust")
                    .select("avg_basket, delivered_count, community_avg_rating, community_rating_count, score_breakdown, first_order_date")
                    .eq("tenant_id", tenantId)
                    .eq("phone", normalized).maybeSingle(),
                supabase.from("customer_tag_assignments").select("tag:customer_tags(name)").eq("tenant_id", tenantId).in("customer_phone", variants),
                supabase.from("customer_notes").select("note, created_at").eq("tenant_id", tenantId).in("customer_phone", variants).order("created_at", { ascending: false }),
            ]);
            for (const res of [ordersRes, reliabilityRes, trustRes, tagRes, noteRes]) {
                if (res.error) throw res.error;
            }

            const orders = (ordersRes.data ?? []) as DialogOrder[];

            // Derive identity changes (name / city / address / alt-phone) over time.
            const asc = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
            const seen = { name: new Set<string>(), city: new Set<string>(), addr: new Set<string>(), phone: new Set<string>() };
            const identity: IdentityEvent[] = [];
            for (const o of asc) {
                if (o.customer_name && !seen.name.has(o.customer_name)) { seen.name.add(o.customer_name); identity.push({ type: "name", value: o.customer_name, at: o.created_at }); }
                if (o.city && !seen.city.has(o.city)) { seen.city.add(o.city); identity.push({ type: "city", value: o.city, at: o.created_at }); }
                if (o.address_details && !seen.addr.has(o.address_details)) { seen.addr.add(o.address_details); identity.push({ type: "address", value: o.address_details, at: o.created_at }); }
                const alt = o.secondary_phone && trustEngine.normalizePhone(o.secondary_phone) !== normalized ? o.secondary_phone : null;
                if (alt && !seen.phone.has(alt)) { seen.phone.add(alt); identity.push({ type: "phone", value: alt, at: o.created_at }); }
            }

            return {
                orders,
                totalOrders: Number(reliabilityRes.data?.[0]?.total_orders ?? 0),
                completedCount: Number(reliabilityRes.data?.[0]?.completed_count ?? 0),
                totalSpent: Number(reliabilityRes.data?.[0]?.total_spent ?? 0),
                hasMore: orders.length >= limit,
                community: Number(trustRes.data?.community_avg_rating ?? 0),
                firstOrderDate: trustRes.data?.first_order_date as string | null | undefined,
                tags: ((tagRes.data ?? []) as unknown as { tag: { name: string } | null }[]).map((r) => r.tag?.name).filter(Boolean) as string[],
                notes: (noteRes.data ?? []) as { note: string; created_at: string }[],
                identity: identity.reverse(), // newest first
            };
        },
    });
}

function ItemThumb({ url, name }: { url?: string; name?: string }) {
    const [err, setErr] = useState(false);
    if (!url || err) {
        return (
            <div className="w-11 h-11 rounded-lg bg-background border border-(--card-border) flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
            </div>
        );
    }
    return <img src={url} alt={name || ""} loading="lazy" onError={() => setErr(true)} className="w-11 h-11 rounded-lg object-cover border border-(--card-border) shrink-0" />;
}

const IDENTITY_META: Record<IdentityEvent["type"], { icon: typeof User; cls: string; label: string }> = {
    name: { icon: User, cls: "text-violet-600 bg-violet-50", label: "Name" },
    city: { icon: MapPin, cls: "text-emerald-600 bg-emerald-50", label: "City" },
    address: { icon: Home, cls: "text-sky-600 bg-sky-50", label: "Address" },
    phone: { icon: Phone, cls: "text-amber-600 bg-amber-50", label: "Alt phone" },
};

function OrderCard({ order, defaultOpen, t, locale }: { order: DialogOrder; defaultOpen?: boolean; t: Translate; locale: Locale }) {
    const [open, setOpen] = useState(!!defaultOpen);
    const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
    const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    const discount = Number(order.discount_amount) || 0;
    const delivery = Number(order.delivery_fee) || 0;
    const total = Number(order.price) || 0;
    const pillCls = STATUS_CLS[order.status] ?? "bg-zinc-100 text-zinc-700";
    const itemCount = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
    const lines = mergeOrderItems(items);

    return (
        <div className="rounded-2xl border border-(--card-border) overflow-hidden bg-(--card-bg)">
            {/* Header */}
            <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors text-left">
                <span className="font-mono text-xs text-muted-foreground w-16 shrink-0 tabular-nums">{fmtDate(locale, order.created_at)}</span>
                <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0", pillCls)}>{getStatusLabel(order.status, !!order.is_return, locale)}</span>
                {order.order_id && <span className="font-mono text-xs text-muted-foreground/70 hidden sm:inline">#{order.order_id}</span>}
                <span className="text-xs text-muted-foreground ml-auto shrink-0">{itemCount} {t(itemCount === 1 ? "customers.dialog.item" : "customers.dialog.items", itemCount === 1 ? "item" : "items")}</span>
                <span className="font-mono font-bold text-sm shrink-0 tabular-nums">{formatIQD(total)}</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 border-t border-(--card-border)">
                            {/* Items */}
                            <div className="divide-y divide-(--card-border)">
                                {lines.length === 0 ? (
                                    <div className="py-3 text-sm text-muted-foreground">{t("customers.dialog.noItems", "No item details on this order.")}</div>
                                ) : lines.map((it, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5">
                                        <ItemThumb url={it.image_url} name={it.name} />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-foreground truncate">{it.name || t("customers.dialog.item")}</div>
                                            <div className="text-xs text-muted-foreground font-mono tabular-nums">×{Number(it.quantity) || 1} · {formatIQD(Number(it.price) || 0)}</div>
                                        </div>
                                        <div className="font-mono font-semibold text-sm tabular-nums">{formatIQD((Number(it.price) || 0) * (Number(it.quantity) || 1))}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Money breakdown */}
                            <div className="mt-3 pt-3 border-t border-(--card-border) space-y-1.5 text-sm">
                                <div className="flex items-center justify-between text-muted-foreground"><span>{t("customers.dialog.subtotal", "Subtotal")}</span><span className="font-mono tabular-nums text-foreground">{formatIQD(subtotal)}</span></div>
                                {discount > 0 && <div className="flex items-center justify-between text-rose-600"><span>{t("customers.dialog.discount", "Discount")}</span><span className="font-mono tabular-nums">−{formatIQD(discount)}</span></div>}
                                {delivery > 0 && <div className="flex items-center justify-between text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />{t("customers.dialog.delivery", "Delivery")}</span><span className="font-mono tabular-nums text-foreground">{formatIQD(delivery)}</span></div>}
                                <div className="flex items-center justify-between pt-1.5 border-t border-(--card-border) font-bold"><span>{t("customers.dialog.total", "Total")}</span><span className="font-mono tabular-nums">{formatIQD(total)}</span></div>
                            </div>

                            {/* Meta: payment + address + notes */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                {order.payment_status && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-(--card-border) text-muted-foreground">
                                        <CreditCard className="w-3.5 h-3.5" />{paymentLabel(order.payment_status, t)}
                                    </span>
                                )}
                                {(order.address_details || order.governorate_code) && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-(--card-border) text-muted-foreground max-w-full">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{[order.address_details, order.governorate_code && (governorateLabel(order.governorate_code, locale) || order.governorate_code)].filter(Boolean).join(" · ")}</span>
                                    </span>
                                )}
                            </div>
                            {order.notes && (
                                <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[13px] text-amber-900">
                                    <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                                    <span>{order.notes}</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function CustomerDetailDialog({ customer, onClose }: { customer: PaginatedCustomer | null; onClose: () => void }) {
    const { t, language } = useLanguage();
    const { can } = usePermission();
    const router = useRouter();
    const setProfileFromList = useCustomerStore((s) => s.setProfileFromList);
    const queryClient = useQueryClient();
    const { tenantId, profile, user } = useAuth();
    const { createOrder } = useOrderCrud();
    const [limit, setLimit] = useState(60);
    const [blacklistMode, setBlacklistMode] = useState<"add" | "remove" | null>(null);
    const [creatingOrder, setCreatingOrder] = useState(false);
    const data = useCustomerDialogData(customer?.phone ?? null, limit);
    const nestedOpen = blacklistMode !== null || creatingOrder;
    const blockedEntry = useQuery({
        queryKey: ["customer-blacklist-entry", tenantId, customer?.phone],
        queryFn: () => fetchBlacklistEntry(tenantId as string, customer?.phone as string),
        enabled: !!tenantId && !!customer && creatingOrder,
        staleTime: 0,
        gcTime: 0,
    });
    const blockedLookupFailed = blockedEntry.isError;
    useEffect(() => {
        if (blockedLookupFailed) {
            toast({ variant: "error", title: t("customers.drawer.blockLookupFailed", "Couldn't check whether this customer is blocked.") });
        }
    }, [blockedLookupFailed, t]);

    const customerPhone = customer?.phone;
    useEffect(() => {
        setBlacklistMode(null);
        setCreatingOrder(false);
    }, [customerPhone]);

    useEffect(() => {
        if (!customer) return;
        setLimit(60); // reset paging each time a new customer opens
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        // A nested dialog (block, new order) handles its own Escape.
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !nestedOpen) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [customer, onClose, nestedOpen]);

    const onBlacklistConfirm = async (reason?: string, notes?: string) => {
        if (!customer || !tenantId) throw new Error("No active store");
        if (blacklistMode === "add") {
            await addToBlacklist({
                tenantId, phone: customer.phone, reason: reason ?? "", notes,
                addedBy: profile?.display_name || user?.email || null,
            });
        } else {
            await removeFromBlacklist(tenantId, customer.phone);
        }
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["customers"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-profile"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-dialog"] }),
        ]);
    };

    const loadedAll = !data.data?.hasMore;
    const canUnblock = can(PERMISSIONS.UNBLOCK_CUSTOMERS);
    const canBlock = can(PERMISSIONS.BLOCK_CUSTOMERS);
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);

    return (
        <AnimatePresence>
            {customer && (
                <Body
                    key={customer.phone}
                    customer={customer}
                    data={data.data}
                    loading={data.isLoading}
                    failed={data.isError}
                    onRetry={() => data.refetch()}
                    fetchingMore={data.isFetching && !data.isLoading}
                    canLoadMore={!loadedAll}
                    onLoadMore={() => setLimit((l) => l + 60)}
                    onClose={onClose}
                    onOpenFull={() => { setProfileFromList(customer.phone); router.push(`/customers/${encodeURIComponent(customer.phone)}`); }}
                    onNewOrder={() => setCreatingOrder(true)}
                    canEdit={canEdit}
                    onToggleBlock={(customer.is_blacklisted ? !canUnblock : !canBlock) ? undefined : () => setBlacklistMode(customer.is_blacklisted ? "remove" : "add")}
                    t={t}
                    locale={language}
                />
            )}
            {customer && blacklistMode && (
                <BlacklistDialog
                    open
                    onClose={() => setBlacklistMode(null)}
                    mode={blacklistMode}
                    customerName={customer.name}
                    customerPhone={formatPhoneDisplay(customer.phone)}
                    onConfirm={onBlacklistConfirm}
                />
            )}
            {customer && creatingOrder && (
                <CreateOrderModal
                    open
                    onClose={() => setCreatingOrder(false)}
                    onCreate={createOrder}
                    getBlacklistEntry={(phone) =>
                        blockedEntry.data && normalizePhoneForSearch(phone) === customer.phone ? blockedEntry.data : null
                    }
                    initialData={{
                        customer_name: customer.name,
                        phone: `0${customer.phone}`,
                        secondary_phone: customer.secondary_phone,
                        city: customer.city ?? undefined,
                        governorate_code: customer.governorate ?? undefined,
                        address_details: customer.address_details,
                    }}
                />
            )}
        </AnimatePresence>
    );
}

function Body({
    customer, data, loading, failed, onRetry, fetchingMore, canLoadMore, onLoadMore, onClose, onOpenFull, onNewOrder, onToggleBlock, canEdit, t, locale,
}: {
    customer: PaginatedCustomer;
    data: ReturnType<typeof useCustomerDialogData>["data"];
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
    fetchingMore: boolean;
    canLoadMore: boolean;
    onLoadMore: () => void;
    onClose: () => void;
    onOpenFull: () => void;
    onNewOrder: () => void;
    /** Omitted when the customer is blocked and the user may not unblock. */
    onToggleBlock?: () => void;
    canEdit: boolean;
    t: Translate;
    locale: Locale;
}) {
    const value = customer.value_tier;
    const risk = customer.risk_level;
    const rated = hasRatedScore(customer.trust_tier);
    const meta = VALUE_META[value];
    const e164 = toIraqE164(customer.phone);
    const gov = customer.governorate ? governorateLabel(customer.governorate, locale) || customer.governorate : null;
    const codKey = codRiskKey(risk);
    // Once the live read is in, every stat comes from it, not from the list's cached row.
    const totalOrders = data?.totalOrders ?? customer.total_orders;
    const completed = data?.completedCount ?? customer.completed_count;
    const spent = data?.totalSpent ?? customer.total_spent;
    const avgBasket = averageBasket(spent, completed) ?? 0;
    const successRate = effectiveSuccessRate(customer);

    const stats: { v: string; k: string }[] = [
        { v: totalOrders.toLocaleString("en-US"), k: t("customers.orders") },
        { v: completed.toLocaleString("en-US"), k: t("customers.card.delivered") },
        { v: formatIQD(spent), k: t("customers.drawer.lifetime") },
        { v: formatIQD(avgBasket), k: t("customers.drawer.avgBasket") },
        { v: `${successRate}%`, k: t("customers.table.success", "Success") },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                onClick={onClose} className="absolute inset-0 bg-zinc-900/45 backdrop-blur-[2px]"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative w-full max-w-[1080px] max-h-[88vh] bg-(--card-bg) rounded-3xl border border-(--card-border) shadow-[0_30px_90px_-20px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center gap-4 px-6 py-4 border-b border-(--card-border) shrink-0">
                    <span className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-xl shrink-0", meta.pillBg, meta.pillText)}>
                        {monogram(customer.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-xl font-extrabold tracking-tight truncate">{customer.name}</h2>
                            <ValuePill tier={value} variant="compact" />
                            <RiskChip risk={risk} showClean />
                            {customer.completed_count > 3 && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
                                    <Star className="w-2.5 h-2.5" />{t("customers.loyal")}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 mt-1 text-[13px] text-muted-foreground flex-wrap">
                            <span className="font-mono tabular-nums inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{formatPhoneDisplay(customer.phone)}</span>
                            {gov && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{gov}</span>}
                            <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{t("customers.drawer.since", { date: monthYear(locale, data?.firstOrderDate ?? customer.first_order_date) })}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-11 h-11 rounded-xl border border-(--card-border) flex items-center justify-center text-muted-foreground hover:bg-muted/40 shrink-0" aria-label={t("common.close")}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scroll body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* Value + COD-risk band */}
                    <div className="grid md:grid-cols-[1fr_auto] gap-3 items-stretch">
                        <div className={cn("rounded-2xl p-4 flex items-center justify-between gap-3", meta.pillBg)}>
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                                    <ShieldCheck className={cn("w-5 h-5", meta.pillText)} />
                                </span>
                                <div className={cn("min-w-0", meta.pillText)}>
                                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{t("customers.value.label", "Value")}</div>
                                    <div className="text-lg font-extrabold leading-tight">{t(`customers.value.${value}`, meta.label)}</div>
                                    <div className="text-[12px] font-medium opacity-80 truncate">{t(codKey)}</div>
                                </div>
                            </div>
                            {rated && <div className={cn("font-mono text-3xl font-semibold tabular-nums shrink-0", meta.pillText)}>{displayScore(customer.trust_score)}<span className="text-sm opacity-60">/100</span></div>}
                        </div>
                        <div className="rounded-2xl border border-(--card-border) bg-background p-3 flex flex-col justify-center gap-2 min-w-[150px]">
                            <RiskChip risk={risk} showClean />
                            <CustomerStatusFlags customer={customer} max={4} />
                        </div>
                    </div>

                    {/* Stat strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {stats.map((s) => (
                            <div key={s.k} className="rounded-2xl border border-(--card-border) bg-background p-3.5">
                                <div className="font-mono text-xl font-extrabold tabular-nums tracking-tight truncate">{s.v}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{s.k}</div>
                            </div>
                        ))}
                    </div>

                    {/* Two columns */}
                    <div className="grid lg:grid-cols-[330px_1fr] gap-5">
                        {/* Left: identity & history + tags/notes */}
                        <div className="space-y-5">
                            <section>
                                <h3 className="text-[15px] font-bold flex items-center gap-2 mb-2.5"><User className="w-4 h-4 text-muted-foreground" />{t("customers.dialog.identity", "Identity & history")}</h3>
                                <div className="rounded-2xl border border-(--card-border) p-3 space-y-3">
                                    {/* Phones */}
                                    <div className="text-[13px]">
                                        <div className="text-muted-foreground text-xs mb-1">{t("customers.dialog.phone", "Phone")}</div>
                                        <div className="font-mono tabular-nums">{formatPhoneDisplay(customer.phone)}</div>
                                        {customer.secondary_phone && <div className="font-mono tabular-nums text-muted-foreground">{formatPhoneDisplay(customer.secondary_phone)}</div>}
                                    </div>
                                    {/* Change timeline */}
                                    {data && data.identity.length > 0 && (
                                        <div className="pt-2 border-t border-(--card-border) space-y-2">
                                            {data.identity.slice(0, 8).map((ev, i) => {
                                                const im = IDENTITY_META[ev.type];
                                                const Icon = im.icon;
                                                return (
                                                    <div key={i} className="flex items-start gap-2.5">
                                                        <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", im.cls)}><Icon className="w-3.5 h-3.5" /></span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t(`customers.dialog.field.${ev.type}`, im.label)} · {fmtDate(locale, ev.at)}</div>
                                                            <div className="text-[13px] truncate">{ev.value}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {(!data || data.identity.length === 0) && !loading && (
                                        <div className="text-xs text-muted-foreground pt-2 border-t border-(--card-border)">{t("customers.dialog.noChanges", "No recorded changes.")}</div>
                                    )}
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[15px] font-bold flex items-center gap-2 mb-2.5"><Tag className="w-4 h-4 text-muted-foreground" />{t("customers.drawer.tagsNotes", "Tags & notes")}</h3>
                                {data && data.notes.length > 0 && (
                                    <div className="mb-3 space-y-2">
                                        {data.notes.map((n, i) => (
                                            <div key={i} className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[13px] text-amber-900">{n.note}</div>
                                        ))}
                                    </div>
                                )}
                                {canEdit && (
                                    <div className="rounded-2xl border border-(--card-border) p-3">
                                        <CustomerQuickActions phone={customer.phone} />
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* Right: order history */}
                        <section>
                            <h3 className="text-[15px] font-bold flex items-center gap-2 mb-2.5">
                                <ShoppingBag className="w-4 h-4 text-muted-foreground" />{t("customers.drawer.recentOrders", "Order history")}
                                {data && <span className="text-xs font-normal text-muted-foreground">({data.totalOrders.toLocaleString("en-US")})</span>}
                            </h3>
                            {loading ? (
                                <div className="space-y-2.5">
                                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-2xl border border-(--card-border) bg-background animate-pulse" />)}
                                </div>
                            ) : data && data.orders.length > 0 ? (
                                <div className="space-y-2.5">
                                    {data.orders.map((o, i) => <OrderCard key={o.id} order={o} defaultOpen={i === 0} t={t} locale={locale} />)}
                                    {canLoadMore && (
                                        <button
                                            onClick={onLoadMore}
                                            disabled={fetchingMore}
                                            className="w-full h-11 rounded-2xl border border-(--card-border) bg-background text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-50 transition-colors"
                                        >
                                            {fetchingMore ? "…" : t("common.loadMore", "Load more")}
                                        </button>
                                    )}
                                </div>
                            ) : failed ? (
                                <div className="rounded-2xl border border-(--card-border) p-8 text-center">
                                    <p className="text-sm text-foreground mb-4">{t("customers.dialog.loadFailed")}</p>
                                    <button onClick={onRetry} className="h-11 px-5 rounded-xl bg-foreground text-background text-sm font-semibold">
                                        {t("customers.profile.retry")}
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-(--card-border) p-8 text-center text-sm text-muted-foreground">{t("customers.dialog.noOrders", "No orders found.")}</div>
                            )}
                        </section>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center gap-2.5 px-4 sm:px-6 py-4 border-t border-(--card-border) shrink-0">
                    <a href={`https://wa.me/${e164}`} target="_blank" rel="noopener noreferrer" className="flex-1 h-12 rounded-2xl bg-(--button-success) text-white font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                        <MessageCircle className="w-4 h-4" /> {t("customers.actions.whatsapp")}
                    </a>
                    <a href={`tel:+${e164}`} className="flex-1 h-12 rounded-2xl border border-(--card-border) font-bold inline-flex items-center justify-center gap-2 hover:bg-muted/40 transition-colors">
                        <Phone className="w-4 h-4" /> {t("customers.drawer.call", "Call")}
                    </a>
                    <button onClick={onOpenFull} aria-label={t("customers.drawer.openFull", "Full profile")} className="h-12 min-w-12 px-4 rounded-2xl border border-(--card-border) font-semibold text-muted-foreground inline-flex items-center justify-center gap-2 hover:bg-muted/40 transition-colors">
                        <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">{t("customers.drawer.openFull", "Full profile")}</span>
                    </button>
                    {onToggleBlock && (
                        <button
                            onClick={onToggleBlock}
                            aria-label={customer.is_blacklisted ? t("customers.details.unblock") : t("customers.drawer.block")}
                            className={cn(
                                "h-12 min-w-12 px-4 rounded-2xl border font-semibold inline-flex items-center justify-center gap-2 transition-colors",
                                customer.is_blacklisted
                                    ? "border-(--card-border) text-foreground hover:bg-muted/40"
                                    : "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40",
                            )}
                        >
                            <Ban className="w-4 h-4" />
                            <span className="hidden sm:inline">{customer.is_blacklisted ? t("customers.details.unblock") : t("customers.drawer.block")}</span>
                        </button>
                    )}
                    <button onClick={onNewOrder} className="basis-full sm:basis-0 flex-1 h-12 rounded-2xl bg-foreground text-background font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                        <Plus className="w-4 h-4" /> {t("customers.drawer.newOrder", "New order")}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
