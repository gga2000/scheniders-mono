"use client";

import { useMemo, useState } from "react";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { usePaginatedCustomers } from "@/hooks/use-paginated-customers";
import { useLanguage } from "@/hooks/use-language";
import { PageTransition } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Crown, Star, User, ChevronLeft } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";

import { CustomerOmniSearch } from "@/components/customers/omni-search";
import { VirtualizedCustomerList } from "@/components/customers/virtualized-list";
import { CustomerTopMetrics } from "@/components/customers/top-metrics";
import { CustomerDetailModal } from "@/components/customers/customer-detail-modal";
import { CustomerBulkActionsToolbar } from "@/components/customers/bulk-actions-toolbar";
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { CustomerSplitPaneSkeleton } from "@/components/ui/skeletons";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";

export default function CustomersPage() {
    const { t } = useLanguage();

    // 1. URL State Management (Filters & Selection)
    const {
        state,
        rawSearch, setSearch,
        setStatus,
        setCity,
        setSort,
        setSelectedCustomer
    } = useCustomerUrlState();

    // Derived for easy access
    const statusFilter = state.status;
    const selectedCustomerId = state.customerId;

    // 2. Server-side Data Fetching
    const {
        data,
        isLoading,
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = usePaginatedCustomers();

    // Local state for bulk actions
    const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);

    const { exportToCSV, bulkAddTags, isTagging } = useCustomerBulkActions();

    // Derived state
    const customers = useMemo(() => {
        return data?.pages.flatMap(page => page.customers) ?? [];
    }, [data]);

    const totalCount = data?.pages[0]?.totalCount ?? 0;

    // Find the full customer object for the selected ID to pass to the profile panel
    const activeCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return customers.find(c => c.phone === selectedCustomerId) || null;
    }, [selectedCustomerId, customers]);

    // Handle Loader/Error States
    if (isLoading) return <CustomerSplitPaneSkeleton />;

    if (isError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="pastel-card pastel-card-pink p-8 text-center max-w-md w-full">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">Failed to load customers</h2>
                    <p className="text-rose-700">Please check your connection and try again.</p>
                </div>
            </div>
        );
    }

    // Filter Options
    const statusOptions = [
        { id: "all", label: "All Customers", count: data?.pages[0]?.totalCount || 0 }, // Precise count from server
        { id: "vip", label: "VIP", count: undefined, icon: Crown },
        { id: "regular", label: "Regular", count: undefined, icon: Star },
        { id: "new", label: "New", count: undefined, icon: User },
    ];

    return (
        <PageTransition>
            <div className="min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] p-4 md:p-6 flex flex-col overflow-hidden relative">

                {/* Global Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 flex-shrink-0">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
                            <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                            {t("customers.title")}
                        </h1>
                        <p className="text-muted mt-1 text-sm">
                            Managing {totalCount.toLocaleString()} {totalCount === 1 ? 'customer' : 'customers'}
                        </p>
                    </div>
                </div>

                {/* Top Level Analytics */}
                <CustomerTopMetrics />

                {/* Main Content Layout */}
                <div className="flex flex-1 overflow-hidden relative">

                    {/* Master List */}
                    <div className="w-full h-full flex flex-col">
                        {/* Search & Filters */}
                        <div className="space-y-4 mb-4 flex-shrink-0">
                            <CustomerOmniSearch rawSearch={rawSearch || ""} setSearch={setSearch} />

                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {statusOptions.map((option) => {
                                    const Icon = option.icon;
                                    const isActive = statusFilter === option.id || (option.id === "all" && !statusFilter);
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => setStatus(option.id === "all" ? "all" : option.id as any)}
                                            className={cn(
                                                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
                                                isActive
                                                    ? "bg-[var(--ink)] text-white shadow-md border-transparent"
                                                    : "bg-[var(--background)] text-[var(--foreground-muted)] hover:bg-[var(--card-border)] border border-[var(--card-border)]"
                                            )}
                                        >
                                            {Icon && <Icon className="w-4 h-4" />}
                                            {option.label}
                                            {option.count !== undefined && (
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs font-bold",
                                                    isActive ? "bg-white/20 text-white" : "bg-[var(--card-border)] text-muted"
                                                )}>
                                                    {option.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* The High-Performance List */}
                        <div className="flex-1 bg-[var(--background)] border border-[var(--card-border)] rounded-3xl overflow-hidden shadow-sm flex flex-col relative is-active group">
                            {/* Faded gradient at top of list for smooth visual entry */}
                            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[var(--background)] to-transparent z-10 pointer-events-none" />

                            <VirtualizedCustomerList
                                customers={customers}
                                totalCount={totalCount}
                                isLoading={isLoading}
                                isFetchingNextPage={isFetchingNextPage}
                                hasNextPage={!!hasNextPage}
                                fetchNextPage={fetchNextPage}
                                selectedCustomerId={selectedCustomerId}
                                onSelectCustomer={setSelectedCustomer}
                            />

                            {/* Faded gradient at bottom of list */}
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--background)] to-transparent z-10 pointer-events-none" />
                        </div>
                    </div>

                </div>

                <CustomerDetailModal
                    customer={activeCustomer}
                    isOpen={!!selectedCustomerId}
                    onClose={() => setSelectedCustomer(null)}
                />

                <CustomerBulkActionsToolbar
                    selectedCount={selectedPhones.size}
                    onClearSelection={() => setSelectedPhones(new Set())}
                    onAddTags={() => setIsTagModalOpen(true)}
                    onExport={() => exportToCSV(Array.from(selectedPhones))}
                    onBroadcastMsg={() => setIsBroadcastModalOpen(true)}
                />

                <BulkTagModal
                    isOpen={isTagModalOpen}
                    onClose={() => setIsTagModalOpen(false)}
                    selectedCount={selectedPhones.size}
                    isLoading={isTagging}
                    onConfirm={async (tagIds) => {
                        await bulkAddTags(Array.from(selectedPhones), tagIds);
                        setIsTagModalOpen(false);
                        setSelectedPhones(new Set()); // Clear selection after successful tag
                    }}
                />

                <BroadcastModal
                    isOpen={isBroadcastModalOpen}
                    onClose={() => setIsBroadcastModalOpen(false)}
                    selectedCount={selectedPhones.size}
                    selectedPhones={Array.from(selectedPhones)}
                />
            </div>
        </PageTransition>
    );
}
