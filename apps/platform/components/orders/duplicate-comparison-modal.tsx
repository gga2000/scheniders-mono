"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    GitMerge,
    ChevronDown,
    UserPlus,
    XCircle,
    Calendar,
    Phone,
    User,
    Package,
    AlertTriangle,
    Coins,
    Truck,
    ShieldX,
    MessageSquare,
    Ban,
    Sparkles,
    Eye,
    EyeOff,
    Diff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, formatDate, getBaseOrderId } from "@/lib/utils";
import { formatPhoneForDisplay, normalizePhoneForSearch } from "@/lib/order-utils";
import type { Order } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import {
    likelihoodTier,
    sortByScoreDesc,
    reassignMergeTarget,
    rowAllMatch,
} from "@/lib/duplicate-comparison";
import { LikelihoodMeter } from "./duplicate-comparison/likelihood-meter";
import { OrderTimeline } from "./duplicate-comparison/order-timeline";
import { ColumnHeaderControls } from "./duplicate-comparison/column-header-controls";

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

// Date-only English format: 2026/6/23
function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// Time-only: 9:10 PM
function formatTimeShort(dateStr: string): string {
    const d = new Date(dateStr);
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${mins} ${ampm}`;
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
    isBlacklisted,
    getCustomerOrders,
}: DuplicateComparisonModalProps) {
    const [displayedOrderIds, setDisplayedOrderIds] = useState<string[]>([]);
    const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
    const [diffOnly, setDiffOnly] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [actionType, setActionType] = useState<string | null>(null);
    const [actionNote, setActionNote] = useState("");
    const [confirmingCancel, setConfirmingCancel] = useState<null | "new" | "old">(null);
    const [showNote, setShowNote] = useState(false);
    const [showMergePreview, setShowMergePreview] = useState(false);
    const { t } = useLanguage();

    const matchScores = useMemo(() => {
        const scores: Record<string, number> = {};
        duplicateOrders.forEach((order) => {
            scores[order.id] = calculateMatchScore(currentOrder, order);
        });
        return scores;
    }, [currentOrder, duplicateOrders]);

    // Seed once per opened order: show ALL previous orders, target = highest score.
    // Keyed by currentOrder.id (via ref) so the user emptying the list with the
    // master "hide all" toggle is NOT re-filled by this effect, while reopening
    // the modal for a different order still re-seeds.
    const seededForOrderRef = useRef<string | null>(null);
    useEffect(() => {
        if (duplicateOrders.length > 0 && seededForOrderRef.current !== currentOrder.id) {
            seededForOrderRef.current = currentOrder.id;
            const allIds = duplicateOrders.map((o) => o.id);
            setDisplayedOrderIds(allIds);
            setMergeTargetId(reassignMergeTarget(allIds, null, matchScores));
        }
    }, [duplicateOrders, currentOrder.id, matchScores]);

    const displayedOrders = useMemo(
        () => sortByScoreDesc(
            duplicateOrders.filter((o) => displayedOrderIds.includes(o.id)),
            matchScores,
        ),
        [duplicateOrders, displayedOrderIds, matchScores],
    );

    const allDisplayOrders = useMemo(
        () => [currentOrder, ...displayedOrders],
        [currentOrder, displayedOrders],
    );

    const mergeTarget = useMemo(
        () => duplicateOrders.find((o) => o.id === mergeTargetId) ?? null,
        [duplicateOrders, mergeTargetId],
    );

    const toggleAllColumns = () => {
        if (displayedOrderIds.length > 0) {
            setDisplayedOrderIds([]);
            setMergeTargetId(null);
        } else {
            const allIds = duplicateOrders.map((o) => o.id);
            setDisplayedOrderIds(allIds);
            setMergeTargetId(reassignMergeTarget(allIds, null, matchScores));
        }
    };

    const toggleColumn = (orderId: string) => {
        const next = displayedOrderIds.includes(orderId)
            ? displayedOrderIds.filter((id) => id !== orderId)
            : [...displayedOrderIds, orderId];
        setDisplayedOrderIds(next);
        setMergeTargetId((prev) => reassignMergeTarget(next, prev, matchScores));
    };

    const isCustomerBlacklisted = isBlacklisted?.(currentOrder.phone) || false;

    const avgMatchScore = useMemo(() => {
        const scores = Object.values(matchScores);
        return scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0;
    }, [matchScores]);

    const customerOrders = useMemo(
        () => getCustomerOrders?.(currentOrder.phone) ?? [],
        [getCustomerOrders, currentOrder.phone],
    );
    // All customer orders + current + every comparison candidate (deduped),
    // so the timeline can re-add any order that was hidden.
    const timelineOrders = useMemo(() => {
        const map = new Map<string, Order>();
        [currentOrder, ...duplicateOrders, ...customerOrders].forEach((o) => map.set(o.id, o));
        return Array.from(map.values());
    }, [currentOrder, duplicateOrders, customerOrders]);

    const mergedItemsPreview = useMemo(() => {
        if (!mergeTarget) return null;
        const allItems: { name: string; quantity: number; price: number }[] = [];
        currentOrder.items?.forEach((item) => {
            const existing = allItems.find((i) => i.name === item.name);
            if (existing) existing.quantity += item.quantity;
            else allItems.push({ ...item });
        });
        mergeTarget.items?.forEach((item) => {
            const existing = allItems.find((i) => i.name === item.name);
            if (existing) existing.quantity += item.quantity;
            else allItems.push({ ...item });
        });
        return {
            items: allItems,
            total: allItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
        };
    }, [currentOrder, mergeTarget]);

    const canMerge = (order: Order) => !["delivered", "rejected", "completed", "cancelled"].includes(order.status);
    const canCancel = (order: Order) => !["delivered", "completed"].includes(order.status);

    const handleMerge = async () => {
        if (!mergeTarget) return;
        setIsProcessing(true);
        setActionType("merge");
        const result = await onMerge(currentOrder.id, mergeTarget.id, actionNote || undefined);
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
        if (!mergeTarget) return;
        setIsProcessing(true);
        setActionType("cancelOld");
        await onCancelOrder(mergeTarget.id, actionNote || undefined);
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
        const orderVals = displayedOrders.map(getVal);
        const allMatch = orderVals.length > 0 && orderVals.every(v => v === val1);

        return (
            <div className={cn(
                "grid gap-3 py-1.5 border-b last:border-0",
                "border-gray-200 dark:border-[#2A2A2A]",
            )} style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]">
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
                                    "bg-emerald-100 text-emerald-800 border border-emerald-300/70",
                                    "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                )
                                : cn(
                                    "bg-amber-100 text-amber-800 border border-amber-300/70",
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
                        "relative px-5 py-3 flex-shrink-0 border-b",
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
                                <h2 className="text-lg font-bold text-[var(--foreground)]">
                                    {t("orders.duplicate.title")}
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Likelihood meter */}
                                <LikelihoodMeter
                                    score={avgMatchScore}
                                    title=""
                                    tierLabel={t(
                                        likelihoodTier(avgMatchScore) === "high"
                                            ? "orders.duplicate.likelihoodHigh"
                                            : likelihoodTier(avgMatchScore) === "medium"
                                                ? "orders.duplicate.likelihoodMedium"
                                                : "orders.duplicate.likelihoodLow",
                                    )}
                                />

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
                    </div>
                    <OrderTimeline
                        orders={timelineOrders}
                        currentOrderId={currentOrder.id}
                        displayedIds={displayedOrderIds}
                        toggleableIds={duplicateOrders.map((o) => o.id)}
                        onToggle={toggleColumn}
                        rightSlot={
                            <button
                                type="button"
                                onClick={() => setDiffOnly((v) => !v)}
                                aria-pressed={diffOnly}
                                aria-label={t("orders.duplicate.diffOnly")}
                                title={t("orders.duplicate.diffOnly")}
                                className={cn(
                                    "inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all flex-shrink-0",
                                    diffOnly
                                        ? "bg-[var(--ink)] text-[var(--ink-contrast)] border-[var(--ink)]"
                                        : "text-[var(--foreground-muted)] border-[var(--card-border)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]",
                                )}
                            >
                                <Diff className="w-4 h-4" />
                            </button>
                        }
                        formatDate={formatDateShort}
                    />

                    {/* ═══ Scrollable Content — Comparison Table ═══ */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {displayedOrders.length === 0 ? (
                            <button
                                type="button"
                                onClick={toggleAllColumns}
                                className="w-full py-8 text-sm text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"
                            >
                                {t("orders.duplicate.noColumns")}
                            </button>
                        ) : (
                            <div className="flex flex-col">
                                <div className="overflow-x-auto">
                                <div className="min-w-max flex flex-col">
                                {/* ─── Table Header ─── */}
                                <div
                                    className={cn(
                                        "grid gap-3 px-5 py-3 border-b-2 sticky top-0 z-20",
                                        "bg-gray-50 border-gray-200",
                                        "dark:bg-[#1E1E1E] dark:border-[#2A2A2A]"
                                    )}
                                    style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}
                                >
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1E1E1E] dark:border-[#2A2A2A]">{t("orders.duplicate.field")}</div>
                                    {allDisplayOrders.map((order, idx) => (
                                        <div key={order.id} className="flex items-center justify-center gap-2 flex-wrap border-l border-gray-200 dark:border-[#2A2A2A]">
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
                                            <ColumnHeaderControls
                                                isNew={idx === 0}
                                                isMergeTarget={order.id === mergeTargetId}
                                                onPickTarget={() => setMergeTargetId(order.id)}
                                                onView={() => onViewOrder(order)}
                                                labels={{
                                                    base: t("orders.duplicate.base"),
                                                    merge: t("orders.duplicate.mergeTarget"),
                                                    view: t("orders.duplicate.viewDetails"),
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* ─── Comparison Rows ─── */}
                                <div className="px-5 py-2 bg-white dark:bg-[#181818]">
                                    {/* Custom Customer Details Row to support individual highlighting */}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => o.customer_name ?? "")) && (
                                    <div
                                        className="grid gap-3 py-1 border-b border-gray-200 dark:border-[#2A2A2A] last:border-0"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}
                                    >
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]">
                                            <span className="text-[var(--foreground-subtle)] w-4 h-4 flex-shrink-0"><User className="w-3.5 h-3.5" /></span>
                                            {t("orders.duplicate.customerDetails")}
                                        </div>
                                        {allDisplayOrders.map((order) => {
                                            // Compare order ID
                                            const currentOrderId = getBaseOrderId(currentOrder.order_id);
                                            const thisOrderId = getBaseOrderId(order.order_id);
                                            const orderIdMatch = displayedOrders.every(o => getBaseOrderId(o.order_id) === currentOrderId);

                                            // Compare customer name
                                            const nameMatch = displayedOrders.every(o => o.customer_name === currentOrder.customer_name);

                                            return (
                                                <div
                                                    key={order.id}
                                                    className="flex w-full items-stretch gap-1.5 border-l border-gray-100 dark:border-[#262626]"
                                                >
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center font-mono text-[11px] px-2 py-1 flex-shrink-0 rounded-md transition-all border",
                                                        orderIdMatch
                                                            ? cn(
                                                                "bg-emerald-100 text-emerald-800 border-emerald-300/70",
                                                                "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                                            )
                                                            : cn(
                                                                "bg-amber-100 text-amber-800 border-amber-300/70",
                                                                "dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
                                                            )
                                                    )}>
                                                        #{thisOrderId}
                                                    </span>
                                                    <span className={cn(
                                                        "flex-1 flex items-center justify-center text-xs font-semibold px-2 py-1 rounded-md transition-all border min-w-0 truncate",
                                                        nameMatch
                                                            ? cn(
                                                                "bg-emerald-100 text-emerald-800 border-emerald-300/70",
                                                                "dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
                                                            )
                                                            : cn(
                                                                "bg-amber-100 text-amber-800 border-amber-300/70",
                                                                "dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
                                                            )
                                                    )} title={order.customer_name}>
                                                        {order.customer_name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    )}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => o.created_at)) && (
                                    <div
                                        className="grid gap-3 py-1.5 border-b border-gray-200 dark:border-[#2A2A2A] last:border-0"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}
                                    >
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]">
                                            <span className="text-[var(--foreground-subtle)] w-4 h-4 flex-shrink-0"><Calendar className="w-3.5 h-3.5" /></span>
                                            {t("orders.duplicate.date")}
                                        </div>
                                        {allDisplayOrders.map((order) => (
                                            <div key={order.id} className="flex w-full items-stretch gap-1.5 border-l border-gray-100 dark:border-[#262626]">
                                                <span className="flex-1 flex items-center justify-center text-xs font-medium px-2 py-1 rounded-md border bg-amber-100 text-amber-800 border-amber-300/70 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]">
                                                    {formatDateShort(order.created_at)}
                                                </span>
                                                <span className="flex items-center justify-center text-xs font-medium px-2 py-1 flex-shrink-0 rounded-md border bg-amber-100 text-amber-800 border-amber-300/70 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]">
                                                    {formatTimeShort(order.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    )}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => normalizePhoneForSearch(o.phone))) &&
                                        compareField(t("orders.duplicate.phone"), <Phone className="w-3.5 h-3.5" />,
                                            (o) => formatPhoneForDisplay(o.phone))}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => o.city ?? "")) &&
                                        compareField(t("orders.duplicate.city"), <Truck className="w-3.5 h-3.5" />,
                                            (o) => o.city || "—")}

                                    {/* Products */}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => (o.items ?? []).map((i) => i.name + "x" + i.quantity).sort().join("|"))) && (
                                    <div
                                        className="grid gap-3 py-1.5 border-b border-gray-200 dark:border-[#2A2A2A]"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}
                                    >
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]">
                                            <Package className="w-3.5 h-3.5 text-[var(--foreground-subtle)] flex-shrink-0" />
                                            {t("orders.duplicate.products")}
                                        </div>
                                        {allDisplayOrders.map((order) => {
                                            const currentOrderItems = currentOrder.items || [];

                                            return (
                                                <div key={order.id} className="space-y-1 border-l border-gray-100 dark:border-[#262626] pl-1">
                                                    {order.items?.map((item, idx) => {
                                                        const matchingItemInCurrent = currentOrderItems.find(c => c.name === item.name);
                                                        const nameMatches = !!matchingItemInCurrent;
                                                        const qtyMatches = nameMatches && matchingItemInCurrent.quantity === item.quantity;
                                                        const isExactMatch = nameMatches && qtyMatches;

                                                        return (
                                                            <div key={idx} className={cn(
                                                                "flex items-center gap-2 rounded-lg p-1 border border-dashed transition-all",
                                                                isExactMatch
                                                                    ? cn(
                                                                        "bg-[#FAF8F5] border-emerald-300/60",
                                                                        "dark:bg-[rgba(0,255,100,0.03)] dark:border-[rgba(0,255,100,0.15)]"
                                                                    )
                                                                    : cn(
                                                                        "bg-[#FAF8F5] border-amber-300/60",
                                                                        "dark:bg-[rgba(255,179,71,0.05)] dark:border-[rgba(255,179,71,0.2)]"
                                                                    )
                                                            )}>
                                                                {item.image_url ? (
                                                                    <img loading="lazy" decoding="async" src={item.image_url} alt={item.name}
                                                                        className="w-7 h-7 rounded-md object-cover" />
                                                                ) : (
                                                                    <div className="w-7 h-7 rounded-md bg-gray-200 dark:bg-[#333333] flex items-center justify-center flex-shrink-0">
                                                                        <Package className="w-3 h-3 text-gray-400 dark:text-[#6B6B6B]" />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={cn(
                                                                        "text-[11px] font-bold truncate",
                                                                        nameMatches
                                                                            ? "text-emerald-800 dark:text-[#66FFAA]"
                                                                            : "text-amber-800 dark:text-[#FFB347]"
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
                                    )}

                                    {/* Status row */}
                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => o.status)) && (
                                    <div
                                        className="grid gap-3 py-2.5 border-b border-gray-200 dark:border-[#2A2A2A]"
                                        style={{ gridTemplateColumns: `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))` }}
                                    >
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#6B6B6B] sticky left-0 z-10 bg-gray-50 border-r border-gray-200 pr-2 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]">
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
                                    )}

                                    {(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => Number(o.price))) &&
                                        compareField(t("orders.duplicate.amount"), <Coins className="w-3.5 h-3.5" />,
                                            (o) => formatIQD(Number(o.price)))}
                                </div>

                                {/* ─── Merge Preview (compact) ─── */}
                                {mergeTarget && mergedItemsPreview && (
                                    <div className={cn(
                                        "mx-5 mb-3 p-3 rounded-xl border",
                                        "bg-[var(--pastel-purple)]/8 border-[var(--pastel-purple)]/20",
                                        "dark:bg-[rgba(0,255,255,0.03)] dark:border-[rgba(0,255,255,0.12)]"
                                    )}>
                                        <button
                                            type="button"
                                            onClick={() => setShowMergePreview((v) => !v)}
                                            className="w-full flex items-center gap-2"
                                        >
                                            <GitMerge className="w-4 h-4 text-purple-600 dark:text-[#00FFFF]" />
                                            <span className="font-bold text-sm text-purple-800 dark:text-[#00FFFF]">{t("orders.duplicate.mergePreview")}</span>
                                            <span className="ml-auto font-bold text-xs font-mono text-purple-900 dark:text-[#EFFF00]">{formatIQD(mergedItemsPreview.total)}</span>
                                            <ChevronDown className={cn("w-4 h-4 text-purple-600 dark:text-[#00FFFF] transition-transform", showMergePreview && "rotate-180")} />
                                        </button>
                                        {showMergePreview && (
                                            <div className="space-y-1 mt-2">
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
                                        )}
                                    </div>
                                )}
                                </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═══ Action Bar — Premium glass footer ═══ */}
                    <div className={cn(
                        "flex-shrink-0 px-5 py-3 border-t",
                        "bg-[var(--background-soft)] border-[var(--card-border)]",
                        "dark:bg-[#1A1A1A] dark:border-[#3F3F3F]"
                    )}>
                            {/* Note input — shown above actions only when expanded */}
                            {showNote && (
                                <div className="flex items-center gap-2 mb-3">
                                    <MessageSquare className="w-4 h-4 text-[var(--foreground-subtle)] flex-shrink-0" />
                                    <input
                                        type="text"
                                        value={actionNote}
                                        onChange={(e) => setActionNote(e.target.value)}
                                        placeholder={t("orders.duplicate.addNote")}
                                        autoFocus
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
                                    <button
                                        type="button"
                                        onClick={() => setShowNote(false)}
                                        className="text-[var(--foreground-subtle)] hover:text-[var(--foreground)] flex-shrink-0"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Action buttons — grouped pill strip */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Primary group: Merge + Same Customer */}
                                <div className="flex gap-2 p-1 rounded-2xl bg-[var(--pastel-yellow)]/10 border border-dashed border-[var(--pastel-yellow)]/40">
                                    {/* Primary: Merge */}
                                    <button
                                        onClick={handleMerge}
                                        disabled={isProcessing || !mergeTarget || !canMerge(currentOrder) || !canMerge(mergeTarget)}
                                        title={!mergeTarget ? t("orders.duplicate.pickMergeTarget") : undefined}
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
                                </div>

                                {/* Destructive group with inline confirm */}
                                <div className="flex gap-2 p-1 rounded-2xl bg-rose-500/5 border border-dashed border-rose-200 dark:border-[rgba(255,107,138,0.2)]">
                                    {/* Cancel New */}
                                    {confirmingCancel === "new" ? (
                                        <InlineConfirm
                                            label={t("orders.duplicate.confirmCancel")}
                                            yes={t("orders.duplicate.confirmYes")}
                                            no={t("orders.duplicate.confirmNo")}
                                            onYes={() => { setConfirmingCancel(null); handleCancelNew(); }}
                                            onNo={() => setConfirmingCancel(null)}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setConfirmingCancel("new")}
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
                                    )}

                                    {/* Cancel Old */}
                                    {confirmingCancel === "old" ? (
                                        <InlineConfirm
                                            label={t("orders.duplicate.confirmCancel")}
                                            yes={t("orders.duplicate.confirmYes")}
                                            no={t("orders.duplicate.confirmNo")}
                                            onYes={() => { setConfirmingCancel(null); handleCancelOld(); }}
                                            onNo={() => setConfirmingCancel(null)}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setConfirmingCancel("old")}
                                            disabled={isProcessing || !mergeTarget || !canCancel(mergeTarget)}
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
                                    )}
                                </div>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Add note toggle */}
                                {!showNote && (
                                    <button
                                        type="button"
                                        onClick={() => setShowNote(true)}
                                        aria-label={t("orders.duplicate.addNoteShort")}
                                        title={actionNote || t("orders.duplicate.addNoteShort")}
                                        className={cn(
                                            "relative inline-flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                                            "text-[var(--foreground-muted)] border border-[var(--card-border)]",
                                            "hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]",
                                        )}
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        {actionNote && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" />}
                                    </button>
                                )}

                                {/* Show / hide all comparison columns */}
                                {duplicateOrders.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={toggleAllColumns}
                                        aria-label={displayedOrderIds.length > 0 ? t("orders.duplicate.toggleColumns") : t("orders.duplicate.showColumns")}
                                        title={displayedOrderIds.length > 0 ? t("orders.duplicate.toggleColumns") : t("orders.duplicate.showColumns")}
                                        className={cn(
                                            "inline-flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                                            "text-[var(--foreground-muted)] border border-[var(--card-border)]",
                                            "hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]",
                                            "dark:border-[#3F3F3F] dark:hover:text-[#FFB347]",
                                        )}
                                    >
                                        {displayedOrderIds.length > 0 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function InlineConfirm({
    label,
    yes,
    no,
    onYes,
    onNo,
}: {
    label: string;
    yes: string;
    no: string;
    onYes: () => void;
    onNo: () => void;
}) {
    return (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-50 border border-rose-200 dark:bg-[rgba(255,107,138,0.08)] dark:border-[rgba(255,107,138,0.3)]">
            <span className="text-xs font-semibold text-rose-700 dark:text-[#FF8899]">{label}</span>
            <button type="button" onClick={onYes} className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700">{yes}</button>
            <button type="button" onClick={onNo} className="text-xs px-2 py-1 rounded-lg text-rose-700 dark:text-[#FF8899] hover:bg-rose-100 dark:hover:bg-[rgba(255,107,138,0.12)]">{no}</button>
        </div>
    );
}
