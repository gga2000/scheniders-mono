"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { BentoMetrics, HealthScore, calculateLoyaltyScore } from "./bento-metrics";
import { CustomerTimeline } from "./customer-timeline";
import { PurchaseHeatmap } from "./purchase-heatmap";
import { CustomerProfileSkeleton } from "@scheniders/ui/skeletons";
import { cn, formatIQD, generateWhatsAppLink } from "@/lib/utils";
import { Crown, Star, User, Phone, MapPin, Package, MessageCircle, PackagePlus } from "lucide-react";
import Link from "next/link";
import { CommandPalette } from "./command-palette";
import { ReorderChoiceDialog } from "./reorder-choice-dialog";
import { CreateOrderModal } from "../orders/create-order-modal";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { checkOrderIdExists } from "@/app/actions/orders";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";

interface CustomerProfilePanelProps {
    customerSummary: PaginatedCustomer;
}

export function CustomerProfilePanel({ customerSummary }: CustomerProfilePanelProps) {
    const { phone } = customerSummary;
    const { t } = useLanguage();
    const { session } = useAuth();

    // The server action authenticates the caller and derives their tenant from
    // this token, so the duplicate check only ever sees this tenant's orders.
    const checkOrderIdExistsForCaller = useCallback(
        (orderId: string) => checkOrderIdExists(orderId, undefined, session?.access_token ?? ""),
        [session?.access_token],
    );

    // Fetch the deep order history and notes for this specific customer
    const { data: deepData, isLoading, isError } = useQuery({
        queryKey: ["customer", "deep", phone],
        queryFn: async () => {
            // 1. Fetch all orders
            const { data: orders, error: ordersError } = await supabase
                .from("orders")
                .select("*")
                .eq("phone", phone)
                .order("created_at", { ascending: false });

            if (ordersError) throw ordersError;

            // 2. Fetch all notes
            const { data: notes, error: notesError } = await supabase
                .from("customer_notes")
                .select("*")
                .eq("customer_phone", phone)
                .order("created_at", { ascending: false });

            if (notesError) throw notesError;

            // 3. Fetch specific Tags
            const { data: tagsData, error: tagsError } = await supabase
                .from("customer_tag_assignments")
                .select(`
                    id,
                    created_at,
                    tag:customer_tags (id, name, color)
                `)
                .eq("customer_phone", phone);

            if (tagsError) throw tagsError;

            return {
                orders: orders || [],
                notes: notes || [],
                tags: tagsData?.map(t => ({ ...t.tag, assignment_date: t.created_at })) || [],
            };
        },
        staleTime: 1000 * 60 * 2, // 2 mins fresh
    });

    // Reorder functionality state
    const [showReorderChoice, setShowReorderChoice] = useState(false);
    const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
    const [orderInitialData, setOrderInitialData] = useState<any>(null);
    const { createOrder } = useOrderCrud();

    // Helper functions for reorder
    const prepareCustomerData = () => ({
        customer_name: customerSummary.name,
        phone: customerSummary.phone,
        secondary_phone: customerSummary.secondary_phone || "",
        city: customerSummary.city || "",
        address_details: customerSummary.address_details || "",
    });

    const handleNewOrder = () => {
        setOrderInitialData({
            ...prepareCustomerData(),
            items: [],
            notes: "",
            delivery_slot: undefined,
            payment_status: "cod",
            source: "whatsapp",
        });
        setShowReorderChoice(false);
        setShowCreateOrderModal(true);
    };

    const handleReorderLast = () => {
        const lastOrder = deepData?.orders[0]; // Most recent order
        if (!lastOrder) {
            toast.error("No previous orders found");
            return;
        }

        setOrderInitialData({
            ...prepareCustomerData(),
            items: lastOrder.items || [],
            notes: `Reorder from #${lastOrder.order_id}`,
            delivery_slot: lastOrder.delivery_slot,
            payment_status: "cod",
            source: "whatsapp",
        });
        setShowReorderChoice(false);
        setShowCreateOrderModal(true);
    };

    const getStatusIcon = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-8 h-8" />;
            case "regular": return <Star className="w-8 h-8" />;
            default: return <User className="w-8 h-8" />;
        }
    };

    const getStatusGlow = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return "text-yellow-400 border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)]";
            case "regular": return "text-green-400 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.2)]";
            default: return "text-blue-400 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.2)]";
        }
    };

    const loyalty = calculateLoyaltyScore(
        customerSummary.total_spent,
        customerSummary.total_orders,
        customerSummary.last_order_date,
        customerSummary.first_order_date
    );

    if (isLoading) {
        return <CustomerProfileSkeleton />;
    }

    if (isError || !deepData) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
                <p className="text-rose-500 font-medium">Failed to load customer details.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col space-y-6 overflow-y-auto scrollbar-thin px-6 py-6 md:px-10 md:py-8 relative">

            {/* Header / Identity Area */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 pt-2 pb-6 select-none border-b border-white/5"
            >
                <div className="flex items-center gap-5 sm:gap-6">
                    {/* Sleek Dark Circle Avatar Block */}
                    <div className={cn(
                        "w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center flex-shrink-0 bg-[#1C1C1C] border",
                        getStatusGlow(customerSummary.calculated_status)
                    )}>
                        {getStatusIcon(customerSummary.calculated_status)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight break-words m-0 leading-none">
                                {customerSummary.name}
                            </h2>
                            {/* Tags */}
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                                {deepData.tags.map((tag: any) => (
                                    <span
                                        key={tag.id}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset shadow-sm uppercase tracking-wider",
                                            tag.color === 'yellow' && "bg-amber-500/10 text-amber-500 ring-amber-500/30",
                                            tag.color === 'green' && "bg-green-500/10 text-green-500 ring-green-500/30",
                                            tag.color === 'blue' && "bg-blue-500/10 text-blue-500 ring-blue-500/30",
                                            tag.color === 'pink' && "bg-pink-500/10 text-pink-500 ring-pink-500/30",
                                            tag.color === 'purple' && "bg-purple-500/10 text-purple-500 ring-purple-500/30",
                                            tag.color === 'orange' && "bg-orange-500/10 text-orange-500 ring-orange-500/30",
                                            tag.color === 'red' && "bg-rose-500/10 text-rose-500 ring-rose-500/30",
                                            tag.color === 'gray' && "bg-white/5 text-slate-300 ring-white/10"
                                        )}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2.5 mt-3 text-sm font-medium">
                            {/* Phones Row */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-[#1C1C1C] border border-gray-200 dark:border-[#2A2A2A] text-gray-700 dark:text-[#B5B5B5] shadow-sm">
                                    <Phone className="w-3.5 h-3.5 text-gray-500 dark:text-[#888888]" />
                                    <span dir="ltr">{customerSummary.phone}</span>
                                    <button
                                        onClick={(e) => { e.preventDefault(); window.open(generateWhatsAppLink(customerSummary.phone, t("common.helloName", { name: customerSummary.name })), "_blank"); }}
                                        className="ml-1 w-6 h-6 rounded-md bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] flex items-center justify-center transition-colors border border-[#25D366]/20"
                                        title="WhatsApp (Primary)"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {customerSummary.secondary_phone && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-[#1C1C1C] border border-gray-200 dark:border-[#2A2A2A] text-gray-700 dark:text-[#B5B5B5] shadow-sm">
                                        <Phone className="w-3.5 h-3.5 text-gray-500 dark:text-[#888888]" />
                                        <span dir="ltr">{customerSummary.secondary_phone}</span>
                                        <button
                                            onClick={(e) => { e.preventDefault(); window.open(generateWhatsAppLink(customerSummary.secondary_phone!, t("common.helloName", { name: customerSummary.name })), "_blank"); }}
                                            className="ml-1 w-6 h-6 rounded-md bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] flex items-center justify-center transition-colors border border-[#25D366]/20"
                                            title="WhatsApp (Secondary)"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Location / Address Row */}
                            {(customerSummary.city || customerSummary.address_details) && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-gray-300">
                                            <MapPin className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                            <span>{[customerSummary.city, customerSummary.governorate].filter(Boolean).join(", ")}</span>
                                        </div>
                                        {/* Fallback to checking orders for governorate code if needed later, but simplified here */}
                                    </div>
                                    {customerSummary.address_details && (
                                        <p className="text-xs text-gray-600 dark:text-[#888888] leading-relaxed max-w-xl pr-4 border-l-2 border-gray-200 dark:border-[#2A2A2A] pl-3 py-0.5">
                                            {customerSummary.address_details}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Hoisted Loyalty Score */}
                <div className="flex-shrink-0 w-full md:w-auto mt-4 md:mt-0 md:pl-8 md:border-l border-[#2A2A2A] border-dashed">
                    <HealthScore score={loyalty.finalScore} statusText={loyalty.statusText} />
                </div>
            </motion.div>

            {/* Bento Metrics */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
            >
                <BentoMetrics
                    totalSpent={customerSummary.total_spent}
                    totalOrders={customerSummary.total_orders}
                    lastOrderDate={customerSummary.last_order_date}
                    firstOrderDate={customerSummary.first_order_date}
                />
            </motion.div>

            {/* Main Content Area (Timeline + Sidebars) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 flex-1 min-h-0 mt-2">

                {/* Left: The Timeline */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
                    className="xl:col-span-2 bg-white/50 dark:bg-[#141414]/70 backdrop-blur-xl border-t border-gray-200/50 dark:border-white/5 rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm flex flex-col"
                >
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-[var(--card-border)]/30">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Journey</h3>
                        <div className="flex items-center gap-3">
                            {/* Reorder button */}
                            <button
                                onClick={() => setShowReorderChoice(true)}
                                className="text-xs font-bold uppercase tracking-widest text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 flex items-center gap-2 transition-colors bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-2 rounded-full shadow-sm"
                            >
                                <PackagePlus className="w-3.5 h-3.5" />
                                Reorder
                            </button>

                            {/* View Raw Orders button */}
                            <Link
                                href={`/orders?search=${customerSummary.phone}`}
                                className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-4 py-2 rounded-full shadow-sm dark:shadow-none"
                            >
                                <Package className="w-3.5 h-3.5" />
                                View Raw Orders
                            </Link>
                        </div>
                    </div>

                    <div className="flex-1 overflow-visible">
                        <CustomerTimeline
                            orders={deepData.orders}
                            notes={deepData.notes}
                        />
                    </div>
                </motion.div>

                {/* Right: Insights & Heatmap */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                    className="space-y-6"
                >
                    {/* Insights Box */}
                    <div className="bg-white/50 dark:bg-[#0A0A0A]/70 backdrop-blur-xl border-gray-200/50 dark:border-white/5 rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm border relative overflow-hidden">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Quick Insights</h3>

                        <div className="space-y-3">
                            <div className="p-4 bg-blue-50/50 dark:bg-[#141A29] rounded-2xl border border-blue-100 dark:border-[#1E2B4D] relative">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-[#6381D3] uppercase tracking-widest mb-1.5">Favorite Item</p>
                                <p className="text-sm font-bold text-blue-950 dark:text-[#D0DFFF]">
                                    {/* Naive extraction of first item of last order if available, for demo purposes */}
                                    {deepData.orders[0]?.items?.[0]?.name || "N/A"}
                                </p>
                            </div>

                            <div className="p-4 bg-amber-50/50 dark:bg-[#29220D] rounded-2xl border border-amber-100 dark:border-[#42340E] relative">
                                <p className="text-[10px] font-bold text-amber-600 dark:text-[#D4AE4B] uppercase tracking-widest mb-1.5">Customer Since</p>
                                <p className="text-sm font-bold text-amber-950 dark:text-[#FFE9A6]">
                                    {new Date(customerSummary.first_order_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Box */}
                    <div className="bg-white/50 dark:bg-[#0A0A0A]/70 backdrop-blur-xl border-gray-200/50 dark:border-white/5 rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm border">
                        <PurchaseHeatmap orders={deepData.orders} />
                    </div>
                </motion.div>
            </div>

            {/* Command Palette Component (Hidden UI, activated via keyboard) */}
            <CommandPalette customerPhone={phone} />

            {/* Reorder Choice Dialog */}
            <ReorderChoiceDialog
                open={showReorderChoice}
                onClose={() => setShowReorderChoice(false)}
                onNewOrder={handleNewOrder}
                onReorderLast={handleReorderLast}
                hasOrders={(deepData?.orders?.length || 0) > 0}
            />

            {/* Create Order Modal */}
            {showCreateOrderModal && (
                <CreateOrderModal
                    open={showCreateOrderModal}
                    onClose={() => {
                        setShowCreateOrderModal(false);
                        setOrderInitialData(null);
                    }}
                    onCreate={createOrder}
                    checkOrderIdExists={checkOrderIdExistsForCaller}
                    initialData={orderInitialData}
                />
            )}
        </div>
    );
}
