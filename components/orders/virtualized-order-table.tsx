"use client";

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, Fragment, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus } from '@/lib/supabase';
import { ArrowUp, ArrowDown, Filter as FilterIcon, Check, MapPin as Pin, CopyPlus, TrendingUp, TrendingDown, CheckCircle2, CloudUpload } from 'lucide-react';
import { RiskBadge } from '@/components/orders/risk-badge';
import { formatIQD } from '@/lib/utils';

// ... (props interface to support all the specific UI states from page.tsx)
interface VirtualizedOrderTableProps {
    groupedOrders: Record<string, Order[]>;
    groupBy: string;
    displayedOrders: Order[];
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
    toggleSort: (key: string) => void;
    selectedOrders: Set<string>;
    selectAll: () => void;
    toggleOrderSelection: (id: string) => void;
    togglePin: (id: string) => void;
    setSelectedOrder: (order: Order) => void;
    setIsModalOpen: (open: boolean) => void;
    phoneCounts: Map<string, number>;
    setDuplicateOrder: (order: Order) => void;
    setShowDuplicateModal: (open: boolean) => void;
    modePrice: number;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<any>;
    getRiskLevel: (phone: string) => 'low' | 'medium' | 'high' | 'blocked' | null;
    // ... filter props
    columnFilters: Record<string, string>;
    setColumnFilters: (filters: Record<string, string>) => void;
    openFilterColumn: string | null;
    setOpenFilterColumn: (col: string | null) => void;
    availableCities: string[];
    availableProducts: string[];
    filters: any;
    setFilters: (filters: any) => void;
}

import { memo } from "react";

