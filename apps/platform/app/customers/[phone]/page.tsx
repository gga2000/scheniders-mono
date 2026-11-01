"use client";

import { use, useState, useEffect, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Download } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { storedPhoneVariants } from "@/lib/order-server-search";
import type { Database } from "@scheniders/supabase/database.types";
import { formatIQD, getStatusLabel } from "@/lib/utils";
import { orderReceipt } from "@/lib/order-money";
import { isBlockedCustomer } from "@/lib/customer-reliability";
import { formatBaghdadDate, formatPhoneDisplay } from "@/lib/customer-format";
import { toast } from "@/hooks/use-toast";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useTrustScoreHistory } from "@/hooks/use-customer-trust";
import { useCustomerStore } from "@/store/use-customer-store";
import { HeroIdentityBanner } from "@/components/customers/detail/hero-identity-banner";
import { CustomerValueRiskBanner, type CustomerReliability } from "@/components/customers/detail/value-risk-banner";
import { TrustHistoryCard } from "@/components/customers/detail/trust-history-card";
import { BehavioralPatternsCard } from "@/components/customers/detail/behavioral-patterns-card";
import { DossierNotesCard } from "@/components/customers/detail/dossier-notes-card";
import { RatingsCard } from "@/components/customers/detail/ratings-card";
import { ScoreBreakdownModal } from "@/components/customers/modals/score-breakdown-modal";
import { CommunityRatingModal } from "@/components/customers/modals/community-rating-modal";
import { LinkCustomersModal } from "@/components/customers/modals/link-customers-modal";
import { LinkedPeopleSection } from "@/components/customers/detail/linked-people-section";
import { IdentityTimeline } from "@/components/customers/detail/identity-timeline";
import { AddNoteModal } from "@/components/customers/modals/add-note-modal";
import type { CommunityRating, TrustTier } from "@/types/customer";

const CreateOrderModal = dynamic(() => import("@/components/orders/create-order-modal").then((m) => m.CreateOrderModal), { ssr: false });

type ProfileOrder = {
    id: string;
    order_id: string;
    created_at: string;
    items: unknown;
    price: number | null;
    delivery_fee: number | null;
    discount_amount: number | null;
    payment_status: string | null;
    status: string;
    is_return: boolean | null;
    governorate_code: string | null;
};

type ProfileTag = { id: string; name: string; color: string };
type OrderHistoryRow = Database["public"]["Functions"]["get_customer_order_history"]["Returns"][number];

