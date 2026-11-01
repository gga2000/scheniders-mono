import { Archive, Trash2 } from "lucide-react";
import { orderSearchPlacement } from "@/lib/order-server-search";
import { cn } from "@/lib/utils";

/**
 * "Archived" / "In trash" marker for an order that is not in the live list.
 *
 * Search returns merged (archived) and trashed orders alongside live ones, and
 * nothing else on a card says an order is not live — the archived dimming is
 * easy to miss and a trashed order had no visual state at all. Renders nothing
 * for a live order.
 */
export function OrderPlacementBadge({
    order,
    className,
}: {
    order: { is_archived?: boolean | null; deleted_at?: string | null };
    className?: string;
}) {
    const placement = orderSearchPlacement(order);
    if (placement === "active") return null;
    const trashed = placement === "trashed";
    const Icon = trashed ? Trash2 : Archive;
    return (
        <span
            data-placement={placement}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide",
                trashed
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300",
                className,
            )}
        >
            <Icon className="w-2.5 h-2.5" aria-hidden />
            {trashed ? "In trash" : "Archived"}
        </span>
    );
}