export const VirtualizedOrderTable = memo(function VirtualizedOrderTable({
    groupedOrders,
    groupBy,
    displayedOrders,
    sortConfig,
    toggleSort,
    selectedOrders,
    selectAll,
    toggleOrderSelection,
    togglePin,
    setSelectedOrder,
    setIsModalOpen,
    phoneCounts,
    setDuplicateOrder,
    setShowDuplicateModal,
    modePrice,
    updateOrderStatus,
    getRiskLevel,
    columnFilters,
    setColumnFilters,
    openFilterColumn,
    setOpenFilterColumn,
    availableCities,
    availableProducts,
    filters,
    setFilters
}: VirtualizedOrderTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    useEffect(() => {
        if (parentRef.current) {
            const rect = parentRef.current.getBoundingClientRect();
            setScrollMargin(rect.top + window.scrollY);
        }
    }, [displayedOrders.length]);

    // Flatten groups for virtualization
    const flatItems = useMemo(() => {
        const items: Array<{ type: 'header' | 'row', data: any, groupName?: string }> = [];
        if (groupBy === 'none') {
            displayedOrders.forEach((o, index) => items.push({ type: 'row', data: { ...o, displayIndex: index + 1 } }));
            return items;
        }

        Object.entries(groupedOrders).forEach(([groupName, groupOrders]) => {
            items.push({ type: 'header', data: groupOrders.length, groupName });
            groupOrders.forEach((o, index) => items.push({ type: 'row', data: { ...o, displayIndex: index + 1 } }));
        });
        return items;
    }, [displayedOrders, groupedOrders, groupBy]);

    const rowVirtualizer = useWindowVirtualizer({
        count: flatItems.length,
        estimateSize: (index) => flatItems[index].type === 'header' ? 40 : 64, // Estimate row heights
        overscan: 10,
        scrollMargin,
    });

    // Helper for regex phone validation matching page.tsx
    const validatePhoneDetailed = (phone: string | null | undefined) => {
        if (!phone) return { isValid: false, reason: "Empty phone number", formatted: "" };
        const cleaned = phone.replace(/\D/g, "");
        if (!cleaned.startsWith("964")) return { isValid: false, reason: "Missing 964 code", formatted: cleaned };
        if (cleaned.length !== 13) return { isValid: false, reason: `Wrong length: ${cleaned.length}`, formatted: cleaned };
        const providerNetwork = cleaned.substring(3, 6);
        const validNetworks = ["770", "771", "772", "773", "774", "775", "780", "781", "782", "783", "784", "785", "750", "751", "752", "753", "790"];
        if (!validNetworks.includes(providerNetwork)) return { isValid: false, reason: `Invalid network: ${providerNetwork}`, formatted: cleaned };
        return { isValid: true, reason: "Valid", formatted: cleaned };
    };

    return (
        <div className="flex flex-col h-full overflow-visible">
            <div
                ref={parentRef}
                className="flex-1 overflow-visible bg-gray-50/50"
            >
                <div className="w-full relative flex flex-col min-w-[1350px]" role="table">
                    <div className={cn("bg-[var(--background)] border-b border-[var(--card-border)] sticky top-0 z-30", "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]")} role="row">
                        <div className="contents">
                            <div role="columnheader" className="w-10 px-2 py-3 text-center text-xs font-semibold text-muted border-r border-gray-100 cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleSort('order_id')}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    #
                                    {sortConfig?.key === 'order_id' && (
                                        sortConfig.direction === 'asc' ? <ArrowUp className="w-2 h-2 text-primary" /> : <ArrowDown className="w-2 h-2 text-primary" />
                                    )}
                                </div>
                            </div>
                            <div role="columnheader" className="w-10 px-2 py-3 text-center">
                                <div className="flex flex-col items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedOrders.size === displayedOrders.length && displayedOrders.length > 0}
                                        onChange={selectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                </div>
                            </div>

                            {
                                [
                                    { key: 'order_id', label: 'Order', width: 'w-24' },
                                    { key: 'customer_name', label: 'Customer', width: 'min-w-[120px]' },
                                    { key: 'phone', label: 'Phone', width: 'w-28', noSort: true },
                                    { key: 'secondary_phone', label: 'Phone 2', width: 'w-28', noSort: true },
                                    { key: 'city', label: 'City', width: 'w-24', filterType: 'select', options: availableCities },
                                    { key: 'address_details', label: 'Address', width: 'min-w-[100px]' },
                                ].map((col: any) => (
                                    <div role="columnheader"
                                        key={col.key}
                                        className={cn(
                                            col.width,
                                            "px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative group",
                                            !col.noSort && "cursor-pointer hover:bg-gray-50"
                                        )}
                                        onClick={() => !col.noSort && toggleSort(col.key)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortConfig?.key === col.key && (
                                                sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                                            )}
                                            {!col.noFilter && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenFilterColumn(openFilterColumn === col.key ? null : col.key);
                                                    }}
                                                    className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", columnFilters[col.key] && "opacity-100 text-blue-600")}
                                                >
                                                    <FilterIcon className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        {/* Filter Dropdown */}
                                        {openFilterColumn === col.key && !col.noFilter && (
                                            <div
                                                className="absolute top-full left-0 mt-1 w-48 p-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 cursor-default animate-in fade-in slide-in-from-top-2"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {col.filterType === 'select' ? (
                                                    <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                                        <div
                                                            key="all"
                                                            className={cn("px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors flex items-center gap-2", !columnFilters[col.key] ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-700")}
                                                            onClick={() => setColumnFilters({ ...columnFilters, [col.key]: '' })}
                                                        >
                                                            <span>All</span>
                                                            {!columnFilters[col.key] && <Check className="w-3 h-3 ml-auto text-blue-600" />}
                                                        </div>
                                                        {(col.options || []).map((opt: string) => (
                                                            <div
                                                                key={opt}
                                                                className={cn("px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors flex items-center gap-2", columnFilters[col.key] === opt ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-700")}
                                                                onClick={() => setColumnFilters({ ...columnFilters, [col.key]: opt })}
                                                            >
                                                                <span className="truncate">{opt}</span>
                                                                {columnFilters[col.key] === opt && <Check className="w-3 h-3 ml-auto text-blue-600" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        placeholder={`Filter ${col.label}...`}
                                                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all bg-gray-50 focus:bg-white"
                                                        value={columnFilters[col.key] || ''}
                                                        onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                                                    />
                                                )}
                                                {columnFilters[col.key] && col.filterType !== 'select' && (
                                                    <button
                                                        onClick={() => setColumnFilters({ ...columnFilters, [col.key]: '' })}
                                                        className="mt-2 text-[10px] text-rose-500 hover:text-rose-600 font-medium transition-colors w-full text-center py-1 rounded hover:bg-rose-50"
                                                    >
                                                        Clear Filter
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            }

                            {/* Products Header */}
                            <div role="columnheader" className="min-w-[150px] px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                                <div className="flex items-center gap-1 group relative">
                                    Products
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenFilterColumn(openFilterColumn === 'product' ? null : 'product');
                                        }}
                                        className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", filters.product && "opacity-100 text-blue-600")}
                                    >
                                        <FilterIcon className="w-3 h-3" />
                                    </button>
                                    {openFilterColumn === 'product' && (
                                        <div
                                            className="absolute top-full left-0 mt-1 w-48 p-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 cursor-default animate-in fade-in slide-in-from-top-2"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                                <div
                                                    className={cn("px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors flex items-center gap-2", !filters.product ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-700")}
                                                    onClick={() => setFilters({ ...filters, product: undefined })}
                                                >
                                                    <span>All Products</span>
                                                    {!filters.product && <Check className="w-3 h-3 ml-auto text-blue-600" />}
                                                </div>
                                                {availableProducts.map((p) => (
                                                    <div
                                                        key={p}
                                                        className={cn("px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors flex items-center gap-2", filters.product === p ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-700")}
                                                        onClick={() => setFilters({ ...filters, product: p })}
                                                    >
                                                        <span className="truncate">{p}</span>
                                                        {filters.product === p && <Check className="w-3 h-3 ml-auto text-blue-600" />}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Amount Header */}
                            <div role="columnheader"
                                className="w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-50 group"
                                onClick={() => toggleSort('amount')}
                            >
                                <div className="flex items-center gap-1">
                                    Amount
                                    {sortConfig?.key === 'amount' && (
                                        sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                                    )}
                                </div>
                            </div>

                            <div role="columnheader" className="w-28 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</div>
                            <div role="columnheader" className="w-16 px-2 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Source</div>
                            <div role="columnheader" className="w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</div>
                            <div role="columnheader" className="w-10 px-2 py-3 text-center text-xs font-semibold text-muted">●</div>
                        </div>
                    </div>
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }} role="rowgroup">
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = flatItems[virtualRow.index];

                            if (item.type === 'header') {
                                const statusLabelsHeader: Record<string, string> = {
                                    new: "جديد", contacted: "تم الاتصال", confirmed: "مؤكد",
                                    in_transit: "قيد التوصيل", delivered: "تم التسليم",
                                    rejected: "مرفوض", cancelled: "ملغي"
                                };
                                return (
                                    <div
                                        key={virtualRow.key}
                                        style={{
                                            position: 'absolute', top: 0, left: 0, width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start - scrollMargin}px)`
                                        }}
                                        className="bg-gray-50/90 backdrop-blur-sm z-20 sticky flex items-center"
                                    >
                                        <div role="cell" className="col-span-full px-4 py-2 font-medium text-sm text-foreground/70 border-b border-gray-100 flex items-center w-full">
                                            <div className="flex items-center gap-2">
                                                {groupBy === 'status' && (
                                                    <span className={cn("w-2 h-2 rounded-full",
                                                        item.groupName === 'new' && "bg-blue-500",
                                                        item.groupName === 'confirmed' && "bg-green-500",
                                                        item.groupName === 'cancelled' && "bg-red-500",
                                                        item.groupName === 'delivered' && "bg-gray-500",
                                                        item.groupName === 'in_transit' && "bg-amber-500",
                                                        item.groupName === 'rejected' && "bg-rose-500",
                                                    )} />
                                                )}
                                                {groupBy === 'status' ? (statusLabelsHeader[item.groupName!] || item.groupName) : item.groupName}
                                                <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-muted-foreground">{item.data}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const order = item.data;
                            const isSelected = selectedOrders.has(order.id);
                            const isReturn = order.is_return;
                            const isPriority = order.priority === "urgent" || order.priority === "high";
                            const rowColor = order.tag_color;
                            const isCancelled = order.status === "cancelled";
                            const isDuplicate = phoneCounts.get(order.phone.replace(/\s/g, ''))! > 1;

                            return (
                                <div
                                    key={virtualRow.key}
                                    data-index={virtualRow.index}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start - scrollMargin}px)`
                                    }}
                                    role="row"
                                    className={cn(
                                        "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]",
                                        "items-center",
                                        "hover:bg-[var(--background)] transition-all group relative border-b border-[var(--card-border)]",
                                        isSelected && "bg-blue-50/70",
                                        isReturn && "bg-red-50/40",
                                        isPriority && !isSelected && !isReturn && "bg-amber-50/60",
                                        rowColor === "yellow" && "bg-yellow-50/60",
                                        rowColor === "green" && "bg-green-50/60",
                                        rowColor === "blue" && "bg-blue-50/60",
                                        rowColor === "pink" && "bg-pink-50/60",
                                        rowColor === "purple" && "bg-purple-50/60",
                                        isCancelled && "opacity-60 bg-gray-50"
                                    )}
                                >
                                    {/* Row Number */}
                                    <div role="cell" className={cn(
                                        "px-2 py-2.5 h-full flex items-center justify-center text-xs font-mono text-muted border-r border-gray-100 bg-[var(--background)]",
                                        isCancelled && "bg-gray-50"
                                    )}>
                                        <div className="flex items-center justify-center gap-1 group/pin">
                                            <span>{order.sequence_number || order.displayIndex || virtualRow.index + 1}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePin(order.id);
                                                }}
                                                className={cn(
                                                    "opacity-0 group-hover/pin:opacity-100 transition-opacity",
                                                    order.is_pinned && "opacity-100"
                                                )}
                                            >
                                                <Pin
                                                    className={cn(
                                                        "w-3 h-3 hover:scale-110 transition-transform",
                                                        order.is_pinned ? "text-primary fill-current" : "text-muted"
                                                    )}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Checkbox */}
                                    <div role="cell" className={cn(
                                        "px-2 py-2.5 h-full flex items-center justify-center border-r border-gray-100",
                                        isCancelled && "bg-gray-50"
                                    )}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleOrderSelection(order.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 rounded border-gray-300"
                                        />
                                    </div>

                                    {/* Order ID */}
                                    <div role="cell"
                                        className={cn(
                                            "px-2 py-2.5 h-full flex items-center gap-1.5 cursor-pointer border-r border-gray-100",
                                            isCancelled && "bg-gray-50"
                                        )}
                                        onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                    >
                                        <span className={cn(
                                            "font-mono text-sm font-bold",
                                            isReturn ? "text-red-600" : "text-foreground"
                                        )}>
                                            #{(() => {
                                                const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                                                if (lfMatch) return lfMatch[1];
                                                const dlvMatch = order.order_id.match(/DLV-(\d+)$/);
                                                if (dlvMatch) return dlvMatch[1];
                                                return order.order_id.slice(-6);
                                            })()}
                                        </span>
                                        {/* @ts-ignore */}
                                        {order.__isPendingSync && (
                                            <CloudUpload className="w-3.5 h-3.5 text-blue-500 animate-pulse" title="Pending offline sync" />
                                        )}
                                    </div>

                                    {/* Customer */}
                                    <div role="cell"
                                        className="px-2 py-2.5 cursor-pointer"
                                        onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-foreground">
                                                {order.customer_name}
                                            </span>
                                            {getRiskLevel(order.phone) && (getRiskLevel(order.phone) === 'high' || getRiskLevel(order.phone) === 'blocked' || getRiskLevel(order.phone) === 'medium') && (
                                                <RiskBadge level={getRiskLevel(order.phone) as "high" | "low" | "medium" | "blocked"} showLabel={false} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone 1 */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="relative inline-flex items-center gap-1 group/phone">
                                            <span
                                                className={cn(
                                                    "font-mono text-xs hover:text-green-600 transition-colors cursor-pointer",
                                                    !validatePhoneDetailed(order.phone).isValid ? "text-red-600 font-bold" : "text-foreground",
                                                    isDuplicate && "text-amber-600 font-bold"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(`https://wa.me/964${order.phone.replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank");
                                                }}
                                            >
                                                {order.phone.replace(/^\+964/, "0").replace(/^964/, "0")}
                                            </span>
                                            {isDuplicate && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDuplicateOrder(order);
                                                        setShowDuplicateModal(true);
                                                    }}
                                                    className="p-1 rounded hover:bg-amber-100 transition-colors"
                                                    title="View duplicate orders"
                                                >
                                                    <CopyPlus className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600" />
                                                </button>
                                            )}
                                            {!validatePhoneDetailed(order.phone).isValid && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                            )}
                                            <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone:opacity-100 transition-opacity" title="WhatsApp" />
                                        </div>
                                    </div>

                                    {/* Phone 2 */}
                                    <div role="cell" className="px-2 py-2.5">
                                        {order.secondary_phone ? (
                                            <div
                                                className="relative inline-flex items-center gap-1 cursor-pointer group/phone2"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(`https://wa.me/964${order.secondary_phone.replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank");
                                                }}
                                            >
                                                <span className={cn(
                                                    "font-mono text-xs hover:text-green-600 transition-colors",
                                                    !validatePhoneDetailed(order.secondary_phone).isValid ? "text-red-600 font-bold" : "text-muted"
                                                )}>
                                                    {order.secondary_phone.replace(/^\+964/, "0").replace(/^964/, "0")}
                                                </span>
                                                {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                                )}
                                                <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone2:opacity-100 transition-opacity" title="WhatsApp" />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted">—</span>
                                        )}
                                    </div>

                                    {/* City */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <span className="text-xs text-muted">{order.city || "—"}</span>
                                    </div>

                                    {/* Address */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <span className="text-xs text-muted truncate block max-w-[120px]" title={order.address_details || ""}>
                                            {order.address_details ? order.address_details.replace(order.city || "", "").replace(/^[\s,-]+/, "").trim() || "—" : "—"}
                                        </span>
                                    </div>

                                    {/* Products */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {order.items?.map((item: any, i: number) => {
                                                const bgColor = item.tag_color ? `${item.tag_color}20` : '#f3f4f6';
                                                const textColor = item.tag_color || '#374151';
                                                return (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md"
                                                        style={{
                                                            backgroundColor: bgColor,
                                                            color: textColor,
                                                            border: `1px solid ${item.tag_color || '#e5e7eb'}`
                                                        }}
                                                        title={item.name}
                                                    >
                                                        {item.name} <span style={{ opacity: 0.7 }}>×{item.quantity}</span>
                                                    </span>
                                                );
                                            }) || <span className="text-xs text-muted">—</span>}
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex flex-col items-start gap-0.5">
                                            <div className="flex items-center gap-1">
                                                <span className={cn(
                                                    "font-mono font-bold whitespace-nowrap",
                                                    isReturn ? "text-xs text-red-600" : "text-sm text-emerald-600",
                                                    !isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && "text-amber-600",
                                                    !isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && "text-blue-600"
                                                )}>
                                                    {isReturn && "-"}{Math.abs(Number(order.price)).toLocaleString()} IQD
                                                </span>
                                                {!isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && (
                                                    <TrendingUp className="w-3 h-3 text-amber-500" />
                                                )}
                                                {!isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && (
                                                    <TrendingDown className="w-3 h-3 text-blue-500" />
                                                )}
                                            </div>
                                            {(order.payment_status === "paid" || order.payment_status === "prepaid") && (
                                                <span className="px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 rounded-md font-bold">
                                                    واصل
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div role="cell" className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                        {isReturn ? (
                                            <span className="w-full px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block">
                                                استرجاع
                                            </span>
                                        ) : (
                                            <select
                                                value={order.status}
                                                onChange={async (e) => {
                                                    await updateOrderStatus(order.id, e.target.value as Order["status"]);
                                                }}
                                                className={cn(
                                                    "w-full px-2 py-1 text-[11px] font-bold rounded-lg border-0 cursor-pointer appearance-none text-center",
                                                    order.status === "new" && "bg-orange-100 text-orange-700",
                                                    order.status === "contacted" && "bg-yellow-100 text-yellow-700",
                                                    order.status === "confirmed" && "bg-green-100 text-green-700",
                                                    order.status === "in_transit" && "bg-blue-100 text-blue-700",
                                                    order.status === "delivered" && "bg-teal-100 text-teal-700",
                                                    order.status === "completed" && "bg-emerald-100 text-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.4)]",
                                                    order.status === "no_response" && "bg-gray-100 text-gray-600",
                                                    order.status === "rejected" && "bg-rose-100 text-rose-700",
                                                    order.status === "cancelled" && "bg-red-100 text-red-700",
                                                    order.status === "returnPending" && "bg-purple-100 text-purple-700"
                                                )}
                                            >
                                                <option value="new">جديد</option>
                                                <option value="contacted">تم الاتصال</option>
                                                <option value="confirmed">مؤكد</option>
                                                <option value="in_transit">قيد التوصيل</option>
                                                <option value="delivered">تم التسليم</option>
                                                <option value="completed">مكتمل</option>
                                                <option value="no_response">لم يرد</option>
                                                <option value="rejected">مرفوض</option>
                                                <option value="cancelled">ملغي</option>
                                            </select>
                                        )}
                                    </div>

                                    {/* Source */}
                                    <div role="cell" className="px-2 py-2 text-center h-full flex items-center justify-center">
                                        <span className={cn(
                                            "px-1.5 py-0.5 text-[9px] font-bold rounded",
                                            order.source === "lightfunnels" && "bg-purple-100 text-purple-700",
                                            order.source === "delivery_import" && "bg-blue-100 text-blue-700",
                                            order.source === "whatsapp" && "bg-green-100 text-green-700",
                                            order.source === "shop" && "bg-amber-100 text-amber-700",
                                            (!order.source || order.source === "woo" || order.source === "salla" || order.source === "manual") && "bg-gray-100 text-gray-500",
                                        )}>
                                            {order.source === "lightfunnels" ? "LF" :
                                                order.source === "delivery_import" ? "DLV" :
                                                    order.source === "whatsapp" ? "WA" :
                                                        order.source === "shop" ? "محل" :
                                                            order.source === "woo" ? "WOO" :
                                                                order.source === "salla" ? "SALLA" :
                                                                    (order.source || "—")}
                                        </span>
                                    </div>

                                    {/* Date */}
                                    <div role="cell" className="px-2 py-2">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-gray-700">
                                                {new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Color Tag */}
                                    <div role="cell" className="px-2 py-2.5">
                                        <div className="flex justify-center">
                                            <div
                                                className={cn(
                                                    "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                                                    order.tag_color === "yellow" && "bg-yellow-300 border-yellow-400",
                                                    order.tag_color === "green" && "bg-green-300 border-green-400",
                                                    order.tag_color === "blue" && "bg-blue-300 border-blue-400",
                                                    order.tag_color === "pink" && "bg-pink-300 border-pink-400",
                                                    order.tag_color === "purple" && "bg-purple-300 border-purple-400",
                                                    !order.tag_color && "bg-gray-200 border-gray-300"
                                                )}
                                                title={order.tag_color || "No color tag"}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div >
    );
});
