"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    GitMerge,
    UserPlus,
    XCircle,
    Calendar,
    Phone,
    User,
    Package,
    Hash,
    CheckCircle,
    AlertTriangle,
    Clock,
    Truck,
    Eye,
    ShieldX,
    MessageSquare,
    History,
    Ban,
    Sparkles,
    ChevronRight,
    Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, formatDate, getBaseOrderId } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import type { Order } from "@/lib/supabase";

interface CustomerStats {
    totalOrders: number;
    totalSpent: number;
    deliveredCount: number;
    rejectedCount: number;
    cancelledCount: number;
}

interface DuplicateComparisonModalProps {
    open: boolean;
    onClose: () => void;
    currentOrder: Order;
    duplicateOrders: Order[];
    onMerge: (targetOrderId: string, sourceOrderId: string) => Promise<{ success: boolean; error?: string }>;
    onMarkAsSameCustomer: (orderId: string) => void;
    onCancelOrder: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    onViewOrder: (order: Order) => void;
    onDismissDuplicate?: (phone: string, notes?: string) => Promise<void>;
    onFilterDuplicates?: () => void;
    isBlacklisted?: (phone: string) => boolean;
    getCustomerOrders?: (phone: string) => Order[];
}

// Status configuration
const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    new: { label: "جديد", color: "text-orange-800", bgColor: "bg-orange-100" },
    contacted: { label: "تم الاتصال", color: "text-yellow-800", bgColor: "bg-yellow-100" },
    confirmed: { label: "مؤكد", color: "text-emerald-800", bgColor: "bg-emerald-100" },
    cancelled: { label: "ملغي", color: "text-gray-600", bgColor: "bg-gray-100" },
    in_transit: { label: "قيد التوصيل", color: "text-blue-800", bgColor: "bg-blue-100" },
    delivered: { label: "تم التوصيل", color: "text-teal-800", bgColor: "bg-teal-100" },
    rejected: { label: "مرفوض", color: "text-rose-800", bgColor: "bg-rose-100" },
    completed: { label: "طلب تام", color: "text-emerald-900", bgColor: "bg-emerald-200" },
    no_response: { label: "لم يرد", color: "text-slate-600", bgColor: "bg-slate-100" },
};

// Calculate relative time
function getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return date.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" });
}

// Calculate match confidence score
function calculateMatchScore(order1: Order, order2: Order): number {
    let score = 0;

    // Phone match (40%)
    if (order1.phone === order2.phone) score += 40;
    else if (order1.phone?.slice(-9) === order2.phone?.slice(-9)) score += 30;

    // Name match (30%)
    const name1 = order1.customer_name?.toLowerCase().trim() || "";
    const name2 = order2.customer_name?.toLowerCase().trim() || "";
    if (name1 === name2) score += 30;
    else if (name1.includes(name2) || name2.includes(name1)) score += 20;

    // City/Address match (20%)
    if (order1.city === order2.city) score += 15;
    if (order1.address_details && order2.address_details &&
        order1.address_details === order2.address_details) score += 5;

    // Products overlap (10%)
    const items1 = order1.items?.map(i => i.name.toLowerCase()) || [];
    const items2 = order2.items?.map(i => i.name.toLowerCase()) || [];
    const overlap = items1.filter(i => items2.includes(i)).length;
    if (overlap > 0) score += Math.min(10, overlap * 5);

    return Math.min(100, score);
}

