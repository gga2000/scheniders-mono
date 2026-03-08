import React from "react";
import { Package, Trash2, Edit2, RotateCcw } from "lucide-react";

export interface ParsedActivity {
    title: string;
    description?: string;
    variant?: "default" | "success" | "error" | "warning";
    icon?: React.ReactNode;
}

export function parseActivityLog(log: any): ParsedActivity | null {
    if (!log || !log.action) return null;

    const actorName = log.user_email?.split('@')[0] || "Team Member";

    // Seeded avatar gradient based on string length to give uniqueness
    const hue = (actorName.length * 35) % 360;

    // Generates a beautiful initial-based avatar 
    const AvatarIcon = () => (
        <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md border border-white/20 shrink-0"
            style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue}, 80%, 65%), hsl(${hue + 40}, 80%, 55%))` }}
        >
            {actorName.charAt(0).toUpperCase()}
        </div>
    );

    switch (log.action) {
        case "order.create":
            return {
                title: `${actorName} added a new order.`,
                description: `Order ${log.details?.order_id || ""} was created.`,
                variant: "success",
                icon: <AvatarIcon />
            };

        case "order.delete":
            return {
                title: `${actorName} deleted orders.`,
                description: log.details?.count
                    ? `Removed ${log.details.count} orders from the system.`
                    : "An order was permanently deleted.",
                variant: "error",
                icon: <AvatarIcon />
            };

        case "order.archive":
            return {
                title: `${actorName} archived orders.`,
                description: `Safely archived ${log.details?.count || "some"} orders.`,
                variant: "default",
                icon: <AvatarIcon />
            };

        case "order.status_update":
            return {
                title: `${actorName} updated an order status.`,
                description: `Order ${log.details?.order_id || ""} is now ${log.details?.to_status || "updated"}.`,
                variant: "default",
                icon: <AvatarIcon />
            };

        case "order.split":
            return {
                title: `${actorName} processed a return.`,
                description: `Split items from order ${log.details?.original_order_id || ""}.`,
                variant: "warning",
                icon: <AvatarIcon />
            };

        // Add more specific action parsers as needed here
        default:
            return {
                title: `${actorName} performed an action.`,
                description: log.action,
                variant: "default",
                icon: <AvatarIcon />
            };
    }
}
