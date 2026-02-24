"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { cn, formatIQD, formatDate, generateWhatsAppLink } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { User, Crown, Star, Phone, MapPin, MessageCircle, AlertTriangle } from "lucide-react";

interface VirtualizedCustomerListProps {
    customers: PaginatedCustomer[];
    totalCount: number;
    isLoading: boolean;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    selectedCustomerId: string | null;
    onSelectCustomer: (id: string) => void;
}

export function VirtualizedCustomerList({
    customers,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    selectedCustomerId,
    onSelectCustomer
}: VirtualizedCustomerListProps) {
    const { t } = useLanguage();
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: hasNextPage ? customers.length + 1 : customers.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 100, // Estimated height of a row
        overscan: 5, // Render 5 extra items to prevent flashing
    });

    const items = rowVirtualizer.getVirtualItems();

    // Infinite scroll observer setup
    const observerRef = useRef<IntersectionObserver | null>(null);
    const lastRowRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isLoading || isFetchingNextPage) return;
            if (observerRef.current) observerRef.current.disconnect();

            observerRef.current = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage();
                }
            });

            if (node) observerRef.current.observe(node);
        },
        [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]
    );

    // Helpers for rendering
    const getStatusIcon = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-4 h-4" />;
            case "regular": return <Star className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status: PaginatedCustomer["calculated_status"]) => {
        switch (status) {
            case "vip": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "regular": return "bg-[var(--pastel-green)] text-green-900";
            default: return "bg-[var(--pastel-mint)] text-teal-900";
        }
    };

    /**
     * Dormancy Indicator Logic
     * Green: Ordered within last 30 days
     * Yellow: Ordered between 30 and 90 days ago
     * Red: Ordered > 90 days ago
     */
    const getDormancyColor = (lastOrder: string) => {
        const daysSince = Math.floor((new Date().getTime() - new Date(lastOrder).getTime()) / (1000 * 3600 * 24));
        if (daysSince <= 30) return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]";
        if (daysSince <= 90) return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
        return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
    };

    if (customers.length === 0 && !isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center ring-4 ring-[var(--card-bg)]">
                    <User className="h-8 w-8 text-[var(--foreground-subtle)]" />
                </div>
                <p className="text-lg font-medium text-foreground mb-1">No customers found</p>
                <p className="text-sm text-muted max-w-xs mx-auto">
                    Try adjusting your filters or search query to find who you are looking for.
                </p>
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin h-full"
            style={{ contain: 'strict' }}
        >
            <div
                className="w-full relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
                {items.map((virtualRow) => {
                    const isLoaderRow = virtualRow.index > customers.length - 1;
                    const customer = customers[virtualRow.index];

                    if (isLoaderRow) {
                        return (
                            <div
                                key={`loader-${virtualRow.index}`}
                                ref={lastRowRef}
                                className="absolute top-0 left-0 w-full flex items-center justify-center p-4"
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <span className="inline-flex gap-1 items-center bg-[var(--card-bg)] px-4 py-2 rounded-full shadow-sm border border-[var(--card-border)]">
                                    <span className="text-xs text-muted font-medium mr-2">Loading more...</span>
                                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                </span>
                            </div>
                        );
                    }

                    const isSelected = selectedCustomerId === customer.phone;

                    return (
                        <div
                            key={customer.phone}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            className="absolute top-0 left-0 w-full p-2 transition-all"
                            style={{
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <div
                                onClick={() => onSelectCustomer(customer.phone)}
                                className={cn(
                                    "flex items-center p-3 gap-3 rounded-2xl cursor-pointer transition-all border",
                                    isSelected
                                        ? "bg-[var(--card-bg)] border-[var(--pastel-yellow-solid)] shadow-[0_4px_12px_rgba(0,0,0,0.05),0_0_0_2px_var(--pastel-yellow-solid)]"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--card-border-hover)] hover:shadow-sm"
                                )}
                            >
                                {/* Left: Avatar & Status */}
                                <div className="relative">
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden",
                                        getStatusColor(customer.calculated_status)
                                    )}>
                                        {/* Subtle pattern overlay */}
                                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent" />
                                        <div className="relative z-10">{getStatusIcon(customer.calculated_status)}</div>
                                    </div>

                                    {/* Dormancy Dot */}
                                    <div className={cn(
                                        "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--card-bg)]",
                                        getDormancyColor(customer.last_order_date)
                                    )} title="Activity Indicator" />
                                </div>

                                {/* Middle: Info */}
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="font-bold text-foreground text-sm truncate">
                                            {customer.name}
                                        </p>
                                        {customer.is_blacklisted && (
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted">
                                        <span className="flex items-center gap-1 font-mono hover:text-foreground transition-colors">
                                            <Phone className="w-3 h-3" />
                                            {customer.phone}
                                        </span>
                                        {customer.city && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-[var(--card-border-hover)]" />
                                                <span className="flex items-center gap-1 truncate max-w-[80px]">
                                                    <MapPin className="w-3 h-3" />
                                                    {customer.city}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Micro Stats & Actions */}
                                <div className="flex items-end flex-col gap-1 flex-shrink-0">
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-foreground">{formatIQD(customer.total_spent)}</p>
                                        <p className="text-[10px] text-muted font-medium tracking-wide uppercase">{customer.total_orders} Orders</p>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const link = generateWhatsAppLink(
                                                customer.phone,
                                                `مرحباً ${customer.name}`
                                            );
                                            window.open(link, "_blank");
                                        }}
                                        className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100",
                                            isSelected ? "opacity-100 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white"
                                                : "bg-[var(--background)] text-muted hover:text-[#25D366] hover:bg-[#25D366]/10"
                                        )}
                                        title="WhatsApp"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
