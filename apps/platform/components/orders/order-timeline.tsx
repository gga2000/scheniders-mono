"use client";

import { cn } from "@/lib/utils";
import type { OrderStatusHistory, OrderNote } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
    Circle,
    Clock,
    MessageSquare,
    User,
    CheckCircle,
    PhoneCall,
    Truck,
    XCircle,
    Package,
    Sparkles,
    History,
    Edit2,
} from "lucide-react";

interface TimelineEntry {
    id: string;
    type: "status" | "note";
    timestamp: string;
    content: string;
    actor?: string;
    status?: string;
    from_status?: string;
    to_status?: string;
    is_detail_update?: boolean;
}

interface OrderTimelineProps {
    statusHistory: OrderStatusHistory[];
    notes?: OrderNote[];
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; bgColor: string; label: string; labelAr: string }> = {
    new: { icon: Package, color: "text-orange-600", bgColor: "bg-orange-100", label: "New Order", labelAr: "طلب جديد" },
    contacted: { icon: PhoneCall, color: "text-amber-600", bgColor: "bg-amber-100", label: "Contacted", labelAr: "تم التواصل" },
    confirmed: { icon: CheckCircle, color: "text-emerald-600", bgColor: "bg-emerald-100", label: "Confirmed", labelAr: "مؤكد" },
    cancelled: { icon: XCircle, color: "text-gray-500", bgColor: "bg-gray-100", label: "Cancelled", labelAr: "ملغي" },
    in_transit: { icon: Truck, color: "text-blue-600", bgColor: "bg-blue-100", label: "In Transit", labelAr: "قيد التوصيل" },
    delivered: { icon: Truck, color: "text-teal-600", bgColor: "bg-teal-100", label: "Delivered", labelAr: "تم التوصيل" },
    rejected: { icon: XCircle, color: "text-rose-600", bgColor: "bg-rose-100", label: "Rejected", labelAr: "مرفوض" },
    completed: { icon: CheckCircle, color: "text-emerald-700", bgColor: "bg-emerald-200", label: "Completed", labelAr: "طلب تام" },
    no_response: { icon: PhoneCall, color: "text-slate-500", bgColor: "bg-slate-100", label: "No Response", labelAr: "لم يرد" },
};

// Get relative time string
function getRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function OrderTimeline({ statusHistory, notes = [] }: OrderTimelineProps) {
    // Combine and sort timeline entries
    const entries: TimelineEntry[] = [
        ...statusHistory.map((h) => ({
            id: h.id,
            type: "status" as const,
            timestamp: h.changed_at,
            content: h.from_status === h.to_status && h.notes
                ? h.notes
                : `Status changed from ${h.from_status || "none"} to ${h.to_status}`,
            from_status: h.from_status || undefined,
            to_status: h.to_status,
            actor: h.changed_by || undefined,
            is_detail_update: h.from_status === h.to_status
        })),
        ...notes.map((n) => ({
            id: n.id,
            type: "note" as const,
            timestamp: n.created_at,
            content: n.note,
            actor: n.created_by || undefined,
        })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (entries.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
            >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <History className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-foreground font-semibold text-lg">No activity yet</p>
                <p className="text-sm text-muted mt-1">Status changes and notes will appear here</p>
            </motion.div>
        );
    }

    return (
        <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gradient-to-b from-gray-200 via-gray-100 to-transparent" />

            <AnimatePresence mode="popLayout">
                {entries.map((entry, index) => {
                    const isFirst = index === 0;
                    const StatusIcon = entry.is_detail_update
                        ? Edit2
                        : entry.to_status
                            ? statusConfig[entry.to_status]?.icon || Circle
                            : MessageSquare;
                    const statusColor = entry.is_detail_update
                        ? "text-blue-600"
                        : entry.to_status
                            ? statusConfig[entry.to_status]?.color || "text-gray-400"
                            : "text-blue-500";
                    const statusBg = entry.is_detail_update
                        ? "bg-blue-100/50"
                        : entry.to_status
                            ? statusConfig[entry.to_status]?.bgColor || "bg-gray-100"
                            : "bg-blue-50";

                    return (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: index * 0.05, duration: 0.3 }}
                            className="relative flex gap-4 pb-5"
                        >
                            {/* Icon Circle */}
                            <motion.div
                                initial={isFirst ? { scale: 0 } : { scale: 1 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 15, delay: index * 0.05 }}
                                className={cn(
                                    "relative z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-sm",
                                    entry.type === "status" ? statusBg : "bg-blue-50 border border-blue-100"
                                )}
                            >
                                {entry.type === "status" ? (
                                    <StatusIcon className={cn("w-4 h-4", statusColor)} />
                                ) : (
                                    <MessageSquare className="w-4 h-4 text-blue-500" />
                                )}

                                {/* Pulse effect for first (newest) entry */}
                                {isFirst && (
                                    <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-current"
                                        style={{ animationIterationCount: 3 }} />
                                )}
                            </motion.div>

                            {/* Content Card */}
                            <motion.div
                                whileHover={{ scale: 1.01 }}
                                className={cn(
                                    "flex-1 rounded-xl p-3 transition-all",
                                    entry.type === "status"
                                        ? "bg-gradient-to-r from-gray-50 to-white border border-gray-100"
                                        : "bg-gradient-to-r from-blue-50 to-white border border-blue-100"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        {entry.type === "status" ? (
                                            <>
                                                <div className="flex items-center flex-wrap gap-2">
                                                    {entry.is_detail_update ? (
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100"
                                                        )}>
                                                            <Edit2 className="w-3 h-3" />
                                                            تعديل تفاصيل الطلب
                                                        </span>
                                                    ) : entry.to_status && (
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                                                            statusBg, statusColor
                                                        )}>
                                                            <Sparkles className="w-3 h-3" />
                                                            {statusConfig[entry.to_status]?.labelAr || entry.to_status}
                                                        </span>
                                                    )}
                                                    {!entry.is_detail_update && entry.from_status && (
                                                        <span className="text-xs text-muted">
                                                            ← من {statusConfig[entry.from_status]?.labelAr || entry.from_status}
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.is_detail_update && entry.content && (
                                                    <p className="text-[13px] text-foreground/80 mt-1.5 leading-relaxed bg-white/50 p-2 rounded-lg border border-blue-50/50 font-medium">
                                                        {entry.content}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-sm text-foreground leading-relaxed">{entry.content}</p>
                                        )}

                                        {/* Meta row */}
                                        <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {getRelativeTime(entry.timestamp)}
                                            </span>
                                            {entry.actor && (
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {entry.actor}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Exact time tooltip on hover */}
                                    <span
                                        className="text-[10px] text-muted/60 whitespace-nowrap hidden group-hover:block"
                                        title={new Date(entry.timestamp).toLocaleString()}
                                    >
                                        {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                                            hour: "numeric",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

