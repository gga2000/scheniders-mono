"use client";

import { OrderPlacementBadge } from "@/components/orders/order-placement-badge";
import { CodRiskChip } from "@/components/orders/cod-risk-chip";
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useDocumentOffsetTop } from '@/hooks/use-document-offset-top';
import { useRef, useMemo, memo, useState, useEffect, useCallback } from 'react';
import { perfTrace } from '@/lib/perf-trace';
import { cn, formatIQD } from '@/lib/utils';
import { formatPhoneGrouped } from '@/lib/order-utils';
import { isWhatsAppSlot } from '@/lib/whatsapp-contact';
import type { Order, OrderStatus } from '@/lib/supabase';
import { ArrowUp, ArrowDown, Filter as FilterIcon, Check, MapPin as Pin, CopyPlus, TrendingUp, TrendingDown, Copy, Calendar, ChevronDown, GripVertical, AlertTriangle } from 'lucide-react';
import { RiskBadge } from '@/components/orders/risk-badge';
import { AdChannelBadge } from '@/components/orders/ad-channel-badge';
import { getOrderAge, getScheduledState, isScheduledToday, formatScheduledDate, getStatusBadgeStyle } from '@/lib/order-format-utils';
import { toast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-states';
import { OrderContextMenu } from '@/components/orders/table/context-menu';
import { OrderInlineEdit } from '@/components/orders/table/order-inline-edit';
import { useOrdersContext } from '@/components/providers/orders-provider';
import { RowHoverPreview } from '@/components/orders/table/hover-preview';
import { useOrderStore } from '@/store/use-order-store';
import type { TableDensity } from '@/components/orders/table/density-toggle';
import { useLanguage } from '@/components/providers/language-provider';
import type { DuplicateWindowAlert } from '@/lib/duplicate-window';
import { mergeOrderItems } from '@/lib/merge-order-items';

// Column definitions for resizable columns
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    rowNum: 48, checkbox: 40, orderId: 100, customer: 180, phone: 120, phone2: 120,
    city: 100, address: 200, products: 220, amount: 100, status: 120, source: 72, date: 100, colorTag: 40,
};

const COLUMN_KEYS = ['rowNum', 'checkbox', 'orderId', 'customer', 'phone', 'phone2', 'city', 'address', 'products', 'amount', 'status', 'source', 'date', 'colorTag'] as const;
const RESIZABLE_COLUMNS = new Set(['customer', 'phone', 'phone2', 'city', 'address', 'products', 'amount', 'status', 'date']);

const loadColumnWidths = (): Record<string, number> => {
    if (typeof window === 'undefined') return { ...DEFAULT_COLUMN_WIDTHS };
    try {
        const stored = localStorage.getItem('table-column-widths');
        if (stored) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(stored) };
    } catch {}
    return { ...DEFAULT_COLUMN_WIDTHS };
};

// Avatar color palette for customer initials
const AVATAR_COLORS = [
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-rose-100", text: "text-rose-700" },
    { bg: "bg-cyan-100", text: "text-cyan-700" },
];

const getAvatarColor = (name: string) => {
    const code = name ? name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0) : 0;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0);
    return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
};

// Format date without year: M-DD
const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')}`;
};

// Status options for the custom dropdown
const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string; dot: string }> = [
    { value: "new", label: "جديد", dot: "bg-orange-400" },
    { value: "contacted", label: "تم الاتصال", dot: "bg-yellow-400" },
    { value: "confirmed", label: "مؤكد", dot: "bg-green-400" },
    { value: "in_transit", label: "قيد التوصيل", dot: "bg-blue-400" },
    { value: "delivered", label: "تم التسليم", dot: "bg-teal-400" },
    { value: "completed", label: "مكتمل", dot: "bg-emerald-400" },
    { value: "no_response", label: "لم يرد", dot: "bg-gray-400" },
    { value: "suspended", label: "طلب معلق", dot: "bg-orange-300" },
    { value: "rejected", label: "مرفوض", dot: "bg-rose-400" },
    { value: "cancelled", label: "ملغي", dot: "bg-red-400" },
];