function useCustomerProfile(phone: string) {
    // Every read is pinned to the store being worked in, so a phone that is a
    // customer of two stores never merges their orders, notes and trust.
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-profile", tenantId, phone],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active store");
            const normalized = normalizePhoneForSearch(phone);
            const variants = storedPhoneVariants(normalized);

            const [trustRes, aggRes, notesRes, tagsRes, blacklistRes, reliabilityRes, ordersRes, ratingsRes] = await Promise.all([
                supabase.from("customer_trust").select("trust_score, trust_tier, delivery_success_rate")
                    .eq("tenant_id", tenantId).eq("phone", normalized).maybeSingle(),
                // mv_customer_metrics is keyed by the normalized phone.
                supabase.from("customer_aggregates").select("*")
                    .eq("tenant_id", tenantId).eq("customer_phone", normalized).maybeSingle(),
                supabase.from("customer_notes").select("*")
                    .eq("tenant_id", tenantId).in("customer_phone", variants)
                    .order("created_at", { ascending: false }),
                supabase.from("customer_tag_assignments").select("tag:customer_tags(*)")
                    .eq("tenant_id", tenantId).in("customer_phone", variants),
                supabase.from("blacklist").select("phone")
                    .eq("tenant_id", tenantId).in("phone", variants).limit(1),
                // Totals and counts use the same delivered-only rule as the list.
                supabase.rpc("get_customer_reliability", { p_phone: normalized }),
                // Matched on the normalized phone in the active store, so orders
                // stored as "07… " or 9640… are listed too.
                supabase.rpc("get_customer_order_history", { p_phone: normalized })
                    .order("created_at", { ascending: false })
                    .limit(200),
                supabase.from("community_ratings").select("*")
                    .eq("tenant_id", tenantId).in("customer_phone", variants)
                    .order("created_at", { ascending: false }),
            ]);
            for (const res of [trustRes, aggRes, notesRes, tagsRes, blacklistRes, reliabilityRes, ordersRes, ratingsRes]) {
                if (res.error) throw res.error;
            }

            const trust = trustRes.data;
            const agg = aggRes.data;
            const reliability = (reliabilityRes.data as CustomerReliability[] | null)?.[0] ?? null;
            const orders: ProfileOrder[] = ((ordersRes.data ?? []) as OrderHistoryRow[]).map((o) => ({
                id: o.id, order_id: o.order_id, created_at: o.created_at, items: o.items, price: o.price,
                delivery_fee: o.delivery_fee, discount_amount: o.discount_amount, payment_status: o.payment_status, status: o.status, is_return: o.is_return, governorate_code: o.governorate_code,
            }));
            const totalOrders = Number(reliability?.total_orders ?? 0);
            const completed = Number(reliability?.completed_count ?? 0);

            return {
                phone: normalized,
                name: agg?.latest_name ?? null,
                city: agg?.latest_city ?? null,
                governorate: agg?.latest_governorate ?? null,
                secondaryPhone: agg?.latest_secondary_phone ?? null,
                addressDetails: agg?.latest_address_details ?? null,
                totalOrders,
                totalSpent: Number(reliability?.total_spent ?? 0),
                lastOrderDate: agg?.last_order_date ?? orders[0]?.created_at ?? null,
                firstOrderDate: agg?.first_order_date ?? orders[orders.length - 1]?.created_at ?? null,
                // Same neutral default as the list until the trust engine has scored them.
                // No trust row yet means not scored, not an average 50.
                trustScore: trust?.trust_score ?? null,
                trustTier: (trust?.trust_tier ?? "new") as TrustTier,
                // The trust engine's rate counts finished orders only (in-flight
                // ones have not failed); without a trust row, fall back to all orders.
                deliverySuccessRate: trust
                    ? Number(trust.delivery_success_rate ?? 0)
                    : totalOrders > 0 ? (completed / totalOrders) * 100 : 0,
                totalCompleted: completed,
                isBlacklisted: (blacklistRes.data ?? []).length > 0,
                notes: notesRes.data ?? [],
                ratings: (ratingsRes.data ?? []) as CommunityRating[],
                tags: ((tagsRes.data ?? []) as unknown as { tag: ProfileTag | null }[])
                    .flatMap((ta) => (ta.tag ? [ta.tag] : [])),
                orders,
                reliability,
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}

const STATUS_TONE: Record<string, string> = {
    delivered: "bg-[#c7f8ef] text-[#33605a] dark:bg-emerald-500/15 dark:text-emerald-200",
    completed: "bg-[#c7f8ef] text-[#33605a] dark:bg-emerald-500/15 dark:text-emerald-200",
    rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    returned: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    return_pending: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    cancelled: "bg-muted/50 text-muted-foreground",
    in_transit: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
    shipping: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
    confirmed: "bg-[#FBE38E]/30 text-foreground",
};

function OrderStatusBadge({ status, isReturn }: { status: string; isReturn: boolean }) {
    const { language } = useLanguage();
    const tone = STATUS_TONE[status?.toLowerCase()] ?? "bg-muted/50 text-muted-foreground";
    return (
        <span className={`${tone} px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap`}>
            {getStatusLabel(status, isReturn, language)}
        </span>
    );
}

const HISTORY_ROWS = 20;

