"use client";

import { OrderPlacementBadge } from "@/components/orders/order-placement-badge";
import { CodRiskChip } from "@/components/orders/cod-risk-chip";
import { type VirtualItem } from '@tanstack/react-virtual';
import { useRef, memo } from 'react';
import { cn, formatIQD } from '@/lib/utils';
import { formatPhoneGrouped, validatePhoneDetailed } from '@/lib/order-utils';
import { isWhatsAppSlot } from '@/lib/whatsapp-contact';
import type { Order, OrderStatus } from '@/lib/supabase';
import { MapPin as Pin, CopyPlus, TrendingUp, TrendingDown, Copy, Calendar, GripVertical, AlertTriangle } from 'lucide-react';
import { RiskBadge } from '@/components/orders/risk-badge';
import { AdChannelBadge } from '@/components/orders/ad-channel-badge';
import { getOrderAge, getScheduledState, isScheduledToday, formatScheduledDate } from '@/lib/order-format-utils';
import { OrderInlineEdit } from './order-inline-edit';
import { useOrdersContext } from '@/components/providers/orders-provider';
import type { TableDensity } from './density-toggle';
import { useLanguage } from '@/components/providers/language-provider';
import type { DuplicateWindowAlert } from '@/lib/duplicate-window';
import { mergeOrderItems } from '@/lib/merge-order-items';
import { getAvatarColor, getInitials, formatDateShort, DENSITY_CONFIG } from './table-layout';
import { StatusDropdown } from './status-dropdown';
import { ColorTagPicker } from './color-tag-picker';
import { copyToClipboard } from './copy-to-clipboard';
import { EnteredByMark } from '../card/entered-by-mark';

export type UpdateOrderFn = ReturnType<typeof useOrdersContext>["updateOrder"];

export interface VirtualTableRowProps {
    order: Order;
    displayIndex: number | undefined;
    virtualRow: VirtualItem;
    scrollMargin: number;
    isSelected: boolean;
    isDuplicate: boolean;
    duplicateSeverity: DuplicateWindowAlert["severity"] | undefined;
    onContactRecorded?: (orderId: string) => void;
    modePrice: number;
    togglePin: (id: string) => void;
    toggleOrderSelection: (id: string) => void;
    setSelectedOrder: (order: Order) => void;
    setIsModalOpen: (open: boolean) => void;
    getRiskLevel: (phone: string) => 'low' | 'medium' | 'high' | 'blocked' | null;
    setDuplicateOrder: (order: Order) => void;
    setShowDuplicateModal: (open: boolean) => void;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<unknown>;
    onStatusChanged: (orderId: string) => void;
    isFlashing: boolean;
    isFocused: boolean;
    density: TableDensity;
    editingCell: { orderId: string; field: string } | null;
    onStartEdit: (orderId: string | null, field: string | null) => void;
    updateOrder: UpdateOrderFn;
    onContextMenu: (e: React.MouseEvent, order: Order) => void;
    gridTemplate: string;
    onMouseEnter: (e: React.MouseEvent, order: Order) => void;
    onMouseLeave: () => void;
    onRowDrop?: (e: React.DragEvent, targetOrderId: string) => void;
}

export const VirtualTableRow = memo(function VirtualTableRow({
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
}: VirtualTableRowProps) {
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
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-600 border border-red-200" title={order.delivery_note || t("orders.card.attn.whatsappFailed")}>
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
                        <button onClick={(e) => { e.stopPropagation(); setDuplicateOrder(order); setShowDuplicateModal(true); }} className="p-0.5 rounded hover:bg-amber-100 transition-colors" title={t("orders.tip.viewDuplicates")}>
                            <CopyPlus className={cn("w-3 h-3", duplicateSeverity === "critical" ? "text-rose-500" : "text-amber-500")} />
                        </button>
                    )}
                    {!validatePhoneDetailed(order.phone).isValid && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title={t("orders.tip.invalidPhone")} />}
                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(order.phone.replace(/^\+964/, "0").replace(/^964/, "0"), order.phone, t); }} className="p-0.5 rounded opacity-0 group-hover/phone:opacity-100 transition-opacity hover:bg-gray-100" title={t("orders.tip.copyPhone")}>
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
                            onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/964${(order.secondary_phone ?? "").replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank"); onContactRecorded?.(order.id); }}
                        >
                            {formatPhoneGrouped(order.secondary_phone)}
                        </span>
                        {!validatePhoneDetailed(order.secondary_phone).isValid && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title={t("orders.tip.invalidPhone")} />}
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
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded" style={{ backgroundColor: bgColor, color: textColor, border: `1px solid ${item.tag_color || '#e5e7eb'}` }} title={item.name}>
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
                        <span className="px-1.5 py-0.5 text-[11px] bg-emerald-100 text-emerald-700 rounded-md font-bold">{t("orders.card.paid")}</span>
                    )}
                </div>
            </div>

            {/* Status - Custom Dropdown */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`} onClick={(e) => e.stopPropagation()}>
                <StatusDropdown status={order.status} orderId={order.id} isReturn={isReturn} updateOrderStatus={updateOrderStatus} onStatusChanged={onStatusChanged} />
            </div>

            {/* Source */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center justify-center border-r border-gray-100/60`}>
                <span className={cn("px-1.5 py-0.5 text-[11px] font-bold rounded",
                    order.source === "lightfunnels" && "bg-purple-100 text-purple-700",
                    order.source === "delivery_import" && "bg-blue-100 text-blue-700",
                    order.source === "whatsapp" && "bg-green-100 text-green-700",
                    order.source === "shop" && "bg-amber-100 text-amber-700",
                    (!order.source || order.source === "manual") && "bg-gray-100 text-gray-500",
                )}>
                    {order.source === "lightfunnels" ? "LF" : order.source === "delivery_import" ? "DLV" : order.source === "whatsapp" ? "WA" : order.source === "shop" ? t("orders.source.shop") : (order.source || "—")}
                </span>
                {/* The ad network the customer clicked, beside the system that sent it. */}
                <AdChannelBadge attribution={order.attribution} channel={order.ad_channel} iconOnly className="ms-1" />
                <EnteredByMark enteredBy={order.entered_by} source={order.source} className="ms-1 h-5 w-5" />
            </div>

            {/* Date - Recency + M-D + Time */}
            <div role="cell" className={`px-3 ${cellPy} h-full flex items-center border-r border-gray-100/60`}>
                <div className="flex flex-col items-start leading-tight">
                    <span className="text-[11px] text-muted font-medium">{getOrderAge(order.created_at, language)}</span>
                    <span className="text-xs text-gray-700 font-mono">{formatDateShort(order.created_at)}</span>
                    <span className="text-[11px] text-gray-400">{new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                    {getScheduledState(order.scheduled_date) && (
                        <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
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
