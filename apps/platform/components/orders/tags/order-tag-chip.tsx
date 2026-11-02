import { cn } from "@/lib/utils";
import { ORDER_TAG_TONE, type OrderTag } from "@/lib/orders/order-tags";

/** One named tag, in its colour. */
export function OrderTagChip({ tag, className }: { tag: OrderTag; className?: string }) {
    return (
        <span
            data-tag-id={tag.id}
            title={tag.name}
            className={cn(
                "inline-flex h-6 max-w-[9rem] items-center px-2 rounded-full border text-[11px] font-bold",
                ORDER_TAG_TONE[tag.color],
                className,
            )}
        >
            <span className="truncate">{tag.name}</span>
        </span>
    );
}
