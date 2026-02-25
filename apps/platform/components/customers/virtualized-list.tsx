"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { useLanguage } from "@/hooks/use-language";
import { User } from "lucide-react";
import { CustomerCard } from "./customer-card";

interface VirtualizedCustomerListProps {
    customers: PaginatedCustomer[];
    totalCount: number;
    isLoading: boolean;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    selectedCustomerId: string | null;
    onSelectCustomer: (id: string) => void;
    // Multi-select props
    selectedPhones?: Set<string>;
    onToggleSelection?: (phone: string, isShiftKey?: boolean) => void;
    onSelectAll?: () => void;
    onClearSelection?: () => void;
    compactLevel?: 0 | 1 | 2; // 0=full, 1=semi-compact, 2=ultra-compact
}

export function VirtualizedCustomerList({
    customers,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    selectedCustomerId,
    onSelectCustomer,
    selectedPhones = new Set(),
    onToggleSelection,
    onSelectAll,
    onClearSelection,
    compactLevel = 0,
}: VirtualizedCustomerListProps) {
    const { t } = useLanguage();
    const parentRef = useRef<HTMLDivElement>(null);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    // Adjust row size based on compact level
    const getRowSize = () => {
        switch (compactLevel) {
            case 2: return 60;  // Ultra-compact
            case 1: return 140; // Semi-compact
            default: return 180; // Full
        }
    };

    const rowVirtualizer = useVirtualizer({
        count: hasNextPage ? customers.length + 1 : customers.length,
        getScrollElement: () => parentRef.current,
        estimateSize: getRowSize,
        overscan: 5,
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

    // Handle shift+click range selection
    const handleToggleSelection = useCallback((phone: string, index: number, isShiftKey: boolean) => {
        if (!onToggleSelection) return;

        if (isShiftKey && lastSelectedIndex !== null) {
            // Range selection
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            for (let i = start; i <= end; i++) {
                if (customers[i]) {
                    onToggleSelection(customers[i].phone, false);
                }
            }
        } else {
            // Single selection
            onToggleSelection(phone, false);
        }

        setLastSelectedIndex(index);
    }, [lastSelectedIndex, customers, onToggleSelection]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl+A to select all
            if ((e.metaKey || e.ctrlKey) && e.key === 'a' && onSelectAll) {
                e.preventDefault();
                onSelectAll();
            }
            // Escape to clear selection
            if (e.key === 'Escape' && onClearSelection) {
                onClearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSelectAll, onClearSelection]);

    // Show select all header if multi-select is enabled
    const showSelectAll = onToggleSelection && customers.length > 0;
    const allSelected = customers.length > 0 && customers.every(c => selectedPhones.has(c.phone));
    const someSelected = selectedPhones.size > 0 && !allSelected;

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

                    const isSelected = selectedPhones.has(customer.phone);
                    const isDetailSelected = selectedCustomerId === customer.phone;

                    return (
                        <div
                            key={customer.phone}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            className="absolute top-0 left-0 w-full px-2 transition-all"
                            style={{
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                            onClick={(e) => {
                                // If shift key, do range selection
                                if (e.shiftKey && onToggleSelection) {
                                    handleToggleSelection(customer.phone, virtualRow.index, true);
                                } else if ((e.metaKey || e.ctrlKey) && onToggleSelection) {
                                    // If cmd/ctrl key, toggle individual selection
                                    handleToggleSelection(customer.phone, virtualRow.index, false);
                                } else {
                                    // Normal click - show details
                                    onSelectCustomer(customer.phone);
                                }
                            }}
                        >
                            <CustomerCard
                                customer={customer}
                                isSelected={isDetailSelected || isSelected}
                                onToggleSelection={onToggleSelection ? (phone: string) => handleToggleSelection(phone, virtualRow.index, false) : undefined}
                                onViewDetails={onSelectCustomer}
                                compact={compactLevel}
                                isVirtualized={true}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