// Resize handle component
const ResizeHandle = ({ columnKey, onResizeStart, onDoubleClick }: { columnKey: string; onResizeStart: (key: string, e: React.MouseEvent) => void; onDoubleClick: (key: string) => void }) => (
    <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/50 z-10 group-hover:bg-gray-300/30 transition-colors"
        onMouseDown={(e) => onResizeStart(columnKey, e)}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(columnKey); }}
    />
);

// Density config
const DENSITY_CONFIG = {
    compact: { rowHeight: 52, cellPy: "py-1.5", fontSize: "text-[10px]", avatarSize: "w-6 h-6 text-[9px]" },
    comfortable: { rowHeight: 72, cellPy: "py-2.5", fontSize: "text-xs", avatarSize: "w-7 h-7 text-[10px]" },
    spacious: { rowHeight: 88, cellPy: "py-3.5", fontSize: "text-xs", avatarSize: "w-8 h-8 text-[11px]" },
} as const;

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
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<any>;
    getRiskLevel: (phone: string) => 'low' | 'medium' | 'high' | 'blocked' | null;
    columnFilters: Record<string, string>;
    setColumnFilters: (filters: Record<string, string>) => void;
    openFilterColumn: string | null;
    setOpenFilterColumn: (col: string | null) => void;
    availableCities: string[];
    availableProducts: string[];
    filters: any;
    setFilters: (filters: any) => void;
}