function CustomerProfileContent({ phone }: { phone: string }) {
    const { t, language } = useLanguage();
    const { can } = usePermission();
    const canExport = can(PERMISSIONS.EXPORT_CUSTOMERS);
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const { tenantId } = useAuth();
    const router = useRouter();
    const store = useCustomerStore();
    const { createOrder } = useOrderCrud();
    // Opened from the list's drawer: step back (the list keeps its scroll and no
    // history entry is stacked). Opened from anywhere else: go to the list with
    // the filters it last had.
    // A different profile (a linked customer, a Finances link) was not opened by
    // the list, so the mark from an earlier one no longer applies.
    const { profileFromList, setProfileFromList } = store;
    useEffect(() => {
        if (profileFromList && profileFromList !== phone) setProfileFromList(null);
    }, [phone, profileFromList, setProfileFromList]);
    const goBackToList = () => {
        if (store.profileFromList === phone) {
            store.setProfileFromList(null);
            router.back();
            return;
        }
        router.push(store.lastListQuery ? `/customers?${store.lastListQuery}` : "/customers");
    };
    const [creatingOrder, setCreatingOrder] = useState(false);

    const { data: profile, isLoading, isError, refetch, isRefetching } = useCustomerProfile(phone);
    const { data: historyData } = useTrustScoreHistory(profile?.phone);

    if (isError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("customers.profile.loadFailed")}</p>
                <button
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    className="px-5 py-2.5 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-50"
                >
                    {t("customers.profile.retry")}
                </button>
            </div>
        );
    }

    if (isLoading || !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
        );
    }

    const displayName = profile.name ?? formatPhoneDisplay(profile.phone);
    // One rule for "blocked" on the hero, the score breakdown and the new-order action.
    const blocked = isBlockedCustomer({
        is_blacklisted: profile.isBlacklisted,
        risk_level: profile.reliability?.risk_level ?? null,
        trust_tier: profile.trustTier,
    });

    return (
        <div className="customers-page customer-profile relative min-h-screen px-6 md:px-8 pt-4 pb-10 space-y-4">
            {/* Back, and the JSON export */}
            <div className="flex items-center justify-between gap-4">
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={goBackToList}
                    className="flex items-center gap-2 h-10 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">{t("customers.title")}</span>
                </motion.button>

                {/* Lazy-loads customer-data-export to keep this route's bundle lean. */}
                {canExport && (
                    <button
                        onClick={async () => {
                            if (!tenantId) return;
                            try {
                                const { customerDataExport } = await import("@/lib/customer-data-export");
                                await customerDataExport.downloadAsJSON(tenantId, phone);
                            } catch {
                                toast({ variant: "error", title: t("customers.export.failed") });
                            }
                        }}
                        title={t("customers.profile.exportJsonHint")}
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-medium bg-background border border-(--card-border) text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        {t("customers.profile.exportJson")}
                    </button>
                )}
            </div>

            <HeroIdentityBanner
                name={displayName}
                phone={profile.phone}
                city={profile.city ?? undefined}
                tier={profile.trustTier}
                valueTier={profile.reliability ? profile.reliability.value_tier : null}
                riskLevel={profile.reliability ? profile.reliability.risk_level : null}
                trustScore={profile.trustScore}
                totalOrders={profile.totalOrders}
                isBlacklisted={profile.isBlacklisted}
                tags={profile.tags}
                firstOrderDate={profile.firstOrderDate}
                showAxes={!profile.reliability || profile.reliability.total_orders === 0}
                onNewOrder={blocked ? undefined : () => setCreatingOrder(true)}
            />

            {/* Value + risk, the order numbers and the last outcomes: the one place these figures live */}
            {profile.reliability && (
                <CustomerValueRiskBanner
                    reliability={profile.reliability}
                    successRate={profile.deliverySuccessRate}
                    orders={profile.orders}
                />
            )}

            {/* Order history: what staff open a profile for, in the first screen */}
            <section className="bg-(--card-bg) rounded-2xl px-6 pt-5 pb-3 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-baseline justify-between gap-4 mb-2">
                    <h3 className="font-headline font-extrabold text-lg text-foreground">
                        {t("customers.profile.orderHistory")}
                    </h3>
                    {profile.orders.length > HISTORY_ROWS && (
                        <Link
                            href={`/orders?search=0${profile.phone}`}
                            className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t("customers.profile.viewAll", { count: profile.totalOrders.toLocaleString("en-US") })}
                        </Link>
                    )}
                </div>

                <table className="w-full text-left">
                    <thead>
                        <tr className="text-muted-foreground text-xs font-semibold border-b border-(--card-border)">
                            <th className="py-2.5 px-3 font-semibold">{t("customers.profile.col.order")}</th>
                            <th className="py-2.5 px-3 font-semibold">{t("customers.profile.col.date")}</th>
                            <th className="py-2.5 px-3 font-semibold">{t("customers.profile.col.items")}</th>
                            <th className="py-2.5 px-3 font-semibold text-right">{t("customers.profile.col.amount")}</th>
                            <th className="py-2.5 px-3 font-semibold">{t("customers.profile.col.status")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-border)">
                        {profile.orders.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                                    {t("customers.orders.noOrders")}
                                </td>
                            </tr>
                        ) : (
                            profile.orders.slice(0, HISTORY_ROWS).map((order) => {
                                const parsed = Array.isArray(order.items) ? order.items : null;
                                const lineCount = parsed ? mergeOrderItems(parsed).length : null;
                                const href = `/orders?search=${encodeURIComponent(order.order_id)}`;
                                return (
                                    // The whole row opens the order; the order number is a real link for a new tab.
                                    <tr
                                        key={order.id}
                                        onClick={() => router.push(href)}
                                        className="cursor-pointer hover:bg-muted/20 transition-colors"
                                    >
                                        <td className="py-2.5 px-3 font-mono font-semibold text-sm tabular-nums text-foreground">
                                            <Link
                                                href={href}
                                                onClick={(e) => e.stopPropagation()}
                                                aria-label={`${t("customers.profile.viewOrder")} #${order.order_id}`}
                                                className="hover:underline underline-offset-2"
                                            >
                                                #{order.order_id}
                                            </Link>
                                        </td>
                                        <td className="py-2.5 px-3 text-muted-foreground text-[13px] tabular-nums whitespace-nowrap">
                                            {formatBaghdadDate(order.created_at, language)}
                                        </td>
                                        <td className="py-2.5 px-3 text-muted-foreground text-[13px]">
                                            {lineCount === null ? "—" : `${lineCount} ${t(lineCount === 1 ? "customers.dialog.item" : "customers.dialog.items")}`}
                                        </td>
                                        {/* The same total as the drawer's receipt: items less discount, plus delivery. */}
                                        <td className="py-2.5 px-3 font-mono font-semibold text-sm tabular-nums text-foreground text-right whitespace-nowrap">
                                            {formatIQD(orderReceipt(order).total)}
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <OrderStatusBadge status={order.status} isReturn={!!order.is_return} />
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </section>

            {/* Trust trend, buying patterns, notes */}
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 xl:col-span-7">
                    <TrustHistoryCard data={historyData || []} phone={profile.phone} />
                </div>
                <div className="col-span-12 xl:col-span-5">
                    <BehavioralPatternsCard
                        orders={profile.orders}
                        firstOrderDate={profile.firstOrderDate}
                        city={profile.city}
                        governorate={profile.governorate}
                        phone={profile.phone}
                        trustTier={profile.trustTier}
                    />
                </div>
                <div className="col-span-12">
                    <DossierNotesCard
                        notes={profile.notes}
                        onAddNote={canEdit ? () => store.setAddNoteModalOpen(true) : undefined}
                    />
                </div>

                {/* Ratings, links and identity changes: one line each while empty */}
                <div className="col-span-12 lg:col-span-4">
                    <RatingsCard ratings={profile.ratings} />
                </div>
                <div className="col-span-12 lg:col-span-4">
                    <LinkedPeopleSection phone={profile.phone} />
                </div>
                <div className="col-span-12 lg:col-span-4">
                    <IdentityTimeline phone={profile.phone} />
                </div>
            </div>

            {creatingOrder && (
                <CreateOrderModal
                    open
                    onClose={() => setCreatingOrder(false)}
                    onCreate={createOrder}
                    initialData={{
                        customer_name: profile.name ?? undefined,
                        phone: `0${profile.phone}`,
                        secondary_phone: profile.secondaryPhone ?? undefined,
                        city: profile.city ?? undefined,
                        governorate_code: profile.governorate ?? undefined,
                        address_details: profile.addressDetails ?? undefined,
                    }}
                />
            )}

            {/* Modals */}
            <ScoreBreakdownModal score={profile.trustScore} blocked={blocked} />
            <CommunityRatingModal />
            <LinkCustomersModal />
            <AddNoteModal phone={profile.phone} />
        </div>
    );
}

export default function CustomerProfilePage({ params }: { params: Promise<{ phone: string }> }) {
    const { phone } = use(params);

    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
        }>
            <CustomerProfileContent phone={decodeURIComponent(phone)} />
        </Suspense>
    );
}
