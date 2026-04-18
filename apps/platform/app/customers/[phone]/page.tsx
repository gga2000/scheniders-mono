"use client";

import { use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Filter, Eye } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { trustEngine } from "@/lib/fraud-detector";
import { useTrustScoreHistory } from "@/hooks/use-customer-trust";
import { useVoiceNotes } from "@/hooks/use-voice-notes";
import { useCustomerStore } from "@/store/use-customer-store";
import { HeroIdentityBanner } from "@/components/customers/detail/hero-identity-banner";
import { DeliverySuccessCard } from "@/components/customers/detail/delivery-success-card";
import { TrustHistoryCard } from "@/components/customers/detail/trust-history-card";
import { BehavioralPatternsCard } from "@/components/customers/detail/behavioral-patterns-card";
import { SummaryStatsCards } from "@/components/customers/detail/summary-stats-cards";
import { DossierNotesCard } from "@/components/customers/detail/dossier-notes-card";
import { FabNewShipment } from "@/components/customers/detail/fab-new-shipment";
import { ScoreBreakdownModal } from "@/components/customers/modals/score-breakdown-modal";
import { CommunityRatingModal } from "@/components/customers/modals/community-rating-modal";
import { LinkCustomersModal } from "@/components/customers/modals/link-customers-modal";
import { VoiceRecorderModal } from "@/components/customers/modals/voice-recorder-modal";
import { PeerComparisonBadge } from "@/components/customers/detail/peer-comparison-badge";
import { LinkedPeopleSection } from "@/components/customers/detail/linked-people-section";
import { AiSummaryCard } from "@/components/customers/detail/ai-summary-card";
import { IdentityTimeline } from "@/components/customers/detail/identity-timeline";
import { ConfidenceIndicator } from "@/components/customers/shared/confidence-indicator";
import type { TrustTier } from "@/types/customer";

