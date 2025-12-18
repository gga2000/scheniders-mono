"use client";

import { cn } from "@/lib/utils";
import type { OrderStatusHistory, OrderNote } from "@/lib/supabase";
import {
    Circle,
    CircleDot,
    Clock,
    MessageSquare,
    User,
    CheckCircle,
    PhoneCall,
    Truck,
    XCircle,
    Package,
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
}

interface OrderTimelineProps {
    statusHistory: OrderStatusHistory[];
    notes?: OrderNote[];
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; label: string }> = {
    new: { icon: Package, color: "text-orange-500", label: "New Order" },
    contacted: { icon: PhoneCall, color: "text-yellow-600", label: "Contacted" },
    confirmed: { icon: CheckCircle, color: "text-green-500", label: "Confirmed" },
    delivered: { icon: Truck, color: "text-teal-500", label: "Delivered" },
    rejected: { icon: XCircle, color: "text-rose-500", label: "Rejected" },
};

export function OrderTimeline({ statusHistory, notes = [] }: OrderTimelineProps) {
    // Combine and sort timeline entries
    const entries: TimelineEntry[] = [
        ...statusHistory.map((h) => ({
            id: h.id,
            type: "status" as const,
            timestamp: h.changed_at,
            content: `Status changed from ${h.from_status || "none"} to ${h.to_status}`,
            from_status: h.from_status || undefined,
            to_status: h.to_status,
            actor: h.changed_by || undefined,
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
            <div className="text-center py-8">
                <Clock className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-foreground font-medium">No activity yet</p>
                <p className="text-sm text-muted">Status changes and notes will appear here</p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {entries.map((entry, index) => {
                const isLast = index === entries.length - 1;
                const StatusIcon = entry.to_status ? statusConfig[entry.to_status]?.icon || Circle : MessageSquare;
                const statusColor = entry.to_status ? statusConfig[entry.to_status]?.color || "text-gray-400" : "text-blue-500";

                return (
                    <div key={entry.id} className="flex gap-3">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center",
                                entry.type === "status" ? "bg-gray-100" : "bg-blue-50"
                            )}>
                                {entry.type === "status" ? (
                                    <StatusIcon className={cn("w-4 h-4", statusColor)} />
                                ) : (
                                    <MessageSquare className="w-4 h-4 text-blue-500" />
                                )}
                            </div>
                            {!isLast && (
                                <div className="w-0.5 h-full min-h-[40px] bg-gray-200" />
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-6">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    {entry.type === "status" ? (
                                        <p className="text-sm font-medium text-foreground">
                                            {entry.to_status && (
                                                <span className={cn("font-semibold", statusColor)}>
                                                    {statusConfig[entry.to_status]?.label || entry.to_status}
                                                </span>
                                            )}
                                            {entry.from_status && (
                                                <span className="text-muted font-normal">
                                                    {" "}← {statusConfig[entry.from_status]?.label || entry.from_status}
                                                </span>
                                            )}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-foreground">{entry.content}</p>
                                    )}

                                    {entry.actor && (
                                        <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                                            <User className="w-3 h-3" />
                                            {entry.actor}
                                        </p>
                                    )}
                                </div>

                                <p className="text-xs text-muted whitespace-nowrap">
                                    {new Date(entry.timestamp).toLocaleString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
