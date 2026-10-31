"use client";

import { use, useState, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Download } from "lucide-react";
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
import { formatPhoneDisplay } from "@/lib/customer-format";
import { toast } from "@/hooks/use-toast";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useTrustScoreHistory } from "@/hooks/use-customer-trust";
import { useCustomerStore } from "@/store/use-customer-store";
import { HeroIdentityBanner } from "@/components/customers/detail/hero-identity-banner";
import { CustomerValueRiskBanner, type CustomerReliability } from "@/components/customers/detail/value-risk-banner";
import { DeliverySuccessCard } from "@/components/customers/detail/delivery-success-card";
import { TrustHistoryCard } from "@/components/customers/detail/trust-history-card";
import { BehavioralPatternsCard } from "@/components/customers/detail/behavioral-patterns-card";
import { SummaryStatsCards } from "@/components/customers/detail/summary-stats-cards";
import { DossierNotesCard } from "@/components/customers/detail/dossier-notes-card";
import { RatingsCard } from "@/components/customers/detail/ratings-card";
import { FabNewShipment } from "@/components/customers/detail/fab-new-shipment";
import { ScoreBreakdownModal } from "@/components/customers/modals/score-breakdown-modal";
import { CommunityRatingModal } from "@/components/customers/modals/community-rating-modal";
import { LinkCustomersModal } from "@/components/customers/modals/link-customers-modal";
import { LinkedPeopleSection } from "@/components/customers/detail/linked-people-section";
import { IdentityTimeline } from "@/components/customers/detail/identity-timeline";
import { ActivityLogTimeline } from "@/components/customers/detail/activity-log-timeline";
import { AddNoteModal } from "@/components/customers/modals/add-note-modal";
import type { CommunityRating, TrustTier } from "@/types/customer";

const CreateOrderModal = dynamic(() => import("@/components/orders/create-order-modal").then((m) => m.CreateOrderModal), { ssr: false });

type ProfileOrder = {
    id: string;
    order_id: string;
    created_at: string;
    items: unknown;
    price: number | null;
    total_price: number;
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
                supabase.from("customer_trust").select("trust_score, trust_tier")
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
                total_price: o.price ?? 0, status: o.status, is_return: o.is_return, governorate_code: o.governorate_code,
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
                deliverySuccessRate: totalOrders > 0 ? (completed / totalOrders) * 100 : 0,
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
    delivered: "bg-[#c7f8ef] text-[#33605a]",
    completed: "bg-[#c7f8ef] text-[#33605a]",
    rejected: "bg-red-100 text-red-700",
    returned: "bg-red-100 text-red-700",
    return_pending: "bg-red-100 text-red-700",
    cancelled: "bg-muted/50 text-muted-foreground",
    in_transit: "bg-blue-100 text-blue-700",
    shipping: "bg-blue-100 text-blue-700",
    confirmed: "bg-[#FBE38E]/30 text-foreground",
};

function OrderStatusBadge({ status, isReturn }: { status: string; isReturn: boolean }) {
    const { language } = useLanguage();
    const tone = STATUS_TONE[status?.toLowerCase()] ?? "bg-muted/50 text-muted-foreground";
    return (
        <span className={`${tone} px-3 py-1.5 rounded-full text-[10px] font-bold uppercase`}>
            {getStatusLabel(status, isReturn, language)}
        </span>
    );
}

const HISTORY_ROWS = 20;

