"use client";

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useDocumentOffsetTop } from '@/hooks/use-document-offset-top';
import { useRef, useMemo, memo, useState, useEffect, useCallback } from 'react';
import { perfTrace } from '@/lib/perf-trace';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus } from '@/lib/supabase';
import type { OrderFilters } from '@/types/order';
import { ArrowUp, ArrowDown, Filter as FilterIcon, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-states';
import { OrderContextMenu } from '@/components/orders/table/context-menu';
import { useOrdersContext } from '@/components/providers/orders-provider';
import { RowHoverPreview } from '@/components/orders/table/hover-preview';
import { useOrderStore } from '@/store/use-order-store';
import { useLanguage } from '@/components/providers/language-provider';
import type { DuplicateWindowAlert } from '@/lib/duplicate-window';
import { getOrderStatusLabel } from '@/lib/order-status-labels';
import { DEFAULT_COLUMN_WIDTHS, COLUMN_KEYS, RESIZABLE_COLUMNS, loadColumnWidths, DENSITY_CONFIG } from './table/table-layout';
import { ResizeHandle } from './table/resize-handle';
import { VirtualTableRow } from './table/virtual-table-row';

interface VirtualizedOrderTableProps {
    groupedOrders: Record<string, Order[]>;
    groupBy: string;
    displayedOrders: Order[];
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
    toggleSort: (key: string, shiftKey?: boolean) => void;
    selectedOrders: Set<string>;
    selectAll: () => void;
    toggleOrderSelection: (id: string) => void;
    togglePin: (id: string) => void;
    setSelectedOrder: (order: Order) => void;
    setIsModalOpen: (open: boolean) => void;
    /** 48h money-at-risk duplicate for an order, if it has one. */
    getDuplicateWindowAlert?: (orderId: string) => DuplicateWindowAlert | undefined;
    /** Records who opened a WhatsApp chat from a row's phone number. */
    onContactRecorded?: (orderId: string) => void;
    setDuplicateOrder: (order: Order) => void;
    setShowDuplicateModal: (open: boolean) => void;
    modePrice: number;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<unknown>;
    getRiskLevel: (phone: string) => 'low' | 'medium' | 'high' | 'blocked' | null;
    columnFilters: Record<string, string>;
    setColumnFilters: (filters: Record<string, string>) => void;
    openFilterColumn: string | null;
    setOpenFilterColumn: (col: string | null) => void;
    availableCities: string[];
    availableProducts: string[];
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
}





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
    getDuplicateWindowAlert,
    onContactRecorded,
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
    const tableContainerRef = useRef<HTMLDivElement>(null);
    // Kept current as anything above the table changes height: measured on a
    // row-count change instead, it read the analytics panel mid-animation.
    const { top: scrollMargin, ref: parentRef } = useDocumentOffsetTop<HTMLDivElement>();
    const [flashingOrderId, setFlashingOrderId] = useState<string | null>(null);
    const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; order: Order } | null>(null);
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(loadColumnWidths);
    const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
    const [hoverPreview, setHoverPreview] = useState<{ order: Order; position: { top: number; left: number } } | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Store state
    // WF-4: `updateOrder` and `deleteOrder` used to be optional props that the
    // one place rendering this table never passed, so inline edit, the colour
    // tag, drag-to-reorder and the context menu's Delete were all dead. Taking
    // them from the shared orders context leaves no prop to forget.
    const { updateOrder, deleteOrder } = useOrdersContext();
    const density = useOrderStore((s) => s.tableDensity);
    const editingCell = useOrderStore((s) => s.editingCell);
    const { t, language } = useLanguage();
    const setEditingCell = useOrderStore((s) => s.setEditingCell);
    const sortConfigs = useOrderStore((s) => s.sortConfigs);
    const hiddenColumns = useOrderStore((s) => s.hiddenColumns);

    const dc = DENSITY_CONFIG[density];
    const gridTemplate = useMemo(() => {
        return COLUMN_KEYS.map(key => {
            if (hiddenColumns.has(key)) return '0px';
            return `${columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key]}px`;
        }).join(' ');
    }, [columnWidths, hiddenColumns]);

    // Column resize handlers
    const handleResizeStart = useCallback((key: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key] };

        const handleMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const diff = ev.clientX - resizingRef.current.startX;
            const newWidth = Math.max(50, resizingRef.current.startWidth + diff);
            setColumnWidths(prev => ({ ...prev, [resizingRef.current!.key]: newWidth }));
        };
        const handleUp = () => {
            if (resizingRef.current) {
                // Persist to localStorage
                setColumnWidths(prev => {
                    try { localStorage.setItem('table-column-widths', JSON.stringify(prev)); } catch {}
                    return prev;
                });
            }
            resizingRef.current = null;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
        };
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
    }, [columnWidths]);

    const handleResizeDoubleClick = useCallback((key: string) => {
        // Reset to default
        setColumnWidths(prev => {
            const next = { ...prev, [key]: DEFAULT_COLUMN_WIDTHS[key] };
            try { localStorage.setItem('table-column-widths', JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const handleRowDrop = useCallback((e: React.DragEvent, targetOrderId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');
        if (!sourceId || sourceId === targetOrderId) return;
        // Find the target's sequence number and assign it to the source
        const targetOrder = displayedOrders.find(o => o.id === targetOrderId);
        if (targetOrder?.sequence_number) {
            updateOrder(sourceId, { sequence_number: targetOrder.sequence_number });
            toast.success(t("orders.toast.rowReordered"));
        }
    }, [updateOrder, displayedOrders, t]);

    const handleStatusChanged = useCallback((orderId: string) => {
        setFlashingOrderId(orderId);
        setTimeout(() => setFlashingOrderId(null), 800);
    }, []);

    const handleStartEdit = useCallback((orderId: string | null, field: string | null) => {
        if (orderId && field) {
            setEditingCell({ orderId, field });
        } else {
            setEditingCell(null);
        }
    }, [setEditingCell]);

    const handleContextMenu = useCallback((e: React.MouseEvent, order: Order) => {
        setContextMenu({ x: e.clientX, y: e.clientY, order });
    }, []);

    const handleRowMouseEnter = useCallback((e: React.MouseEvent, order: Order) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        // Use mouse position and clamp so card stays in viewport
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        hoverTimerRef.current = setTimeout(() => {
            const cardW = 288; // w-72 = 18rem = 288px
            const cardH = 200; // approximate height
            const left = Math.min(mouseX + 16, window.innerWidth - cardW - 16);
            const top = Math.min(mouseY - 20, window.innerHeight - cardH - 16);
            setHoverPreview({
                order,
                position: { top: Math.max(8, top), left },
            });
        }, 500);
    }, []);

    const handleRowMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoverPreview(null);
    }, []);

    // Flatten groups for virtualization
    // IMPORTANT: Do NOT spread orders here — { ...o } creates new object references
    // which breaks React.memo on VirtualTableRow (prevProps.order !== nextProps.order)
    const flatItems = useMemo(() => {
        const items: Array<
            | { type: 'header'; data: number; groupName: string }
            | { type: 'row'; data: Order; displayIndex: number }
        > = [];
        if (groupBy === 'none') {
            displayedOrders.forEach((o, index) => items.push({ type: 'row', data: o, displayIndex: index + 1 }));
            return items;
        }

        Object.entries(groupedOrders).forEach(([groupName, groupOrders]) => {
            items.push({ type: 'header', data: groupOrders.length, groupName });
            groupOrders.forEach((o, index) => items.push({ type: 'row', data: o, displayIndex: index + 1 }));
        });
        return items;
    }, [displayedOrders, groupedOrders, groupBy]);

    // Build index of row items only (for keyboard nav)
    const rowIndices = useMemo(() => {
        const indices: number[] = [];
        flatItems.forEach((item, i) => { if (item.type === 'row') indices.push(i); });
        return indices;
    }, [flatItems]);

    const rowVirtualizer = useWindowVirtualizer({
        count: flatItems.length,
        estimateSize: (index) => flatItems[index].type === 'header' ? 40 : dc.rowHeight,
        overscan: 5,
        scrollMargin,
    });

    // Keyboard navigation
    useEffect(() => {
        const container = tableContainerRef.current;
        if (!container) return;

        const handler = (e: KeyboardEvent) => {
            // Don't handle keys when editing
            if (editingCell) return;

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setFocusedRowIndex((prev) => {
                    const currentIdx = prev !== null ? rowIndices.indexOf(prev) : -1;
                    let nextIdx: number;
                    if (e.key === "ArrowDown") {
                        nextIdx = currentIdx < rowIndices.length - 1 ? currentIdx + 1 : currentIdx;
                    } else {
                        nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
                    }
                    const flatIndex = rowIndices[nextIdx];
                    // Scroll into view
                    rowVirtualizer.scrollToIndex(flatIndex, { align: 'auto' });
                    return flatIndex;
                });
            }

            if (e.key === "Enter" && focusedRowIndex !== null) {
                const item = flatItems[focusedRowIndex];
                if (item?.type === 'row') {
                    setSelectedOrder(item.data);
                    setIsModalOpen(true);
                }
            }

            if (e.key === " " && focusedRowIndex !== null) {
                e.preventDefault();
                const item = flatItems[focusedRowIndex];
                if (item?.type === 'row') {
                    toggleOrderSelection(item.data.id);
                }
            }

            if (e.key === "Escape") {
                setFocusedRowIndex(null);
                setContextMenu(null);
                useOrderStore.getState().setSelectedOrders(new Set());
            }
        };

        container.addEventListener("keydown", handler);
        return () => container.removeEventListener("keydown", handler);
    }, [editingCell, focusedRowIndex, flatItems, rowIndices, rowVirtualizer, setSelectedOrder, setIsModalOpen, toggleOrderSelection]);

    // Load tracing: the first frame that paints rows ends the /orders load.
    const hasRows = displayedOrders.length > 0;
    useEffect(() => {
        if (hasRows) perfTrace.markPainted("orders:list-painted", "orders", { empty: false });
    }, [hasRows]);

    // Empty state
    if (displayedOrders.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <EmptyState type="no-results" searchQuery="" hasFilters={true} />
            </div>
        );
    }

    return (
        <div
            ref={tableContainerRef}
            className="flex flex-col h-full overflow-x-auto overflow-y-visible outline-none"
            tabIndex={0}
        >
            <div
                ref={parentRef}
                className="flex-1 overflow-x-auto overflow-y-visible"
            >
                <div className="w-full relative flex flex-col min-w-[1200px] rounded-xl border border-gray-200/80 shadow-sm bg-white overflow-hidden" role="table">
                    <div className="bg-gray-50/80 border-b-2 border-gray-200 sticky top-0 z-30 grid" style={{ gridTemplateColumns: gridTemplate }} role="row">
                            <div role="columnheader" className="px-3 py-3 text-center text-xs font-semibold text-muted cursor-pointer hover:bg-gray-50"
                                onClick={(e) => toggleSort('order_id', e.shiftKey)}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    #
                                    {(() => {
                                        const idx = (sortConfigs || []).findIndex(s => s.key === 'order_id');
                                        if (idx >= 0) {
                                            const sc = (sortConfigs || [])[idx];
                                            return <span className="flex items-center gap-0.5 text-primary">{(sortConfigs || []).length > 1 && <span className="text-[11px]">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}</span>;
                                        }
                                        if (sortConfig?.key === 'order_id') return sortConfig.direction === 'asc' ? <ArrowUp className="w-2 h-2 text-primary" /> : <ArrowDown className="w-2 h-2 text-primary" />;
                                        return null;
                                    })()}
                                </div>
                            </div>
                            <div role="columnheader" className="px-3 py-3 text-center">
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
                                        { key: 'order_id', label: t("orders.header.order"), resizeKey: 'orderId' },
                                        { key: 'customer_name', label: t("orders.header.customer"), resizeKey: 'customer' },
                                        { key: 'phone', label: t("orders.header.phone"), noSort: true, resizeKey: 'phone' },
                                        { key: 'secondary_phone', label: t("orders.header.phone2"), noSort: true, resizeKey: 'phone2' },
                                        { key: 'city', label: t("orders.header.city"), filterType: 'select', options: availableCities, resizeKey: 'city' },
                                        { key: 'address_details', label: t("orders.header.address"), resizeKey: 'address' },
                                    ].map((col: { key: string; label: string; resizeKey: string; noSort?: boolean; filterType?: string; options?: string[]; noFilter?: boolean }) => (
                                    <div role="columnheader"
                                        key={col.key}
                                        className={cn(
                                            "px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative group",
                                            !col.noSort && "cursor-pointer hover:bg-gray-50"
                                        )}
                                        onClick={(e) => !col.noSort && toggleSort(col.key, e.shiftKey)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {(() => {
                                                const idx = (sortConfigs || []).findIndex(s => s.key === col.key);
                                                if (idx >= 0) {
                                                    const sc = (sortConfigs || [])[idx];
                                                    return <span className="flex items-center gap-0.5 text-blue-500">{(sortConfigs || []).length > 1 && <span className="text-[11px] font-bold">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}</span>;
                                                }
                                                if (sortConfig?.key === col.key) return sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
                                                return null;
                                            })()}
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
                                                            <span>{t("orders.filter.all")}</span>
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
                                                        placeholder={`${t("orders.filter.filterBy")} ${col.label}...`}
                                                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all bg-gray-50 focus:bg-white"
                                                        value={columnFilters[col.key] || ''}
                                                        onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                                                    />
                                                )}
                                                {columnFilters[col.key] && col.filterType !== 'select' && (
                                                    <button
                                                        onClick={() => setColumnFilters({ ...columnFilters, [col.key]: '' })}
                                                        className="mt-2 text-[11px] text-rose-500 hover:text-rose-600 font-medium transition-colors w-full text-center py-1 rounded hover:bg-rose-50"
                                                    >
                                                        {t("orders.filter.clearFilter")}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {col.resizeKey && RESIZABLE_COLUMNS.has(col.resizeKey) && (
                                            <ResizeHandle columnKey={col.resizeKey} onResizeStart={handleResizeStart} onDoubleClick={handleResizeDoubleClick} />
                                        )}
                                    </div>
                                ))
                            }

                            {/* Products Header */}
                            <div role="columnheader" className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative">
                                <div className="flex items-center gap-1 group relative">
                                    {t("orders.header.products")}
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
                                                    <span>{t("orders.filter.allProducts")}</span>
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
                                <ResizeHandle columnKey="products" onResizeStart={handleResizeStart} onDoubleClick={handleResizeDoubleClick} />
                            </div>

                            {/* Amount Header */}
                            <div role="columnheader"
                                className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-50 group relative"
                                onClick={(e) => toggleSort('amount', e.shiftKey)}
                            >
                                <div className="flex items-center gap-1">
                                    {t("orders.header.amount")}
                                    {(() => {
                                        const idx = (sortConfigs || []).findIndex(s => s.key === 'amount');
                                        if (idx >= 0) {
                                            const sc = (sortConfigs || [])[idx];
                                            return <span className="flex items-center gap-0.5 text-blue-500">{(sortConfigs || []).length > 1 && <span className="text-[11px] font-bold">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}</span>;
                                        }
                                        if (sortConfig?.key === 'amount') return sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
                                        return null;
                                    })()}
                                </div>
                                <ResizeHandle columnKey="amount" onResizeStart={handleResizeStart} onDoubleClick={handleResizeDoubleClick} />
                            </div>

                            <div role="columnheader" className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative">{t("orders.header.status")}<ResizeHandle columnKey="status" onResizeStart={handleResizeStart} onDoubleClick={handleResizeDoubleClick} /></div>
                            <div role="columnheader" className="px-3 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">{t("orders.header.source")}</div>
                            <div role="columnheader" className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative">{t("orders.header.date")}<ResizeHandle columnKey="date" onResizeStart={handleResizeStart} onDoubleClick={handleResizeDoubleClick} /></div>
                            <div role="columnheader" className="px-3 py-3 text-center text-xs font-semibold text-muted">●</div>
                    </div>
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }} role="rowgroup">
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = flatItems[virtualRow.index];

                            if (item.type === 'header') {
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
                                                {groupBy === 'status' ? getOrderStatusLabel(item.groupName, language) : item.groupName}
                                                <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-muted-foreground">{item.data}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const order = item.data;
                            const isSelected = selectedOrders.has(order.id);
                            // Was `phoneCounts > 1`: repeats of a phone within the rows on
                            // screen, so every returning customer lit up — and under a
                            // date window it only saw that window's repeats anyway. The
                            // 48h alert is the duplicate that actually costs money.
                            const duplicateAlert = getDuplicateWindowAlert?.(order.id);
                            const isDuplicate = !!duplicateAlert;

                            return (
                                <VirtualTableRow
                                    key={virtualRow.key}
                                    order={order}
                                    displayIndex={item.displayIndex}
                                    virtualRow={virtualRow}
                                    scrollMargin={scrollMargin}
                                    isSelected={isSelected}
                                    isDuplicate={isDuplicate}
                                    duplicateSeverity={duplicateAlert?.severity}
                                    onContactRecorded={onContactRecorded}
                                    modePrice={modePrice}
                                    togglePin={togglePin}
                                    toggleOrderSelection={toggleOrderSelection}
                                    setSelectedOrder={setSelectedOrder}
                                    setIsModalOpen={setIsModalOpen}
                                    getRiskLevel={getRiskLevel}
                                    setDuplicateOrder={setDuplicateOrder}
                                    setShowDuplicateModal={setShowDuplicateModal}
                                    updateOrderStatus={updateOrderStatus}
                                    onStatusChanged={handleStatusChanged}
                                    isFlashing={flashingOrderId === order.id}
                                    isFocused={focusedRowIndex === virtualRow.index}
                                    density={density}
                                    editingCell={editingCell}
                                    onStartEdit={handleStartEdit}
                                    updateOrder={updateOrder}
                                    onContextMenu={handleContextMenu}
                                    gridTemplate={gridTemplate}
                                    onMouseEnter={handleRowMouseEnter}
                                    onMouseLeave={handleRowMouseLeave}
                                    onRowDrop={!sortConfig && sortConfigs.length === 0 ? handleRowDrop : undefined}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <OrderContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    order={contextMenu.order}
                    onClose={() => setContextMenu(null)}
                    onStatusChange={updateOrderStatus}
                    onOpenDetails={(order) => { setSelectedOrder(order); setIsModalOpen(true); }}
                    onDelete={deleteOrder ? (id) => deleteOrder(id) : undefined}
                />
            )}

            {/* Hover Preview Card */}
            {hoverPreview && (
                <RowHoverPreview
                    order={hoverPreview.order}
                    position={hoverPreview.position}
                />
            )}
        </div>
    );
});