// Phone validation helper
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
// Custom status dropdown component (inline, replaces native <select>)
const StatusDropdown = memo(function StatusDropdown({
    status, orderId, isReturn, updateOrderStatus, onStatusChanged
}: {
    status: OrderStatus; orderId: string; isReturn: boolean;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<any>;
    onStatusChanged?: (orderId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    if (isReturn) {
        return (
            <span className="w-full px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block">
                استرجاع
            </span>
        );
    }

    const current = STATUS_OPTIONS.find(s => s.value === status);

    return (
        <div ref={ref} className="relative w-full">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={cn(
                    "w-full px-2 py-1 text-[11px] font-bold rounded-lg cursor-pointer text-center transition-all flex items-center justify-center gap-1.5",
                    getStatusBadgeStyle(status)
                )}
            >
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", current?.dot || "bg-gray-400")} />
                {current?.label || status}
                <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 w-36 py-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    {STATUS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (opt.value !== status) {
                                    await updateOrderStatus(orderId, opt.value);
                                    onStatusChanged?.(orderId);
                                }
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors text-right",
                                opt.value === status ? "bg-gray-50 font-bold" : "hover:bg-gray-50"
                            )}
                        >
                            <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />
                            <span className="flex-1">{opt.label}</span>
                            {opt.value === status && <Check className="w-3 h-3 text-primary shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});

// Color tag picker (inline mini-popover)
const TAG_COLORS = [
    { value: null, bg: "bg-gray-200", border: "border-gray-300", label: "None" },
    { value: "yellow", bg: "bg-yellow-300", border: "border-yellow-400", label: "Yellow" },
    { value: "green", bg: "bg-green-300", border: "border-green-400", label: "Green" },
    { value: "blue", bg: "bg-blue-300", border: "border-blue-400", label: "Blue" },
    { value: "pink", bg: "bg-pink-300", border: "border-pink-400", label: "Pink" },
    { value: "purple", bg: "bg-purple-300", border: "border-purple-400", label: "Purple" },
] as const;

const ColorTagPicker = memo(function ColorTagPicker({ currentColor, orderId, updateOrder }: {
    currentColor: string | null;
    orderId: string;
    updateOrder?: (id: string, data: Record<string, any>) => Promise<any>;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const current = TAG_COLORS.find(c => c.value === currentColor) || TAG_COLORS[0];

    return (
        <div ref={ref} className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={cn("w-5 h-5 rounded-full border-2 transition-all hover:scale-110 cursor-pointer", current.bg, current.border)}
                title={current.label}
            />
            {open && (
                <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 flex items-center gap-1 p-1.5 bg-white rounded-lg shadow-xl border border-gray-100 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {TAG_COLORS.map((color) => (
                        <button
                            key={color.value ?? "none"}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (updateOrder) {
                                    updateOrder(orderId, { tag_color: color.value });
                                }
                                setOpen(false);
                            }}
                            className={cn(
                                "w-5 h-5 rounded-full border-2 transition-all hover:scale-125",
                                color.bg, color.border,
                                currentColor === color.value && "ring-2 ring-offset-1 ring-primary/40"
                            )}
                            title={color.label}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

// Copy helper
const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
        toast.success(`Copied ${label}`);
    }).catch(() => {
        toast.error("Failed to copy");
    });
};

const VirtualTableRow = memo(function VirtualTableRow({
    order,
    displayIndex,
    virtualRow,
    scrollMargin,
    isSelected,
    isDuplicate,
    duplicateSeverity,
    onContactRecorded,
    modePrice,
    togglePin,
    toggleOrderSelection,
    setSelectedOrder,
    setIsModalOpen,
    getRiskLevel,
    setDuplicateOrder,
    setShowDuplicateModal,
    updateOrderStatus,
    onStatusChanged,
    isFlashing,
    isFocused,
    density,
    editingCell,
    onStartEdit,
    updateOrder,
    onContextMenu,
    gridTemplate,
    onMouseEnter,
    onMouseLeave,
    onRowDrop,
}: any) {
    const { t, language } = useLanguage();
    const isReturn = order.is_return;
    const itemLines = mergeOrderItems<Order["items"][number]>(order.items);
    const isPriority = order.priority === "urgent" || order.priority === "high";
    const rowColor = order.tag_color;
    const isCancelled = order.status === "cancelled";
    const isOddRow = virtualRow.index % 2 === 1;
    const avatarColor = getAvatarColor(order.customer_name || "");
    const dc = DENSITY_CONFIG[density as TableDensity] || DENSITY_CONFIG.comfortable;
    const cellPy = dc.cellPy;

    const isEditingField = (field: string) => editingCell?.orderId === order.id && editingCell?.field === field;
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    return (
        <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-order-id={order.id}
            style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                gridTemplateColumns: gridTemplate,
            }}
            role="row"
            onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu?.(e, order);
            }}
            onDragOver={onRowDrop ? (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
            onDrop={onRowDrop ? (e: React.DragEvent) => onRowDrop(e, order.id) : undefined}
            className={cn(
                "grid",
                "items-center overflow-hidden",
                "hover:bg-gray-50/80 transition-all group relative border-b border-gray-200/60",
                isOddRow && "bg-gray-50/40",
                isSelected && "bg-blue-50/70 hover:bg-blue-50/80",
                isReturn && !isSelected && "bg-red-50/40",
                isPriority && !isSelected && !isReturn && "bg-amber-50/60",
                rowColor === "yellow" && !isSelected && "bg-yellow-50/60",
                rowColor === "green" && !isSelected && "bg-green-50/60",
                rowColor === "blue" && !isSelected && "bg-blue-50/60",
                rowColor === "pink" && !isSelected && "bg-pink-50/60",
                rowColor === "purple" && !isSelected && "bg-purple-50/60",
                isCancelled && "opacity-60 bg-gray-50",
                isFlashing && "animate-[statusFlash_0.8s_ease-out]",
                isFocused && "ring-2 ring-inset ring-primary/30"
            )}
        >
            {/* Row Number */}
            <div role="cell" className={cn(
                `px-3 ${cellPy} h-full flex items-center justify-center text-xs font-mono text-muted border-r border-gray-100/60`,
                isCancelled && "bg-gray-50"
            )}>
                <div className="flex items-center justify-center gap-0.5 group/num">
                    {onRowDrop && (
                        <span className="opacity-0 group-hover/num:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', order.id); e.dataTransfer.effectAllowed = 'move'; }}>
                            <GripVertical className="w-3 h-3 text-gray-300" />
                        </span>
                    )}
                    <span className={cn(onRowDrop && "group-hover/num:hidden")}>{order.sequence_number || displayIndex || virtualRow.index + 1}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); togglePin(order.id); }}
                        className={cn("hidden group-hover/num:block transition-opacity", order.is_pinned && "!block")}
                    >
                        <Pin className={cn("w-3 h-3 hover:scale-110 transition-transform", order.is_pinned ? "text-primary fill-current" : "text-muted")} />
                    </button>
                </div>
            </div>

            {/* Checkbox */}
            <div role="cell" className={cn(`px-3 ${cellPy} h-full flex items-center justify-center border-r border-gray-100/60`, isCancelled && "bg-gray-50")}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleOrderSelection(order.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded border-gray-300" />
            </div>

            {/* Order ID */}
            <div role="cell"
                className={cn(`px-3 ${cellPy} h-full flex items-center gap-1.5 cursor-pointer border-r border-gray-100/60`, isCancelled && "bg-gray-50")}
                onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
            >
                <span className={cn("font-mono text-sm font-bold", isReturn ? "text-red-600" : "text-foreground")}>
                    #{(() => {
                        const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                        if (lfMatch) return lfMatch[1];
                        const dlvMatch = order.order_id.match(/DLV-(\d+)$/);
                        if (dlvMatch) return dlvMatch[1];
                        return order.order_id.slice(-6);
                    })()}
                </span>
                <OrderPlacementBadge order={order} />
                <CodRiskChip
                    variant="row"
                    needsAttention={order.needs_attention}
                    attentionReasons={order.attention_reasons}
                />
                {order.needs_attention && order.attention_reasons?.some((r: string) => r.startsWith('whatsapp_')) && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600 border border-red-200" title={order.delivery_note || 'فشل واتساب'}>
                        <AlertTriangle className="w-3 h-3" />
                        WA
                    </span>
                )}
            </div>

            {/* Customer with Avatar */}
            <div role="cell"
                className={cn(`px-3 ${cellPy} h-full flex items-center cursor-pointer overflow-hidden border-r border-gray-100/60`)}
                onClick={() => {
                    // Delay single-click action to allow double-click to cancel it
                    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = setTimeout(() => { setSelectedOrder(order); setIsModalOpen(true); }, 250);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                    onStartEdit?.(order.id, "customer_name");
                }}
                onMouseEnter={(e: React.MouseEvent) => onMouseEnter?.(e, order)}
                onMouseLeave={onMouseLeave}
            >
                {isEditingField("customer_name") ? (
                    <OrderInlineEdit
                        orderId={order.id}
                        field="customer_name"
                        value={order.customer_name}
                    />
                ) : (
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", dc.avatarSize, avatarColor.bg, avatarColor.text)}>
                            {getInitials(order.customer_name)}
                        </div>
                        <span className="font-medium text-sm text-foreground truncate">{order.customer_name}</span>
                        {getRiskLevel(order.phone) && (getRiskLevel(order.phone) === 'blocked') && (
                            <RiskBadge level="blocked" showLabel={true} />
                        )}
                        {getRiskLevel(order.phone) && (getRiskLevel(order.phone) === 'high' || getRiskLevel(order.phone) === 'medium') && (
                            <RiskBadge level={getRiskLevel(order.phone) as "high" | "medium"} showLabel={false} />
                        )}
                    </div>
                )}
            </div>

            {/* Phone 1 */}
            <div
                role="cell"
                className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}
                onDoubleClick={(e) => { e.stopPropagation(); onStartEdit?.(order.id, "phone"); }}
            >
                {isEditingField("phone") ? (
                    <OrderInlineEdit
                        orderId={order.id}
                        field="phone"
                        value={order.phone || ""}
                        className="font-mono"
                    />
                ) : (
                <div className="relative inline-flex items-center gap-1 group/phone">
                    <span
                        className={cn("font-mono text-xs hover:text-green-600 transition-colors cursor-pointer", !validatePhoneDetailed(order.phone).isValid ? "text-red-600 font-bold" : "text-foreground", isDuplicate && (duplicateSeverity === "critical" ? "text-rose-600 font-bold" : "text-amber-600 font-bold"), isWhatsAppSlot(order, "primary") && validatePhoneDetailed(order.phone).isValid && !isDuplicate && "text-emerald-600 font-bold")}
                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/964${order.phone.replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank"); onContactRecorded?.(order.id); }}
                    >
                        {formatPhoneGrouped(order.phone)}
                    </span>
                    {isDuplicate && (
                        <button onClick={(e) => { e.stopPropagation(); setDuplicateOrder(order); setShowDuplicateModal(true); }} className="p-0.5 rounded hover:bg-amber-100 transition-colors" title="View duplicate orders">
                            <CopyPlus className={cn("w-3 h-3", duplicateSeverity === "critical" ? "text-rose-500" : "text-amber-500")} />
                        </button>
                    )}
                    {!validatePhoneDetailed(order.phone).isValid && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />}
                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(order.phone.replace(/^\+964/, "0").replace(/^964/, "0"), order.phone); }} className="p-0.5 rounded opacity-0 group-hover/phone:opacity-100 transition-opacity hover:bg-gray-100" title="Copy phone">
                        <Copy className="w-3 h-3 text-muted" />
                    </button>
                </div>
                )}
            </div>

            {/* Phone 2 */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}>
                {order.secondary_phone ? (
                    <div className="relative inline-flex items-center gap-1 cursor-pointer group/phone2">
                        <span
                            className={cn("font-mono text-xs hover:text-green-600 transition-colors", !validatePhoneDetailed(order.secondary_phone).isValid ? "text-red-600 font-bold" : "text-muted", isWhatsAppSlot(order, "secondary") && validatePhoneDetailed(order.secondary_phone).isValid && "text-emerald-600 font-bold")}
                            onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/964${order.secondary_phone.replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank"); onContactRecorded?.(order.id); }}
                        >
                            {formatPhoneGrouped(order.secondary_phone)}
                        </span>
                        {!validatePhoneDetailed(order.secondary_phone).isValid && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />}
                    </div>
                ) : (
                    <span className="text-xs text-muted">—</span>
                )}
            </div>

            {/* City */}
            <div role="cell"
                className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}
                onDoubleClick={(e) => { e.stopPropagation(); onStartEdit?.(order.id, "city"); }}
            >
                {isEditingField("city") ? (
                    <OrderInlineEdit orderId={order.id} field="city" value={order.city || ""} />
                ) : (
                    <span className="text-xs text-muted">{order.city || "—"}</span>
                )}
            </div>

            {/* Address */}
            <div role="cell"
                className={`px-3 ${cellPy} h-full flex items-center overflow-hidden border-r border-gray-100/60`}
                onDoubleClick={(e) => { e.stopPropagation(); onStartEdit?.(order.id, "address_details"); }}
            >
                {isEditingField("address_details") ? (
                    <OrderInlineEdit orderId={order.id} field="address_details" value={order.address_details || ""} />
                ) : (
                    <span className="text-xs text-muted truncate block w-full" title={order.address_details || ""}>
                        {order.address_details ? order.address_details.replace(order.city || "", "").replace(/^[\s,-]+/, "").trim() || "—" : "—"}
                    </span>
                )}
            </div>

            {/* Products */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center overflow-hidden border-r border-gray-100/60`}>
                <div className="flex flex-wrap gap-1">
                    {itemLines.length > 0 ? itemLines.map((item, i) => {
                        const bgColor = item.tag_color ? `${item.tag_color}20` : '#f3f4f6';
                        const textColor = item.tag_color || '#374151';
                        return (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: bgColor, color: textColor, border: `1px solid ${item.tag_color || '#e5e7eb'}` }} title={item.name}>
                                {item.name} <span style={{ opacity: 0.7 }}>×{item.quantity}</span>
                            </span>
                        );
                    }) : <span className="text-xs text-muted">—</span>}
                </div>
            </div>

            {/* Amount */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}>
                <div className="flex flex-col items-start gap-0.5">
                    <div className="flex items-center gap-1">
                        <span className={cn("font-mono font-bold whitespace-nowrap", isReturn ? "text-xs text-red-600" : "text-sm text-emerald-600", !isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && "text-amber-600", !isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && "text-blue-600")}>
                            {isReturn && "-"}{formatIQD(Math.abs(Number(order.price)))}
                        </span>
                        {!isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && <TrendingUp className="w-3 h-3 text-amber-500" />}
                        {!isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && <TrendingDown className="w-3 h-3 text-blue-500" />}
                    </div>
                    {(order.payment_status === "paid" || order.payment_status === "prepaid") && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 rounded-md font-bold">واصل</span>
                    )}
                </div>
            </div>

            {/* Status - Custom Dropdown */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`} onClick={(e) => e.stopPropagation()}>
                <StatusDropdown status={order.status} orderId={order.id} isReturn={isReturn} updateOrderStatus={updateOrderStatus} onStatusChanged={onStatusChanged} />
            </div>

            {/* Source */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center justify-center border-r border-gray-100/60`}>
                <span className={cn("px-1.5 py-0.5 text-[9px] font-bold rounded",
                    order.source === "lightfunnels" && "bg-purple-100 text-purple-700",
                    order.source === "delivery_import" && "bg-blue-100 text-blue-700",
                    order.source === "whatsapp" && "bg-green-100 text-green-700",
                    order.source === "shop" && "bg-amber-100 text-amber-700",
                    (!order.source || order.source === "woo" || order.source === "salla" || order.source === "manual") && "bg-gray-100 text-gray-500",
                )}>
                    {order.source === "lightfunnels" ? "LF" : order.source === "delivery_import" ? "DLV" : order.source === "whatsapp" ? "WA" : order.source === "shop" ? "محل" : order.source === "woo" ? "WOO" : order.source === "salla" ? "SALLA" : (order.source || "—")}
                </span>
                {/* The ad network the customer clicked, beside the system that sent it. */}
                <AdChannelBadge attribution={order.attribution} channel={order.ad_channel} iconOnly className="ms-1" />
            </div>

            {/* Date - Recency + M-D + Time */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}>
                <div className="flex flex-col items-start leading-tight">
                    <span className="text-[9px] text-muted font-medium">{getOrderAge(order.created_at, language)}</span>
                    <span className="text-xs text-gray-700 font-mono">{formatDateShort(order.created_at)}</span>
                    <span className="text-[10px] text-gray-400">{new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                    {getScheduledState(order.scheduled_date) && (
                        <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[9px] font-bold">
                            <Calendar className="w-2.5 h-2.5" />
                            {isScheduledToday(order.scheduled_date) ? t("orderDetail.scheduledToday") : formatScheduledDate(order.scheduled_date)}
                        </span>
                    )}
                </div>
            </div>

            {/* Color Tag */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center justify-center`}>
                <ColorTagPicker
                    currentColor={order.tag_color}
                    orderId={order.id}
                    updateOrder={updateOrder}
                />
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.order === nextProps.order &&
        prevProps.displayIndex === nextProps.displayIndex &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isDuplicate === nextProps.isDuplicate &&
        prevProps.duplicateSeverity === nextProps.duplicateSeverity &&
        prevProps.onContactRecorded === nextProps.onContactRecorded &&
        prevProps.modePrice === nextProps.modePrice &&
        prevProps.isFlashing === nextProps.isFlashing &&
        prevProps.isFocused === nextProps.isFocused &&
        prevProps.density === nextProps.density &&
        prevProps.editingCell === nextProps.editingCell &&
        prevProps.gridTemplate === nextProps.gridTemplate &&
        prevProps.scrollMargin === nextProps.scrollMargin &&
        prevProps.virtualRow.size === nextProps.virtualRow.size &&
        prevProps.virtualRow.start === nextProps.virtualRow.start &&
        prevProps.virtualRow.index === nextProps.virtualRow.index
    );
});

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
            toast.success("Row reordered");
        }
    }, [updateOrder, displayedOrders]);

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
        const items: Array<{ type: 'header' | 'row', data: any, groupName?: string, displayIndex?: number }> = [];
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
                                            return <span className="flex items-center gap-0.5 text-primary">{(sortConfigs || []).length > 1 && <span className="text-[8px]">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}</span>;
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
                                    ].map((col: any) => (
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
                                                    return <span className="flex items-center gap-0.5 text-blue-500">{(sortConfigs || []).length > 1 && <span className="text-[8px] font-bold">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}</span>;
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
                                                        className="mt-2 text-[10px] text-rose-500 hover:text-rose-600 font-medium transition-colors w-full text-center py-1 rounded hover:bg-rose-50"
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
                                            return <span className="flex items-center gap-0.5 text-blue-500">{(sortConfigs || []).length > 1 && <span className="text-[8px] font-bold">{idx + 1}</span>}{sc.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}</span>;
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
