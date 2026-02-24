"use client";

import { Order } from "@/lib/supabase";
import { CustomerNote } from "@/lib/customer-types";
import { formatDate, formatIQD } from "@/lib/utils";
import { ShoppingBag, FileText, CornerDownRight, CheckCircle2, RotateCcw, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

// Derive timeline items from orders and notes
type TimelineItemType = "order" | "note" | "status_change";

interface TimelineItem {
    id: string;
    type: TimelineItemType;
    date: string;
    data: any; // Order or CustomerNote
}

interface CustomerTimelineProps {
    orders: Order[];
    notes?: CustomerNote[];
}

export function CustomerTimeline({ orders, notes = [] }: CustomerTimelineProps) {
    const { t } = useLanguage();

    // 1. Unify and sort all events by date
    const timelineItems: TimelineItem[] = [
        ...orders.map(o => ({ id: o.id, type: "order" as const, date: o.created_at, data: o })),
        ...notes.map(n => ({ id: n.id, type: "note" as const, date: n.created_at, data: n }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (timelineItems.length === 0) {
        return (
            <div className="p-8 text-center border-2 border-dashed border-[var(--card-border)] rounded-2xl">
                <p className="text-muted">No history found for this customer.</p>
            </div>
        );
    }

    const getOrderStatusConfig = (status: string) => {
        switch (status) {
            case "delivered": return { color: "text-green-500", bg: "bg-green-500/10", icon: CheckCircle2 };
            case "returned": return { color: "text-amber-500", bg: "bg-amber-500/10", icon: RotateCcw };
            case "cancelled": return { color: "text-red-500", bg: "bg-red-500/10", icon: XCircle };
            case "rejected": return { color: "text-rose-500", bg: "bg-rose-500/10", icon: AlertCircle };
            default: return { color: "text-blue-500", bg: "bg-blue-500/10", icon: ShoppingBag };
        }
    };

    return (
        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[var(--card-border)] before:via-[var(--card-border)] before:to-transparent">
            {timelineItems.map((item, index) => {
                const isOrder = item.type === "order";
                const date = new Date(item.date);
                const isLast = index === timelineItems.length - 1;

                return (
                    <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        {/* Timeline Icon */}
                        <div className={cn(
                            "flex items-center justify-center w-11 h-11 rounded-full border-4 border-[var(--card-bg)] shrink-0 z-10 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm transition-transform duration-300 group-hover:scale-110",
                            isOrder
                                ? getOrderStatusConfig((item.data as Order).status).bg
                                : "bg-[var(--pastel-yellow)]"
                        )}>
                            {isOrder ? (
                                (() => {
                                    const StatusIcon = getOrderStatusConfig((item.data as Order).status).icon;
                                    return <StatusIcon className={cn("w-4 h-4", getOrderStatusConfig((item.data as Order).status).color)} />;
                                })()
                            ) : (
                                <FileText className="w-4 h-4 text-amber-700" />
                            )}
                        </div>

                        {/* Content Card */}
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] bg-[var(--background)] border border-[var(--card-border)] p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-muted uppercase tracking-wider">
                                    {formatDate(item.date)}
                                </span>
                                {isOrder && (
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                        getOrderStatusConfig((item.data as Order).status).bg,
                                        getOrderStatusConfig((item.data as Order).status).color
                                    )}>
                                        {(item.data as Order).status}
                                    </span>
                                )}
                            </div>

                            {isOrder ? (
                                <div>
                                    <p className="font-semibold text-foreground mb-1">
                                        Order #{(item.data as Order).order_id}
                                        {/* {(item.data as Order).sequence_number && `(Seq: ${(item.data as Order).sequence_number})`} */}
                                    </p>
                                    <p className="text-sm font-bold text-foreground">
                                        {formatIQD(Number((item.data as Order).price))}
                                    </p>

                                    {(item.data as Order).items && (item.data as Order).items.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-[var(--card-border)]/50 space-y-1">
                                            {(item.data as Order).items.slice(0, 2).map((prod: any, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-muted">
                                                    <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" />
                                                    <span className="truncate">{prod.quantity}x {prod.name}</span>
                                                </div>
                                            ))}
                                            {(item.data as Order).items.length > 2 && (
                                                <p className="text-xs text-[var(--foreground-subtle)] pl-5 italic">
                                                    + {(item.data as Order).items.length - 2} more items
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <p className="font-medium text-amber-900 leading-relaxed text-sm">
                                        {(item.data as CustomerNote).note}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* End point dot */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse">
                <div className="flex items-center justify-center w-11 h-11 shrink-0 z-10 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <div className="w-3 h-3 bg-[var(--card-border)] rounded-full ring-4 ring-[var(--card-bg)]" />
                </div>
            </div>
        </div>
    );
}
