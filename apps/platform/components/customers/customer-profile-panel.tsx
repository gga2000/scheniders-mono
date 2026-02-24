"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { BentoMetrics } from "./bento-metrics";
import { CustomerTimeline } from "./customer-timeline";
import { PurchaseHeatmap } from "./purchase-heatmap";
import { CustomerProfileSkeleton } from "../ui/skeletons";
import { cn, formatIQD } from "@/lib/utils";
import { Crown, Star, User, Phone, MapPin, Map, Package, ExternalLink } from "lucide-react";
import Link from "next/link";
import { CommandPalette } from "./command-palette";

interface CustomerProfilePanelProps {
    customerSummary: PaginatedCustomer;
}

export function CustomerProfilePanel({ customerSummary }: CustomerProfilePanelProps) {
    const { phone } = customerSummary;

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
                    tag:tag_id (id, name, color)
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

    const getStatusIcon = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-8 h-8" />;
            case "regular": return <Star className="w-8 h-8" />;
            default: return <User className="w-8 h-8" />;
        }
    };

    const getStatusColor = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return "bg-[var(--pastel-yellow)] text-amber-900 border-amber-200";
            case "regular": return "bg-[var(--pastel-green)] text-green-900 border-green-200";
            default: return "bg-[var(--pastel-mint)] text-teal-900 border-teal-200";
        }
    };

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
        <div className="w-full h-full flex flex-col space-y-8 overflow-y-auto scrollbar-thin pr-2 relative">

            {/* Header / Identity Area */}
            <div className="flex items-start gap-5 sm:gap-6 pt-2">
                <div className={cn(
                    "w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center flex-shrink-0 shadow-sm border-2",
                    getStatusColor(customerSummary.calculated_status)
                )}>
                    {getStatusIcon(customerSummary.calculated_status)}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-2xl sm:text-3xl font-bold text-foreground break-words m-0 leading-none">
                            {customerSummary.name}
                        </h2>
                        {/* Tags */}
                        {deepData.tags.map((tag: any) => (
                            <span
                                key={tag.id}
                                className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-bold ring-1 ring-inset shadow-sm uppercase tracking-wider",
                                    tag.color === 'yellow' && "bg-amber-100 text-amber-800 ring-amber-500/30",
                                    tag.color === 'green' && "bg-green-100 text-green-800 ring-green-500/30",
                                    tag.color === 'blue' && "bg-blue-100 text-blue-800 ring-blue-500/30",
                                    tag.color === 'pink' && "bg-pink-100 text-pink-800 ring-pink-500/30",
                                    tag.color === 'purple' && "bg-purple-100 text-purple-800 ring-purple-500/30",
                                    tag.color === 'orange' && "bg-orange-100 text-orange-800 ring-orange-500/30",
                                    tag.color === 'red' && "bg-red-100 text-red-800 ring-red-500/30",
                                    tag.color === 'gray' && "bg-gray-100 text-gray-800 ring-gray-400/30"
                                )}
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-[var(--foreground-subtle)] font-medium">
                        <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-copy" title="Click to copy">
                            <Phone className="w-4 h-4" />
                            <span className="font-mono text-[15px]">{customerSummary.phone}</span>
                        </div>
                        {customerSummary.city && (
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4" />
                                <span>{customerSummary.city}</span>
                            </div>
                        )}
                        {customerSummary.governorate && (
                            <div className="flex items-center gap-1.5">
                                <Map className="w-4 h-4" />
                                <span>{customerSummary.governorate}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bento Metrics */}
            <BentoMetrics
                totalSpent={customerSummary.total_spent}
                totalOrders={customerSummary.total_orders}
                lastOrderDate={customerSummary.last_order_date}
                firstOrderDate={customerSummary.first_order_date}
            />

            {/* Main Content Area (Timeline + Sidebars) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-[500px]">

                {/* Left: The Timeline */}
                <div className="xl:col-span-2 bg-[var(--background)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--card-border)]/50">
                        <h3 className="text-lg font-bold text-foreground">Customer Journey</h3>
                        <Link
                            href={`/orders?search=${customerSummary.phone}`}
                            className="text-xs font-bold uppercase tracking-widest text-[var(--pastel-yellow-solid)] hover:text-amber-600 flex items-center gap-1 transition-colors bg-[var(--pastel-yellow)]/10 px-3 py-1.5 rounded-full"
                        >
                            <Package className="w-3.5 h-3.5" />
                            View Raw Orders
                        </Link>
                    </div>

                    <div className="flex-1 overflow-visible">
                        <CustomerTimeline
                            orders={deepData.orders}
                            notes={deepData.notes}
                        />
                    </div>
                </div>

                {/* Right: Insights & Heatmap */}
                <div className="space-y-6">
                    {/* Insights Box */}
                    <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-foreground mb-4">Quick Insights</h3>

                        <div className="space-y-4">
                            <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <p className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wide mb-1">Favorite Item</p>
                                <p className="text-sm font-medium text-foreground">
                                    {/* Naive extraction of first item of last order if available, for demo purposes */}
                                    {deepData.orders[0]?.items?.[0]?.name || "N/A"}
                                </p>
                            </div>

                            <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide mb-1">Customer Since</p>
                                <p className="text-sm font-medium text-foreground">
                                    {new Date(customerSummary.first_order_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Box */}
                    <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm">
                        <PurchaseHeatmap orders={deepData.orders} />
                    </div>
                </div>
            </div>

            {/* Command Palette Component (Hidden UI, activated via keyboard) */}
            <CommandPalette customerPhone={phone} />
        </div>
    );
}
