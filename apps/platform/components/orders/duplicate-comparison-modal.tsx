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
    ArrowRightLeft,
    Equal,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, formatDate, getBaseOrderId } from "@/lib/utils";
import { formatPhoneForDisplay, normalizePhoneForSearch } from "@/lib/order-utils";
import type { Order } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

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
    onMerge: (targetOrderId: string, sourceOrderId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
    onMarkAsSameCustomer: (orderId: string, notes?: string) => void;
    onCancelOrder: (orderId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
    onViewOrder: (order: Order) => void;
    onDismissDuplicate?: (phone: string, notes?: string) => Promise<void>;
    onFilterDuplicates?: () => void;
    isBlacklisted?: (phone: string) => boolean;
    getCustomerOrders?: (phone: string) => Order[];
}

// Status badge styles — matches order-card.tsx getStatusBadgeStyle exactly
function getStatusBadgeStyle(status: string): string {
    switch (status) {
        case "new": return "bg-orange-200 text-orange-900 dark:bg-[rgba(255,106,0,0.15)] dark:text-[#FF8C42] dark:border-[rgba(255,106,0,0.3)]";
        case "contacted": return "bg-[var(--pastel-yellow)] text-amber-900 dark:bg-[rgba(239,255,0,0.12)] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.3)]";
        case "confirmed": return "bg-[var(--pastel-green)] text-green-900 dark:bg-[rgba(57,255,20,0.12)] dark:text-[#66FFAA] dark:border-[rgba(57,255,20,0.3)]";
        case "cancelled": return "bg-red-200 text-red-900 dark:bg-[rgba(255,51,51,0.12)] dark:text-[#FF6666] dark:border-[rgba(255,51,51,0.3)]";
        case "in_transit": return "bg-blue-200 text-blue-900 dark:bg-[rgba(0,229,255,0.12)] dark:text-[#66DDFF] dark:border-[rgba(0,229,255,0.3)]";
        case "delivered": return "bg-[var(--pastel-mint)] text-teal-900 dark:bg-[rgba(0,229,255,0.12)] dark:text-[#00E5FF] dark:border-[rgba(0,229,255,0.3)]";
        case "rejected": return "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-[rgba(255,51,51,0.12)] dark:text-[#FF8899] dark:border-[rgba(255,51,51,0.3)]";
        case "completed": return "bg-emerald-200 text-emerald-900 ring-2 ring-emerald-400/50 dark:bg-[rgba(0,255,100,0.15)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.3)] dark:ring-[rgba(0,255,100,0.2)]";
        case "no_response": return "bg-slate-200 text-slate-600 dark:bg-[rgba(184,0,255,0.12)] dark:text-[#CC88FF] dark:border-[rgba(184,0,255,0.3)]";
        case "return_pending": return "bg-rose-200 text-rose-900 ring-2 ring-rose-400/50 dark:bg-[rgba(255,0,127,0.12)] dark:text-[#FF6699] dark:border-[rgba(255,0,127,0.3)]";
        default: return "bg-gray-100 text-gray-700 dark:bg-[rgba(255,255,255,0.06)] dark:text-[#A1A1A1] dark:border-[rgba(255,255,255,0.1)]";
    }
}

// Status labels map to i18n keys
const statusKeyMap: Record<string, string> = {
    new: "orders.status.new",
    contacted: "orders.status.contacted",
    confirmed: "orders.status.confirmed",
    cancelled: "orders.status.cancelled",
    in_transit: "orders.status.in_transit",
    delivered: "orders.status.delivered",
    rejected: "orders.status.rejected",
    completed: "orders.status.completed",
    no_response: "orders.status.no_response",
    return_pending: "orders.status.return_pending",
};

// Format date in English: 2025/1/5 07:18 PM
function formatDateEN(dateStr: string): string {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${y}/${m}/${day} ${h12}:${mins} ${ampm}`;
}

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

    const phone1 = normalizePhoneForSearch(order1.phone);
    const phone2 = normalizePhoneForSearch(order2.phone);
    if (phone1 && phone2 && phone1 === phone2) score += 40;
    else if (order1.phone === order2.phone) score += 40;

    const name1 = order1.customer_name?.toLowerCase().trim() || "";
    const name2 = order2.customer_name?.toLowerCase().trim() || "";
    if (name1 === name2) score += 30;
    else if (name1.includes(name2) || name2.includes(name1)) score += 20;

    if (order1.city === order2.city) score += 15;
    if (order1.address_details && order2.address_details &&
        order1.address_details === order2.address_details) score += 5;

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
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [actionType, setActionType] = useState<string | null>(null);
    const [actionNote, setActionNote] = useState("");
    const { t } = useLanguage();

    useEffect(() => {
        if (duplicateOrders.length > 0 && selectedOrderIds.length === 0) {
            setSelectedOrderIds([duplicateOrders[0].id]);
        }
    }, [duplicateOrders, selectedOrderIds.length]);

    const selectedOrders = useMemo(() =>
        duplicateOrders.filter(o => selectedOrderIds.includes(o.id)),
        [duplicateOrders, selectedOrderIds]
    );

    const allDisplayOrders = useMemo(() =>
        [currentOrder, ...selectedOrders],
        [currentOrder, selectedOrders]
    );

    const isCustomerBlacklisted = isBlacklisted?.(currentOrder.phone) || false;

    const matchScores = useMemo(() => {
        const scores: Record<string, number> = {};
        duplicateOrders.forEach(order => {
            scores[order.id] = calculateMatchScore(currentOrder, order);
        });
        return scores;
    }, [currentOrder, duplicateOrders]);

    const avgMatchScore = useMemo(() => {
        const scores = Object.values(matchScores);
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }, [matchScores]);

    const toggleOrderSelection = (orderId: string) => {
        setSelectedOrderIds(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    const mergedItemsPreview = useMemo(() => {
        if (selectedOrders.length !== 1) return null;
        const allItems: { name: string; quantity: number; price: number }[] = [];
        currentOrder.items?.forEach(item => {
            const existing = allItems.find(i => i.name === item.name);
            if (existing) existing.quantity += item.quantity;
            else allItems.push({ ...item });
        });
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

    const canMerge = (order: Order) => !["delivered", "rejected", "completed", "cancelled"].includes(order.status);
    const canCancel = (order: Order) => !["delivered", "completed"].includes(order.status);

    const handleMerge = async () => {
        if (selectedOrders.length !== 1) return;
        setIsProcessing(true);
        setActionType("merge");
        const result = await onMerge(currentOrder.id, selectedOrders[0].id, actionNote || undefined);
        setIsProcessing(false);
        setActionType(null);
        if (result.success) onClose();
    };

    const handleMarkAsSameCustomer = () => {
        onMarkAsSameCustomer(currentOrder.id, actionNote || undefined);
        onClose();
    };

    const handleCancelNew = async () => {
        setIsProcessing(true);
        setActionType("cancelNew");
        await onCancelOrder(currentOrder.id, actionNote || undefined);
        setIsProcessing(false);
        setActionType(null);
        onClose();
    };

    const handleCancelOld = async () => {
        if (selectedOrders.length !== 1) return;
        setIsProcessing(true);
        setActionType("cancelOld");
        await onCancelOrder(selectedOrders[0].id, actionNote || undefined);
        setIsProcessing(false);
        setActionType(null);
        onClose();
    };

    const handleDismiss = async () => {
        if (onDismissDuplicate) {
            setIsProcessing(true);
            setActionType("dismiss");
            await onDismissDuplicate(currentOrder.phone, actionNote || undefined);
            setIsProcessing(false);
            setActionType(null);
            onClose();
        }
    };

    // ─── Comparison row with diff highlighting ───
    const compareField = (
        label: string,
        icon: React.ReactNode,
        getVal: (order: Order) => React.ReactNode,
    ) => {
        const val1 = getVal(currentOrder);
        const orderVals = duplicateOrders.map(getVal);
        const allMatch = orderVals.every(v => v === val1);

        return (
            <div className={cn(
                "grid gap-3 py-2 border-b border-dashed last:border-0",
                "border-[var(--card-border)]",
            )} style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, 1fr)` }}>
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                    <span className="text-[var(--foreground-subtle)] w-4 h-4 flex-shrink-0">{icon}</span>
                    {label}
                </div>
                {allDisplayOrders.map((order) => (
                    <div
                        key={order.id}
                        className={cn(
                            "text-sm font-medium text-center px-2 py-1 rounded-lg transition-all flex items-center justify-center",
                            allMatch
                                ? cn(
                                    "bg-emerald-50/60 text-emerald-700 border border-emerald-200/60",
                                    "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                )
                                : cn(
                                    "bg-amber-50/80 text-amber-700 border border-amber-200/60",
                                    "dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
                                )
                        )}
                    >
                        {getVal(order)}
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
                    className={cn(
                        "w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col",
                        "bg-gradient-to-br from-[#FFFDF7] to-[#F5F0E8]",
                        "dark:bg-gradient-to-br dark:from-[#1A1A1A] dark:to-[#121212]",
                        "dark:border dark:border-[#3F3F3F]",
                        "dark:shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ═══ Compact Header ═══ */}
                    <div className={cn(
                        "relative px-5 py-4 flex-shrink-0 border-b",
                        "bg-gradient-to-r from-[#F5F0E8] via-[#FBE38E]/20 to-[#F4C7CF]/15",
                        "border-[var(--card-border)]",
                        "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]",
                        "dark:bg-gradient-to-r dark:from-[#1E1E1E] dark:via-[#1E1E1E] dark:to-[#1E1E1E]",
                    )}>
                        {/* Neon top accent line — dark mode only */}
                        <div className="hidden dark:block absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#EFFF00] to-transparent opacity-60" />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center",
                                    "bg-[var(--pastel-yellow)]/40",
                                    "dark:bg-[rgba(239,255,0,0.1)] dark:border dark:border-[rgba(239,255,0,0.2)]"
                                )}>
                                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-[#EFFF00]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-[var(--foreground)]">
                                        {t("orders.duplicate.title")}
                                    </h2>
                                    <p className="text-xs text-[var(--foreground-muted)]">
                                        {t("orders.duplicate.foundSimilar", { count: String(duplicateOrders.length) })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Match Score */}
                                <div className={cn(
                                    "flex items-center gap-2.5 rounded-full px-3 py-1.5",
                                    "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                    "dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
                                    avgMatchScore >= 80 && "dark:border-[rgba(255,80,100,0.3)]",
                                    avgMatchScore >= 60 && avgMatchScore < 80 && "dark:border-[rgba(255,179,71,0.3)]",
                                )}>
                                    <div className="w-16 h-1.5 bg-gray-200 dark:bg-[#333333] rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all",
                                                avgMatchScore >= 80
                                                    ? "bg-rose-400 dark:bg-[#FF6B8A]"
                                                    : avgMatchScore >= 60
                                                        ? "bg-amber-400 dark:bg-[#FFB347]"
                                                        : "bg-yellow-400 dark:bg-[#EFFF00]"
                                            )}
                                            style={{ width: `${avgMatchScore}%` }}
                                        />
                                    </div>
                                    <span className={cn(
                                        "font-bold text-sm",
                                        avgMatchScore >= 80 ? "text-rose-600 dark:text-[#FF6B8A]"
                                            : avgMatchScore >= 60 ? "text-amber-600 dark:text-[#FFB347]"
                                                : "text-yellow-600 dark:text-[#EFFF00]"
                                    )}>
                                        {avgMatchScore}%
                                    </span>
                                </div>

                                {/* Close */}
                                <button
                                    onClick={onClose}
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                        "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground-muted)]",
                                        "hover:text-[var(--foreground)]",
                                        "dark:bg-[#2A2A2A] dark:border-[#3F3F3F] dark:text-[#A1A1A1]",
                                        "dark:hover:border-[rgba(239,255,0,0.3)] dark:hover:text-[#EFFF00]"
                                    )}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Blacklist Warning — compact inline */}
                        {isCustomerBlacklisted && (
                            <div className={cn(
                                "flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-sm",
                                "bg-red-50 border border-red-200 text-red-700",
                                "dark:bg-[rgba(255,80,100,0.08)] dark:border-[rgba(255,80,100,0.3)] dark:text-[#FF8899]"
                            )}>
                                <ShieldX className="w-4 h-4 flex-shrink-0" />
                                <span className="font-semibold">{t("orders.duplicate.blacklistWarning")}</span>
                            </div>
                        )}

                        {/* Order Selector — compact chips inline */}
                        {duplicateOrders.length > 1 && (
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                <span className="text-xs text-[var(--foreground-subtle)]">{t("orders.duplicate.selectToCompare")}</span>
                                {duplicateOrders.map((order) => {
                                    const score = matchScores[order.id];
                                    const isSelected = selectedOrderIds.includes(order.id);
                                    return (
                                        <button
                                            key={order.id}
                                            onClick={() => toggleOrderSelection(order.id)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                                                isSelected
                                                    ? cn(
                                                        "bg-[var(--ink)] text-[var(--ink-contrast)] border-[var(--ink)]",
                                                        "dark:bg-[rgba(239,255,0,0.12)] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.4)]"
                                                    )
                                                    : cn(
                                                        "bg-[var(--card-bg)] text-[var(--foreground-muted)] border-[var(--card-border)]",
                                                        "dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
                                                        "hover:border-[var(--pastel-yellow)] dark:hover:border-[rgba(239,255,0,0.3)]"
                                                    )
                                            )}
                                        >
                                            <span>#{getBaseOrderId(order.order_id)}</span>
                                            <span className={cn(
                                                "px-1 py-0.5 rounded text-[9px] font-bold",
                                                score >= 80 ? "text-red-600 dark:text-[#FF8899]"
                                                    : score >= 60 ? "text-amber-600 dark:text-[#FFB347]"
                                                        : "text-yellow-600 dark:text-[#EFFF00]"
                                            )}>
                                                {score}%
                                            </span>
                                            {isSelected && <CheckCircle className="w-3 h-3" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ═══ Scrollable Content — Comparison Table + Actions ═══ */}
                    <div className="flex-1 overflow-y-auto">
                        {selectedOrders.length > 0 && (
                            <div className="flex flex-col">
                                {/* ─── Table Header ─── */}
                                <div
                                    className={cn(
                                        "grid gap-3 px-5 py-3 border-b sticky top-0 z-10",
                                        "bg-[var(--background-soft)] border-[var(--card-border)]",
                                        "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]"
                                    )}
                                    style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, 1fr)` }}
                                >
                                    <div className="text-xs font-bold text-[var(--foreground-muted)]">{t("orders.duplicate.field")}</div>
                                    {allDisplayOrders.map((order, idx) => (
                                        <div key={order.id} className="flex items-center justify-center gap-2">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border",
                                                idx === 0
                                                    ? cn(
                                                        "bg-[var(--pastel-yellow)]/30 text-amber-800 border-[var(--pastel-yellow)]/40",
                                                        "dark:bg-[rgba(239,255,0,0.1)] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.25)]"
                                                    )
                                                    : cn(
                                                        "bg-[var(--pastel-blue)]/20 text-blue-800 border-[var(--pastel-blue)]/30",
                                                        "dark:bg-[rgba(0,255,255,0.08)] dark:text-[#00FFFF] dark:border-[rgba(0,255,255,0.2)]"
                                                    )
                                            )}>
                                                {idx === 0 && <span className={cn(
                                                    "w-1.5 h-1.5 rounded-full animate-pulse",
                                                    "bg-amber-500 dark:bg-[#EFFF00]"
                                                )} />}
                                                {idx === 0 ? t("orders.duplicate.newOrder") : t("orders.duplicate.previousOrder")}
                                            </span>
                                            <button
                                                onClick={() => onViewOrder(order)}
                                                className={cn(
                                                    "w-5 h-5 rounded flex items-center justify-center transition-colors",
                                                    "bg-gray-200 hover:bg-gray-300 dark:bg-[#333333] dark:hover:bg-[#444444]"
                                                )}
                                                title={t("orders.duplicate.viewDetails")}
                                            >
                                                <Eye className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* ─── Comparison Rows ─── */}
                                <div className="px-5 py-2">
                                    {/* Custom Customer Details Row to support individual highlighting */}
                                    <div
                                        className="grid gap-3 py-2 border-b border-dashed border-[var(--card-border)] last:border-0"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, 1fr)` }}
                                    >
                                        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                                            <span className="text-[var(--foreground-subtle)] w-4 h-4 flex-shrink-0"><User className="w-3.5 h-3.5" /></span>
                                            {t("orders.duplicate.customerDetails")}
                                        </div>
                                        {allDisplayOrders.map((order) => {
                                            const isCurrent = order.id === currentOrder.id;

                                            // Compare order ID
                                            const currentOrderId = getBaseOrderId(currentOrder.order_id);
                                            const thisOrderId = getBaseOrderId(order.order_id);
                                            const orderIdMatch = duplicateOrders.every(o => getBaseOrderId(o.order_id) === currentOrderId);

                                            // Compare customer name
                                            const nameMatch = duplicateOrders.every(o => o.customer_name === currentOrder.customer_name);

                                            return (
                                                <div
                                                    key={order.id}
                                                    className="flex w-full items-stretch gap-1.5"
                                                >
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center font-mono text-[11px] px-2 py-1 flex-shrink-0 rounded-md transition-all border",
                                                        orderIdMatch
                                                            ? cn(
                                                                "bg-emerald-50/60 text-emerald-700 border-emerald-200/60",
                                                                "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                                            )
                                                            : cn(
                                                                "bg-amber-50/80 text-amber-700 border-amber-200/60",
                                                                "dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
                                                            )
                                                    )}>
                                                        #{thisOrderId}
                                                    </span>
                                                    <span className={cn(
                                                        "flex-1 flex items-center justify-center text-xs font-semibold px-2 py-1 rounded-md transition-all border min-w-0 truncate",
                                                        nameMatch
                                                            ? cn(
                                                                "bg-emerald-50/60 text-emerald-700 border-emerald-200/60",
                                                                "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                                            )
                                                            : cn(
                                                                "bg-amber-50/80 text-amber-700 border-amber-200/60",
                                                                "dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
                                                            )
                                                    )} title={order.customer_name}>
                                                        {order.customer_name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {compareField(t("orders.duplicate.date"), <Calendar className="w-3.5 h-3.5" />,
                                        (o) => formatDateEN(o.created_at))}
                                    {compareField(t("orders.duplicate.phone"), <Phone className="w-3.5 h-3.5" />,
                                        (o) => formatPhoneForDisplay(o.phone))}
                                    {compareField(t("orders.duplicate.city"), <Truck className="w-3.5 h-3.5" />,
                                        (o) => o.city || "—")}

                                    {/* Products */}
                                    <div
                                        className="grid gap-3 py-2.5 border-b border-dashed border-[var(--card-border)]"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, 1fr)` }}
                                    >
                                        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                                            <Package className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                                            {t("orders.duplicate.products")}
                                        </div>
                                        {allDisplayOrders.map((order) => {
                                            const currentOrderItems = currentOrder.items || [];
                                            const currentItemsMatch = (order.items || []).every(item =>
                                                currentOrderItems.some(cItem => cItem.name === item.name && cItem.quantity === item.quantity)
                                            ) && (order.items || []).length === currentOrderItems.length;

                                            return (
                                                <div key={order.id} className="space-y-1.5">
                                                    {order.items?.map((item, idx) => {
                                                        const matchingItemInCurrent = currentOrderItems.find(c => c.name === item.name);
                                                        const nameMatches = !!matchingItemInCurrent;
                                                        const qtyMatches = nameMatches && matchingItemInCurrent.quantity === item.quantity;
                                                        const isExactMatch = nameMatches && qtyMatches;

                                                        return (
                                                            <div key={idx} className={cn(
                                                                "flex items-center gap-2 rounded-lg p-1.5 border transition-all",
                                                                isExactMatch
                                                                    ? cn(
                                                                        "bg-emerald-50/40 border-emerald-100/50",
                                                                        "dark:bg-[rgba(0,255,100,0.03)] dark:border-[rgba(0,255,100,0.1)]"
                                                                    )
                                                                    : cn(
                                                                        "bg-amber-50/60 border-amber-200/50",
                                                                        "dark:bg-[rgba(255,179,71,0.05)] dark:border-[rgba(255,179,71,0.15)]"
                                                                    )
                                                            )}>
                                                                {item.image_url ? (
                                                                    <img loading="lazy" decoding="async" src={item.image_url} alt={item.name}
                                                                        className="w-8 h-8 rounded-md object-cover" />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-md bg-gray-200 dark:bg-[#333333] flex items-center justify-center flex-shrink-0">
                                                                        <Package className="w-3 h-3 text-gray-400 dark:text-[#6B6B6B]" />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={cn(
                                                                        "text-[11px] font-bold truncate",
                                                                        nameMatches
                                                                            ? "text-emerald-700 dark:text-[#66FFAA]"
                                                                            : "text-amber-700 dark:text-[#FFB347]"
                                                                    )}>
                                                                        {item.name}
                                                                    </p>
                                                                    <p className={cn(
                                                                        "text-[10px] font-bold",
                                                                        qtyMatches
                                                                            ? "text-emerald-600 dark:text-[#66FFAA]/80"
                                                                            : "text-amber-600 dark:text-[#FFB347]/80"
                                                                    )}>
                                                                        ×{item.quantity}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) || <span className="text-xs text-[var(--foreground-muted)]">—</span>}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Status row */}
                                    <div
                                        className="grid gap-3 py-2.5 border-b border-dashed border-[var(--card-border)]"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, 1fr)` }}
                                    >
                                        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                                            <Sparkles className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                                            {t("orders.duplicate.status")}
                                        </div>
                                        {allDisplayOrders.map((order) => (
                                            <div key={order.id} className="text-center">
                                                <span className={cn(
                                                    "inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border",
                                                    getStatusBadgeStyle(order.status)
                                                )}>
                                                    {t(statusKeyMap[order.status] || "orders.status.new") || order.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {compareField(t("orders.duplicate.amount"), <Clock className="w-3.5 h-3.5" />,
                                        (o) => formatIQD(Number(o.price)))}
                                </div>

                                {/* ─── Merge Preview (compact) ─── */}
                                {selectedOrders.length === 1 && mergedItemsPreview && (
                                    <div className={cn(
                                        "mx-5 mb-3 p-3 rounded-xl border",
                                        "bg-[var(--pastel-purple)]/8 border-[var(--pastel-purple)]/20",
                                        "dark:bg-[rgba(0,255,255,0.03)] dark:border-[rgba(0,255,255,0.12)]"
                                    )}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <GitMerge className="w-4 h-4 text-purple-600 dark:text-[#00FFFF]" />
                                            <span className="font-bold text-sm text-purple-800 dark:text-[#00FFFF]">{t("orders.duplicate.mergePreview")}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {mergedItemsPreview.items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-xs">
                                                    <span className="text-purple-700 dark:text-[var(--foreground-muted)]">{item.name} ×{item.quantity}</span>
                                                    <span className="font-mono text-purple-800 dark:text-[var(--foreground)]">{formatIQD(item.price * item.quantity)}</span>
                                                </div>
                                            ))}
                                            <div className="pt-1.5 mt-1.5 border-t border-purple-200/50 dark:border-[rgba(0,255,255,0.12)] flex items-center justify-between">
                                                <span className="font-bold text-xs text-purple-900 dark:text-[#00FFFF]">{t("orders.duplicate.totalAfterMerge")}</span>
                                                <span className="font-bold text-xs font-mono text-purple-900 dark:text-[#EFFF00]">{formatIQD(mergedItemsPreview.total)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ Action Bar — Premium glass strip ═══ */}
                        <div className={cn(
                            "sticky bottom-0 px-5 py-3 border-t",
                            "bg-[var(--background-soft)]/95 backdrop-blur-xl border-[var(--card-border)]",
                            "dark:bg-[#1A1A1A]/95 dark:border-[#3F3F3F]"
                        )}>
                            {/* Note input — inline compact */}
                            <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="w-4 h-4 text-[var(--foreground-subtle)] flex-shrink-0" />
                                <input
                                    type="text"
                                    value={actionNote}
                                    onChange={(e) => setActionNote(e.target.value)}
                                    placeholder={t("orders.duplicate.addNote")}
                                    className={cn(
                                        "flex-1 px-3 py-1.5 rounded-lg text-xs transition-all",
                                        "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)]",
                                        "placeholder:text-[var(--foreground-subtle)]",
                                        "focus:outline-none focus:ring-1",
                                        "focus:ring-[var(--pastel-yellow)]/50 focus:border-[var(--pastel-yellow)]",
                                        "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]",
                                        "dark:focus:ring-[rgba(0,255,255,0.2)] dark:focus:border-[rgba(0,255,255,0.4)]",
                                    )}
                                />
                            </div>

                            {/* Action buttons — horizontal pill strip */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Primary: Merge */}
                                <button
                                    onClick={handleMerge}
                                    disabled={isProcessing || selectedOrders.length !== 1 || !canMerge(currentOrder) || !canMerge(selectedOrders[0])}
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                                        "disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none",
                                        // Light
                                        "bg-[var(--ink)] text-[var(--ink-contrast)]",
                                        "hover:bg-[var(--ink-hover)] shadow-sm",
                                        // Dark: neon cyan primary
                                        "dark:bg-[rgba(0,255,255,0.1)] dark:text-[#00FFFF] dark:border dark:border-[rgba(0,255,255,0.25)]",
                                        "dark:hover:bg-[rgba(0,255,255,0.15)] dark:hover:border-[rgba(0,255,255,0.4)]",
                                        "dark:hover:shadow-[0_0_14px_rgba(0,255,255,0.12)]",
                                    )}
                                >
                                    <GitMerge className="w-4 h-4" />
                                    <span>{actionType === "merge" ? t("orders.duplicate.merging") : t("orders.duplicate.mergeOrders")}</span>
                                </button>

                                {/* Same Customer */}
                                <button
                                    onClick={handleMarkAsSameCustomer}
                                    disabled={isProcessing}
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                                        "disabled:opacity-35 disabled:cursor-not-allowed",
                                        "bg-emerald-500/10 text-emerald-700 border border-emerald-200",
                                        "hover:bg-emerald-500/20 hover:border-emerald-300",
                                        "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.2)]",
                                        "dark:hover:bg-[rgba(0,255,100,0.12)] dark:hover:border-[rgba(0,255,100,0.4)]",
                                        "dark:hover:shadow-[0_0_14px_rgba(0,255,100,0.1)]",
                                    )}
                                >
                                    <UserPlus className="w-4 h-4" />
                                    <span>{t("orders.duplicate.sameCustomer")}</span>
                                </button>

                                {/* Cancel New */}
                                <button
                                    onClick={handleCancelNew}
                                    disabled={isProcessing || !canCancel(currentOrder)}
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                                        "disabled:opacity-35 disabled:cursor-not-allowed",
                                        "bg-rose-500/10 text-rose-600 border border-rose-200",
                                        "hover:bg-rose-500/20 hover:border-rose-300",
                                        "dark:bg-[rgba(255,107,138,0.06)] dark:text-[#FF6B8A] dark:border-[rgba(255,107,138,0.2)]",
                                        "dark:hover:bg-[rgba(255,107,138,0.12)] dark:hover:border-[rgba(255,107,138,0.4)]",
                                        "dark:hover:shadow-[0_0_14px_rgba(255,107,138,0.1)]",
                                    )}
                                >
                                    <XCircle className="w-4 h-4" />
                                    <span>{actionType === "cancelNew" ? t("orders.duplicate.cancelling") : t("orders.duplicate.cancelNew")}</span>
                                </button>

                                {/* Cancel Old */}
                                <button
                                    onClick={handleCancelOld}
                                    disabled={isProcessing || selectedOrders.length !== 1 || !canCancel(selectedOrders[0])}
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                                        "disabled:opacity-35 disabled:cursor-not-allowed",
                                        "bg-gray-500/10 text-gray-600 border border-gray-200",
                                        "hover:bg-gray-500/15 hover:border-gray-300",
                                        "dark:bg-[rgba(255,255,255,0.04)] dark:text-[#A1A1A1] dark:border-[rgba(255,255,255,0.1)]",
                                        "dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:border-[rgba(255,255,255,0.2)]",
                                    )}
                                >
                                    <XCircle className="w-4 h-4" />
                                    <span>{actionType === "cancelOld" ? t("orders.duplicate.cancelling") : t("orders.duplicate.cancelOld")}</span>
                                </button>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Filter All Duplicates */}
                                {onFilterDuplicates && (
                                    <button
                                        onClick={() => { onFilterDuplicates(); onClose(); }}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
                                            "text-[var(--foreground-muted)] border border-[var(--card-border)]",
                                            "hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]",
                                            "dark:border-[#3F3F3F] dark:hover:border-[rgba(255,179,71,0.3)] dark:hover:text-[#FFB347]",
                                        )}
                                    >
                                        <Filter className="w-3.5 h-3.5" />
                                        <span>{t("orders.duplicate.showAll")}</span>
                                    </button>
                                )}

                                {/* Dismiss — Not Duplicate */}
                                <button
                                    onClick={handleDismiss}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border",
                                        "bg-[var(--card-bg)] border-[var(--pastel-yellow)] text-amber-700",
                                        "hover:bg-[var(--pastel-yellow-light)]",
                                        "dark:bg-[#1E1E1E] dark:border-[rgba(239,255,0,0.3)] dark:text-[#EFFF00]",
                                        "dark:hover:bg-[rgba(239,255,0,0.06)] dark:hover:border-[rgba(239,255,0,0.5)]",
                                        "dark:hover:shadow-[0_0_14px_rgba(239,255,0,0.08)]",
                                    )}
                                >
                                    <Ban className="w-4 h-4" />
                                    <span>{t("orders.duplicate.notDuplicate")}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