function useCustomerProfile(phone: string) {
    return useQuery({
        queryKey: ["customer-profile", phone],
        queryFn: async () => {
            const normalized = trustEngine.normalizePhone(phone);
            const phoneVariants = [normalized, `0${normalized}`, `+964${normalized}`];

            const { data: trust } = await supabase
                .from("customer_trust")
                .select("*")
                .eq("phone", normalized)
                .maybeSingle();

            const { data: aggRows } = await supabase
                .from("mv_customer_aggregates")
                .select("*")
                .in("customer_phone", phoneVariants)
                .limit(1);
            const agg = aggRows?.[0] || null;

            const { data: notes } = await supabase
                .from("customer_notes")
                .select("*")
                .in("customer_phone", phoneVariants)
                .order("created_at", { ascending: false });

            const { data: tagAssignments } = await supabase
                .from("customer_tag_assignments")
                .select("*, tag:customer_tags(*)")
                .in("customer_phone", phoneVariants);

            const { data: blacklistRows } = await supabase
                .from("blacklist")
                .select("phone")
                .in("phone", phoneVariants)
                .limit(1);
            const blacklist = blacklistRows?.[0] || null;

            // Fetch orders for the order history table
            const { data: orders } = await supabase
                .from("orders")
                .select("id, created_at, items, total_price, status, governorate")
                .in("customer_phone", phoneVariants)
                .order("created_at", { ascending: false })
                .limit(20);

            return {
                phone: normalized,
                name: agg?.latest_name || "Unknown",
                city: agg?.latest_city,
                governorate: agg?.latest_governorate,
                totalOrders: Number(agg?.total_orders || 0),
                totalSpent: Number(agg?.total_spent || 0),
                lastOrderDate: agg?.last_order_date,
                firstOrderDate: agg?.first_order_date,
                trustScore: trust?.trust_score ?? 100,
                trustTier: (trust?.trust_tier ?? "new") as TrustTier,
                deliverySuccessRate: Number(trust?.delivery_success_rate ?? 0),
                isBlacklisted: !!blacklist,
                notes: notes || [],
                tags: (tagAssignments || []).map((ta: any) => ta.tag).filter(Boolean),
                orders: orders || [],
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}

function OrderStatusBadge({ status }: { status: string }) {
    const s = status?.toLowerCase();
    if (s === "delivered" || s === "completed") {
        return <span className="bg-[#c7f8ef] text-[#33605a] px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">Delivered</span>;
    }
    if (s === "rejected" || s === "returned") {
        return <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">Returned</span>;
    }
    if (s === "in_transit" || s === "shipping") {
        return <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">In Transit</span>;
    }
    if (s === "confirmed") {
        return <span className="bg-[#FBE38E]/30 text-foreground px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">Confirmed</span>;
    }
    return <span className="bg-muted/50 text-muted-foreground px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">{status}</span>;
}

function CustomerProfileContent({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const router = useRouter();
    const store = useCustomerStore();

    const { data: profile, isLoading } = useCustomerProfile(phone);
    const { data: historyData } = useTrustScoreHistory(profile?.phone);
    const { data: voiceNotes } = useVoiceNotes(profile?.phone);

    if (isLoading || !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="customers-page customer-profile min-h-screen p-6 md:p-8 lg:p-10 pb-24">
            {/* Back button */}
            <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => router.push("/customers")}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">{t("customers.title")}</span>
            </motion.button>

            {/* Hero Banner */}
            <HeroIdentityBanner
                name={profile.name}
                phone={profile.phone}
                city={profile.city}
                tier={profile.trustTier}
                trustScore={profile.trustScore}
                totalOrders={profile.totalOrders}
                isBlacklisted={profile.isBlacklisted}
                tags={profile.tags}
                firstOrderDate={profile.firstOrderDate}
            />

            {/* Peer badges row */}
            <div className="flex items-center gap-3 mb-8 -mt-2">
                <PeerComparisonBadge phone={profile.phone} city={profile.city || null} />
                <ConfidenceIndicator orderCount={profile.totalOrders} />
            </div>

            {/* Bento Grid — Stitch Layout */}
            <div className="grid grid-cols-12 gap-6">
                {/* Row 1: Delivery Success (col-span-4) + Trust History (col-span-8) */}
                <div className="col-span-12 lg:col-span-4">
                    <DeliverySuccessCard successRate={profile.deliverySuccessRate} />
                </div>
                <div className="col-span-12 lg:col-span-8">
                    <TrustHistoryCard data={historyData || []} />
                </div>

                {/* Row 2: Behavioral Patterns (col-span-5) + Dossier Notes (col-span-7) */}
                <div className="col-span-12 lg:col-span-5">
                    <BehavioralPatternsCard />
                </div>
                <div className="col-span-12 lg:col-span-7">
                    <DossierNotesCard
                        notes={profile.notes}
                        voiceNotes={voiceNotes || []}
                        onAddNote={() => {/* TODO */}}
                        onPlayVoice={(id) => {/* TODO */}}
                    />
                </div>

                {/* Row 3: AI Summary (col-span-12) */}
                <div className="col-span-12">
                    <AiSummaryCard phone={profile.phone} />
                </div>

                {/* Row 4: Summary Stats (col-span-7) + Linked People (col-span-5) */}
                <div className="col-span-12 lg:col-span-7">
                    <SummaryStatsCards
                        totalOrders={profile.totalOrders}
                        totalSpent={profile.totalSpent}
                    />
                </div>
                <div className="col-span-12 lg:col-span-5">
                    <LinkedPeopleSection phone={profile.phone} />
                </div>

                {/* Row 5: Identity Timeline (col-span-12) */}
                <div className="col-span-12">
                    <IdentityTimeline phone={profile.phone} />
                </div>

                {/* Row 6: Order History (col-span-12) */}
                <div className="col-span-12">
                    <div className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-headline font-extrabold text-xl text-foreground">
                                {t("customers.profile.orderHistory")}
                            </h3>
                            <div className="flex gap-4">
                                <button className="flex items-center gap-2 px-5 py-2.5 bg-muted/30 rounded-full hover:bg-muted/50 transition-colors">
                                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-bold text-foreground">{t("customers.profile.filterByStatus")}</span>
                                </button>
                                <button className="text-xs font-bold bg-foreground text-background px-6 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all uppercase tracking-wide">
                                    {t("customers.profile.exportHistory")}
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest border-b border-muted/20">
                                        <th className="pb-6 px-4">Order ID</th>
                                        <th className="pb-6 px-4">Date</th>
                                        <th className="pb-6 px-4">Items</th>
                                        <th className="pb-6 px-4">Amount</th>
                                        <th className="pb-6 px-4">Status</th>
                                        <th className="pb-6 px-4 text-right">Actions</th>
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
                                        profile.orders.map((order: any) => {
                                            const items = (() => {
                                                try {
                                                    const parsed = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
                                                    if (Array.isArray(parsed)) return `${parsed.length} item${parsed.length !== 1 ? "s" : ""}`;
                                                } catch {}
                                                return "—";
                                            })();
                                            return (
                                                <tr key={order.id} className="group hover:bg-muted/10 transition-colors">
                                                    <td className="py-6 px-4 font-headline font-bold text-sm tabular-nums text-foreground">
                                                        #{order.id?.toString().slice(-6).toUpperCase()}
                                                    </td>
                                                    <td className="py-6 px-4 text-muted-foreground text-xs">
                                                        {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                                                    </td>
                                                    <td className="py-6 px-4 text-muted-foreground text-xs">{items}</td>
                                                    <td className="py-6 px-4 font-bold text-sm tabular-nums text-foreground">
                                                        IQD {Number(order.total_price || 0).toLocaleString("en-US")}
                                                    </td>
                                                    <td className="py-6 px-4">
                                                        <OrderStatusBadge status={order.status} />
                                                    </td>
                                                    <td className="py-6 px-4 text-right">
                                                        <button
                                                            onClick={() => router.push(`/orders?highlight=${order.id}`)}
                                                            className="text-muted-foreground/30 hover:text-foreground transition-colors"
                                                        >
                                                            <Eye className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {profile.totalOrders > 20 && (
                            <div className="mt-10 flex justify-center">
                                <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.2em]">
                                    {t("customers.profile.viewAll").replace("{count}", profile.totalOrders.toLocaleString("en-US"))}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <FabNewShipment customerPhone={profile.phone} />

            {/* Modals */}
            <ScoreBreakdownModal />
            <CommunityRatingModal />
            <LinkCustomersModal />
            <VoiceRecorderModal />
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
