"use client";

import { AlertCircle, CheckCircle2, Pencil, Star, User as UserIcon, XCircle } from "lucide-react";
import { trustEventTone } from "@/lib/customer-reliability";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    order_delivered: CheckCircle2,
    order_rejected: XCircle,
    order_cancelled: AlertCircle,
    order_no_response: AlertCircle,
    order_refund: XCircle,
    community_rating: Star,
    admin_override: Pencil,
    rejection_edit: Pencil,
};

/**
 * The icon of a trust-score event, for the Trust factors card's "Recent events"
 * and the score-breakdown modal's list of the same events. An order outcome
 * wears its order-status pill colour (trustEventTone), so "No response" is the
 * same colour on the event, the flag and the order pill.
 */
export function TrustEventIcon({ eventType }: { eventType: string }) {
    const Icon = EVENT_ICONS[eventType] ?? UserIcon;
    return (
        <span className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", trustEventTone(eventType))} aria-hidden>
            <Icon className="w-3.5 h-3.5" />
        </span>
    );
}
