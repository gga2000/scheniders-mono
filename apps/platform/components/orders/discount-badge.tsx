import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Tag } from "lucide-react";

interface DiscountBadgeProps {
    price: number;
    discountAmount: number;
    className?: string;
}

export function DiscountBadge({ price, discountAmount, className }: DiscountBadgeProps) {
    if (!discountAmount || discountAmount <= 0) return null;

    // Calculate original price (current price + discount)
    const originalPrice = Math.abs(price) + discountAmount;

    // Calculate percentage
    const percentage = Math.round((discountAmount / originalPrice) * 100);

    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200",
            className
        )}>
            <Tag className="w-3 h-3" />
            <span>-{formatIQD(discountAmount)}</span>
            <span className="opacity-75">({percentage}%)</span>
        </span>
    );
}