function CustomerProfileContent({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const { can } = usePermission();
    const canExport = can(PERMISSIONS.EXPORT_CUSTOMERS);
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const { tenantId } = useAuth();
    const router = useRouter();
    const store = useCustomerStore();
    const { createOrder } = useOrderCrud();
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

    return (
        <div className="customers-page customer-profile relative min-h-screen p-6 md:p-8 lg:p-10 pb-24">
            {/* Back button */}
            <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => router.push(store.lastListQuery ? `/customers?${store.lastListQuery}` : "/customers")}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">{t("customers.title")}</span>
            </motion.button>

            {/* Floating export action (top-right). Lazy-loads customer-data-export to keep this route's bundle lean. */}
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
                    className="absolute right-6 top-6 z-10 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-medium bg-background border border-(--card-border) text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    {t("customers.profile.exportJson")}
                </button>
            )}

            {/* Hero Banner — peer badges + Rate button now live inside */}
            <div className="mb-8">
                <HeroIdentityBanner
                    name={displayName}
                    phone={profile.phone}
                    city={profile.city ?? undefined}
                    tier={profile.trustTier}
                    trustScore={profile.trustScore}
                    totalOrders={profile.totalOrders}
                    isBlacklisted={profile.isBlacklisted}
                    tags={profile.tags}
                    firstOrderDate={profile.firstOrderDate}
                />
            </div>

            {/* Two-axis VALUE + RISK headline — keeps the full profile consistent with the list/dialog */}
            {profile.reliability && (
                <div className="mb-8">
                    <CustomerValueRiskBanner reliability={profile.reliability} />
                </div>
            )}

            {/* Bento Grid — Stitch Layout */}
            <div className="grid grid-cols-12 gap-6">
                {/* Row 1: Delivery Success (col-span-4) + Trust History (col-span-8) */}
                <div className="col-span-12 lg:col-span-4">
                    <DeliverySuccessCard
                        successRate={profile.deliverySuccessRate}
                        recentOrders={profile.orders}
                        totalCompletedFromTrust={profile.totalCompleted}
                    />
                </div>
                <div className="col-span-12 lg:col-span-8">
                    <TrustHistoryCard data={historyData || []} phone={profile.phone} />
                </div>

                {/* Row 2: Behavioral Patterns (col-span-5) + Dossier Notes (col-span-7) */}
                <div className="col-span-12 lg:col-span-5">
                    <BehavioralPatternsCard
                        orders={profile.orders}
                        firstOrderDate={profile.firstOrderDate}
                        city={profile.city}
                        governorate={profile.governorate}
                        phone={profile.phone}
                        trustTier={profile.trustTier}
                    />
                </div>
                <div className="col-span-12 lg:col-span-7">
                    <DossierNotesCard
                        notes={profile.notes}
                        onAddNote={canEdit ? () => store.setAddNoteModalOpen(true) : undefined}
                    />
                </div>

                <div className="col-span-12">
                    <RatingsCard ratings={profile.ratings} />
                </div>

                {/* Row 3: Summary Stats (col-span-7) + Linked People (col-span-5) */}
                <div className="col-span-12 lg:col-span-7">
                    <SummaryStatsCards
                        totalOrders={profile.totalOrders}
                        totalSpent={profile.totalSpent}
                        orders={profile.orders}
                    />
                </div>
                <div className="col-span-12 lg:col-span-5">
                    <LinkedPeopleSection phone={profile.phone} />
                </div>

                {/* Row 4: Identity Timeline (col-span-12) */}
                <div className="col-span-12">
                    <IdentityTimeline phone={profile.phone} />
                </div>

                {/* Activity Log — unified chronological feed of orders + notes */}
                <div className="col-span-12">
                    <ActivityLogTimeline orders={profile.orders} notes={profile.notes || []} />
                </div>

                {/* Row 5: Order History (col-span-12) */}
                <div className="col-span-12">
                    <div className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                        <h3 className="font-headline font-extrabold text-xl text-foreground mb-8">
                            {t("customers.profile.orderHistory")}
                        </h3>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest border-b border-muted/20">
                                        <th className="pb-6 px-4">{t("customers.profile.col.order")}</th>
                                        <th className="pb-6 px-4">{t("customers.profile.col.date")}</th>
                                        <th className="pb-6 px-4">{t("customers.profile.col.items")}</th>
                                        <th className="pb-6 px-4">{t("customers.profile.col.amount")}</th>
                                        <th className="pb-6 px-4">{t("customers.profile.col.status")}</th>
                                        <th className="pb-6 px-4 text-right"><span className="sr-only">{t("customers.profile.viewOrder")}</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-muted/10">
                                    {profile.orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                                                {t("customers.orders.noOrders")}
                                            </td>
                                        </tr>
                                    ) : (
                                        profile.orders.slice(0, HISTORY_ROWS).map((order) => {
                                            const parsed = Array.isArray(order.items) ? order.items : null;
                                            const lineCount = parsed ? mergeOrderItems(parsed).length : null;
                                            return (
                                                <tr key={order.id} className="group hover:bg-muted/10 transition-colors">
                                                    <td className="py-6 px-4 font-headline font-bold text-sm tabular-nums text-foreground">
                                                        #{order.order_id}
                                                    </td>
                                                    <td className="py-6 px-4 text-muted-foreground text-xs tabular-nums">
                                                        {order.created_at.slice(0, 10)}
                                                    </td>
                                                    <td className="py-6 px-4 text-muted-foreground text-xs">
                                                        {lineCount === null ? "—" : t("customers.profile.itemsCount", { count: lineCount })}
                                                    </td>
                                                    <td className="py-6 px-4 font-bold text-sm tabular-nums text-foreground">
                                                        {formatIQD(Number(order.price || 0))}
                                                    </td>
                                                    <td className="py-6 px-4">
                                                        <OrderStatusBadge status={order.status} isReturn={!!order.is_return} />
                                                    </td>
                                                    <td className="py-6 px-4 text-right">
                                                        <Link
                                                            href={`/orders?search=${encodeURIComponent(order.order_id)}`}
                                                            aria-label={t("customers.profile.viewOrder")}
                                                            className="inline-flex text-muted-foreground/50 hover:text-foreground transition-colors"
                                                        >
                                                            <Eye className="w-5 h-5" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {profile.orders.length > HISTORY_ROWS && (
                            <div className="mt-10 flex justify-center">
                                <Link
                                    href={`/orders?search=0${profile.phone}`}
                                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.2em]"
                                >
                                    {t("customers.profile.viewAll", { count: profile.totalOrders.toLocaleString("en-US") })}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <FabNewShipment onClick={() => setCreatingOrder(true)} />

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
            <ScoreBreakdownModal />
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
