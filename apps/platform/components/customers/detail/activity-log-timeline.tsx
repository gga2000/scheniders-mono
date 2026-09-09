"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Package, StickyNote } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useStatusLabel } from "@/hooks/use-status-label";

interface OrderLike {
    id: string;
    order_id: string;
    created_at: string;
    status: string;
}

interface NoteLike {
    id: string;
    note: string;
    created_at: string;
}

/**
 * Unified, chronological activity feed for a customer — interleaves order
 * events with notes. Complements the existing IdentityTimeline (which only
 * shows identity changes) and Order History table (full tabular view).
 *
 * Renders nothing if both lists are empty.
 */
export function ActivityLogTimeline({
    orders,
    notes,
}: {
    orders: OrderLike[];
    notes: NoteLike[];
}) {
    const orderStatusLabel = useStatusLabel();
    const events = useMemo(() => {
        const items: { key: string; date: Date; type: "order" | "note"; label: string; sub?: string; pastel: string; dotClass: string }[] = [];

        for (const o of orders) {
            items.push({
                key: `o-${o.id}`,
                date: new Date(o.created_at),
                type: "order",
                label: `طلب #${o.order_id}`,
                sub: orderStatusLabel(o.status),
                pastel: "bg-(--pastel-blue)/40",
                dotClass: "bg-(--pastel-blue)",
            });
        }

        for (const n of notes) {
            items.push({
                key: `n-${n.id}`,
                date: new Date(n.created_at),
                type: "note",
                label: "ملاحظة مضافة",
                sub: (n.note || "").slice(0, 60) + ((n.note || "").length > 60 ? "..." : ""),
                pastel: "bg-(--pastel-yellow)/40",
                dotClass: "bg-(--pastel-yellow)",
            });
        }

        return items.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [orders, notes, orderStatusLabel]);

    return (
        <div className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2.5 mb-6">
                <Activity className="w-5 h-5 text-emerald-500 shrink-0" />
                <h3 className="font-headline font-extrabold text-lg leading-none">Activity</h3>
            </div>

            {events.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Activity className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">لا توجد أنشطة بعد</p>
                </div>
            ) : (
                <div className="relative space-y-0" dir="rtl">
                    {/* Timeline line */}
                    <div className="absolute right-[19px] top-3 bottom-3 w-px bg-(--card-border)" />

                    {events.map((ev, i) => (
                        <motion.div
                            key={ev.key}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.6) }}
                            className="relative flex items-start gap-3 pb-4 pr-10"
                        >
                            <div
                                className={cn(
                                    "absolute right-3 mt-1 h-3.5 w-3.5 rounded-full border-2 border-(--card-bg) flex items-center justify-center",
                                    ev.dotClass,
                                )}
                            >
                                {ev.type === "order" ? (
                                    <Package className="h-2 w-2 text-zinc-700" />
                                ) : (
                                    <StickyNote className="h-2 w-2 text-zinc-700" />
                                )}
                            </div>

                            <div className="flex-1 pastel-card px-3 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-semibold text-foreground">{ev.label}</p>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {formatDistanceToNow(ev.date, { addSuffix: true, locale: ar })}
                                    </span>
                                </div>
                                {ev.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{ev.sub}</p>}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