export function DuplicateComparisonModal({
    open,
    onClose,
    currentOrder,
    duplicateOrders,
    onMerge,
    onMarkAsSameCustomer,
    onCancelOrder,
    onViewOrder,
    onDismissDuplicate,
    onFilterDuplicates,
    isBlacklisted,
    getCustomerOrders,
}: DuplicateComparisonModalProps) {
    // Multi-select for side-by-side comparison
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [actionType, setActionType] = useState<string | null>(null);
    const [dismissNote, setDismissNote] = useState("");
    const [showMergePreview, setShowMergePreview] = useState(false);
    const [actionNote, setActionNote] = useState("");

    // Initialize with first duplicate selected
    useEffect(() => {
        if (duplicateOrders.length > 0 && selectedOrderIds.length === 0) {
            setSelectedOrderIds([duplicateOrders[0].id]);
        }
    }, [duplicateOrders, selectedOrderIds.length]);

    // Get selected orders for comparison
    const selectedOrders = useMemo(() =>
        duplicateOrders.filter(o => selectedOrderIds.includes(o.id)),
        [duplicateOrders, selectedOrderIds]
    );

    // All orders to display (current + selected)
    const allDisplayOrders = useMemo(() =>
        [currentOrder, ...selectedOrders],
        [currentOrder, selectedOrders]
    );

    // Calculate customer stats from all orders with same phone
    const customerStats = useMemo((): CustomerStats => {
        const allOrders = getCustomerOrders?.(currentOrder.phone) || [...duplicateOrders, currentOrder];
        return {
            totalOrders: allOrders.length,
            totalSpent: allOrders.reduce((sum, o) => sum + (Number(o.price) || 0), 0),
            deliveredCount: allOrders.filter(o => o.status === "delivered" || o.status === "completed").length,
            rejectedCount: allOrders.filter(o => o.status === "rejected").length,
            cancelledCount: allOrders.filter(o => o.status === "cancelled").length,
        };
    }, [currentOrder.phone, duplicateOrders, currentOrder, getCustomerOrders]);

    // Check if customer is blacklisted
    const isCustomerBlacklisted = isBlacklisted?.(currentOrder.phone) || false;

    // Calculate match scores for each duplicate
    const matchScores = useMemo(() => {
        const scores: Record<string, number> = {};
        duplicateOrders.forEach(order => {
            scores[order.id] = calculateMatchScore(currentOrder, order);
        });
        return scores;
    }, [currentOrder, duplicateOrders]);

    // Average match score for header
    const avgMatchScore = useMemo(() => {
        const scores = Object.values(matchScores);
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }, [matchScores]);

    // Toggle order in selection
    const toggleOrderSelection = (orderId: string) => {
        setSelectedOrderIds(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    // Get merged items preview
    const mergedItemsPreview = useMemo(() => {
        if (selectedOrders.length !== 1) return null;
        const allItems: { name: string; quantity: number; price: number }[] = [];

        // Add current order items
        currentOrder.items?.forEach(item => {
            const existing = allItems.find(i => i.name === item.name);
            if (existing) existing.quantity += item.quantity;
            else allItems.push({ ...item });
        });

        // Add selected order items
        selectedOrders[0].items?.forEach(item => {
            const existing = allItems.find(i => i.name === item.name);
            if (existing) existing.quantity += item.quantity;
            else allItems.push({ ...item });
        });

        return {
            items: allItems,
            total: allItems.reduce((sum, i) => sum + (i.price * i.quantity), 0),
        };
    }, [currentOrder, selectedOrders]);

    // Check if action is allowed based on status
    const canMerge = (order: Order) => !["delivered", "rejected", "completed", "cancelled"].includes(order.status);
    const canCancel = (order: Order) => !["delivered", "completed"].includes(order.status);

    // Handlers
    const handleMerge = async () => {
        if (selectedOrders.length !== 1) return;
        setIsProcessing(true);
        setActionType("merge");
        const result = await onMerge(selectedOrders[0].id, currentOrder.id);
        setIsProcessing(false);
        setActionType(null);
        if (result.success) onClose();
    };

    const handleMarkAsSameCustomer = () => {
        onMarkAsSameCustomer(currentOrder.id);
        onClose();
    };

    const handleCancelNew = async () => {
        setIsProcessing(true);
        setActionType("cancelNew");
        await onCancelOrder(currentOrder.id);
        setIsProcessing(false);
        setActionType(null);
        onClose();
    };

    const handleCancelOld = async () => {
        if (selectedOrders.length !== 1) return;
        setIsProcessing(true);
        setActionType("cancelOld");
        await onCancelOrder(selectedOrders[0].id);
        setIsProcessing(false);
        setActionType(null);
        onClose();
    };

    const handleDismiss = () => {
        // Just close the modal - no database tracking needed
        // The returning customer indicator will continue to show the order count
        onClose();
    };

    // Get status badge
    const getStatusBadge = (status: Order["status"]) => {
        const config = statusConfig[status] || { label: status, color: "text-gray-600", bgColor: "bg-gray-100" };
        return (
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", config.bgColor, config.color)}>
                {config.label}
            </span>
        );
    };

    // Field comparison with highlighting
    const compareField = (
        label: string,
        icon: React.ReactNode,
        getValue: (order: Order) => string,
        options?: { highlight?: boolean }
    ) => {
        const values = allDisplayOrders.map(o => getValue(o));
        const allMatch = values.every(v => v === values[0]);

        return (
            <div className={cn(
                "grid gap-3 py-3 border-b border-dashed border-[var(--card-border)] last:border-0",
                `grid-cols-${allDisplayOrders.length + 1}`
            )} style={{ gridTemplateColumns: `140px repeat(${allDisplayOrders.length}, 1fr)` }}>
                <div className="flex items-center gap-2 text-muted text-sm">
                    {icon}
                    {label}
                </div>
                {allDisplayOrders.map((order, idx) => (
                    <div
                        key={order.id}
                        className={cn(
                            "text-sm font-medium text-center px-2 py-1 rounded-lg transition-all",
                            options?.highlight && (
                                allMatch
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-orange-50 text-orange-700 border border-orange-200"
                            ),
                            !options?.highlight && (allMatch ? "text-emerald-700" : "text-foreground")
                        )}
                    >
                        {getValue(order)}
                    </div>
                ))}
            </div>
        );
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="w-full max-w-6xl max-h-[90vh] bg-gradient-to-br from-white to-gray-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header with gradient and match score */}
                    <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">
                                        طلب مكرر محتمل
                                    </h2>
                                    <p className="text-white/80 text-sm">
                                        تم العثور على {duplicateOrders.length} طلب مشابه لهذا العميل
                                    </p>
                                </div>
                            </div>

                            {/* Match Score Badge */}
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
                                    <div className="w-20 h-2 bg-white/30 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all",
                                                avgMatchScore >= 80 ? "bg-red-400" :
                                                    avgMatchScore >= 60 ? "bg-orange-400" : "bg-yellow-400"
                                            )}
                                            style={{ width: `${avgMatchScore}%` }}
                                        />
                                    </div>
                                    <span className="text-white font-bold text-lg">{avgMatchScore}%</span>
                                </div>
                                <span className="text-white/70 text-xs">نسبة التطابق</span>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Blacklist Warning */}
                        {isCustomerBlacklisted && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-2xl"
                            >
                                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                    <ShieldX className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-red-800">⚠️ تحذير: هذا العميل في القائمة السوداء</p>
                                    <p className="text-sm text-red-600">يرجى مراجعة سجل العميل قبل المتابعة</p>
                                </div>
                            </motion.div>
                        )}

                        {/* Customer Stats */}
                        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                <History className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-blue-900">
                                    👤 هذا العميل لديه {customerStats.totalOrders} طلب
                                </p>
                                <p className="text-sm text-blue-700">
                                    القيمة الإجمالية: {formatIQD(customerStats.totalSpent)}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {customerStats.deliveredCount > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold">
                                        ✓ {customerStats.deliveredCount} تم
                                    </span>
                                )}
                                {customerStats.rejectedCount > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                                        ✗ {customerStats.rejectedCount} مرفوض
                                    </span>
                                )}
                                {customerStats.cancelledCount > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                                        ⊘ {customerStats.cancelledCount} ملغي
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Order Selector - Multi-select chips */}
                        <div>
                            <p className="text-sm text-muted mb-3">اختر الطلبات للمقارنة (يمكنك اختيار أكثر من واحد):</p>
                            <div className="flex gap-2 flex-wrap">
                                {duplicateOrders.map((order) => {
                                    const score = matchScores[order.id];
                                    const isSelected = selectedOrderIds.includes(order.id);
                                    return (
                                        <button
                                            key={order.id}
                                            onClick={() => toggleOrderSelection(order.id)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border-2",
                                                isSelected
                                                    ? "bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-500/25"
                                                    : "bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50"
                                            )}
                                        >
                                            <span>#{getBaseOrderId(order.order_id)}</span>
                                            {order.delivery_order_id && (
                                                <span className="px-1 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-semibold">
                                                    🚚 {order.delivery_order_id}
                                                </span>
                                            )}
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                                score >= 80 ? "bg-red-100 text-red-700" :
                                                    score >= 60 ? "bg-orange-100 text-orange-700" :
                                                        "bg-yellow-100 text-yellow-700"
                                            )}>
                                                {score}%
                                            </span>
                                            {isSelected && <CheckCircle className="w-4 h-4" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Dynamic Comparison Table */}
                        {selectedOrders.length > 0 && (
                            <div className="bg-white rounded-2xl border border-[var(--card-border)] overflow-hidden">
                                {/* Table Header */}
                                <div
                                    className="grid gap-3 p-4 bg-gray-50 border-b border-[var(--card-border)]"
                                    style={{ gridTemplateColumns: `140px repeat(${allDisplayOrders.length}, 1fr)` }}
                                >
                                    <div className="text-sm font-bold text-muted">الحقل</div>
                                    {allDisplayOrders.map((order, idx) => (
                                        <div key={order.id} className="text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                                                    idx === 0
                                                        ? "bg-orange-100 text-orange-800"
                                                        : "bg-blue-100 text-blue-800"
                                                )}>
                                                    {idx === 0 && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                                    {idx === 0 ? "الطلب الجديد" : `#${getBaseOrderId(order.order_id)}`}
                                                </span>
                                                <button
                                                    onClick={() => onViewOrder(order)}
                                                    className="w-6 h-6 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                                                    title="عرض التفاصيل"
                                                >
                                                    <Eye className="w-3 h-3 text-gray-600" />
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-muted mt-1">{getRelativeTime(order.created_at)}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Comparison Rows */}
                                <div className="p-4">
                                    {compareField("رقم الطلب", <Hash className="w-4 h-4" />,
                                        (o) => `#${getBaseOrderId(o.order_id)}`)}
                                    {compareField("التاريخ", <Calendar className="w-4 h-4" />,
                                        (o) => formatDate(o.created_at))}
                                    {compareField("اسم العميل", <User className="w-4 h-4" />,
                                        (o) => o.customer_name, { highlight: true })}
                                    {compareField("رقم الهاتف", <Phone className="w-4 h-4" />,
                                        (o) => formatPhoneForDisplay(o.phone), { highlight: true })}
                                    {compareField("المدينة", <Truck className="w-4 h-4" />,
                                        (o) => o.city || "—", { highlight: true })}

                                    {/* Products with images */}
                                    <div
                                        className="grid gap-3 py-3 border-b border-dashed border-[var(--card-border)]"
                                        style={{ gridTemplateColumns: `140px repeat(${allDisplayOrders.length}, 1fr)` }}
                                    >
                                        <div className="flex items-center gap-2 text-muted text-sm">
                                            <Package className="w-4 h-4" />
                                            المنتجات
                                        </div>
                                        {allDisplayOrders.map((order) => (
                                            <div key={order.id} className="space-y-2">
                                                {order.items?.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                                                        {item.image_url ? (
                                                            <img
                                                                src={item.image_url}
                                                                alt={item.name}
                                                                className="w-10 h-10 rounded-lg object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                                                                <Package className="w-4 h-4 text-gray-400" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium truncate">{item.name}</p>
                                                            <p className="text-[10px] text-muted">×{item.quantity}</p>
                                                        </div>
                                                    </div>
                                                )) || <span className="text-xs text-muted">—</span>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Status */}
                                    <div
                                        className="grid gap-3 py-3 border-b border-dashed border-[var(--card-border)]"
                                        style={{ gridTemplateColumns: `140px repeat(${allDisplayOrders.length}, 1fr)` }}
                                    >
                                        <div className="flex items-center gap-2 text-muted text-sm">
                                            <Sparkles className="w-4 h-4" />
                                            الحالة
                                        </div>
                                        {allDisplayOrders.map((order) => (
                                            <div key={order.id} className="text-center">
                                                {getStatusBadge(order.status)}
                                            </div>
                                        ))}
                                    </div>

                                    {compareField("المبلغ", <Clock className="w-4 h-4" />,
                                        (o) => formatIQD(Number(o.price)), { highlight: true })}
                                </div>
                            </div>
                        )}

                        {/* Merge Preview */}
                        {selectedOrders.length === 1 && mergedItemsPreview && (
                            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200">
                                <div className="flex items-center gap-2 mb-3">
                                    <GitMerge className="w-5 h-5 text-purple-600" />
                                    <span className="font-bold text-purple-800">معاينة الدمج</span>
                                </div>
                                <div className="space-y-2">
                                    {mergedItemsPreview.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                            <span className="text-purple-700">{item.name} ×{item.quantity}</span>
                                            <span className="font-mono text-purple-800">{formatIQD(item.price * item.quantity)}</span>
                                        </div>
                                    ))}
                                    <div className="pt-2 mt-2 border-t border-purple-200 flex items-center justify-between">
                                        <span className="font-bold text-purple-900">المجموع بعد الدمج</span>
                                        <span className="font-bold font-mono text-purple-900">{formatIQD(mergedItemsPreview.total)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick Note */}
                        <div className="flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-muted flex-shrink-0" />
                            <input
                                type="text"
                                value={actionNote}
                                onChange={(e) => setActionNote(e.target.value)}
                                placeholder="أضف ملاحظة (اختياري)..."
                                className="flex-1 px-4 py-2 bg-white border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            {/* Merge Orders */}
                            <button
                                onClick={handleMerge}
                                disabled={isProcessing || selectedOrders.length !== 1 || !canMerge(currentOrder) || !canMerge(selectedOrders[0])}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-semibold hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25"
                                title={selectedOrders.length !== 1 ? "اختر طلب واحد للدمج" : !canMerge(currentOrder) || !canMerge(selectedOrders[0]) ? "لا يمكن دمج الطلبات المكتملة" : ""}
                            >
                                <GitMerge className="w-6 h-6" />
                                <span className="text-sm">دمج الطلبات</span>
                                {actionType === "merge" && (
                                    <span className="text-xs opacity-80">جاري الدمج...</span>
                                )}
                            </button>

                            {/* Mark as Same Customer */}
                            <button
                                onClick={handleMarkAsSameCustomer}
                                disabled={isProcessing}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/25"
                            >
                                <UserPlus className="w-6 h-6" />
                                <span className="text-sm">نفس العميل</span>
                            </button>

                            {/* Cancel New Order */}
                            <button
                                onClick={handleCancelNew}
                                disabled={isProcessing || !canCancel(currentOrder)}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white font-semibold hover:from-rose-600 hover:to-pink-700 transition-all disabled:opacity-50 shadow-lg shadow-rose-500/25"
                            >
                                <XCircle className="w-6 h-6" />
                                <span className="text-sm">إلغاء الجديد</span>
                                {actionType === "cancelNew" && (
                                    <span className="text-xs opacity-80">جاري الإلغاء...</span>
                                )}
                            </button>

                            {/* Cancel Old Order */}
                            <button
                                onClick={handleCancelOld}
                                disabled={isProcessing || selectedOrders.length !== 1 || !canCancel(selectedOrders[0])}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-gray-500 to-slate-600 text-white font-semibold hover:from-gray-600 hover:to-slate-700 transition-all disabled:opacity-50 shadow-lg shadow-gray-500/25"
                            >
                                <XCircle className="w-6 h-6" />
                                <span className="text-sm">إلغاء السابق</span>
                                {actionType === "cancelOld" && (
                                    <span className="text-xs opacity-80">جاري الإلغاء...</span>
                                )}
                            </button>

                            {/* Not Duplicate - Just close modal */}
                            <button
                                onClick={handleDismiss}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border-2 border-amber-300 text-amber-700 font-semibold hover:bg-amber-50 hover:border-amber-400 transition-all"
                            >
                                <Ban className="w-6 h-6" />
                                <span className="text-sm">ليست مكررة</span>
                            </button>

                            {/* Show All Duplicates Filter */}
                            {onFilterDuplicates && (
                                <button
                                    onClick={() => {
                                        onFilterDuplicates();
                                        onClose();
                                    }}
                                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white font-semibold hover:from-orange-600 hover:to-amber-700 transition-all shadow-lg shadow-orange-500/25"
                                >
                                    <Filter className="w-6 h-6" />
                                    <span className="text-sm">عرض جميع المكررين</span>
                                </button>
                            )}
                        </div>

                        {/* Footer hint */}
                        <p className="text-center text-xs text-muted">
                            💡 دمج الطلبات سيجمع المنتجات في طلب واحد ويلغي الطلب الآخر
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
