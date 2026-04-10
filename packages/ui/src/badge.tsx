import { type VariantProps, cva } from "class-variance-authority";
import { HTMLAttributes } from "react";
import { cn } from "@scheniders/shared";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold transition-all duration-200 focus:outline-none",
    {
        variants: {
            variant: {
                new: "bg-[var(--pastel-yellow)] text-amber-900 border-amber-300",
                contacted: "bg-[var(--pastel-mint)] text-teal-900 border-teal-300",
                confirmed: "bg-[var(--pastel-green)] text-green-900 border-green-300",
                rejected: "bg-[var(--pastel-pink)] text-rose-900 border-rose-300",
                delivered: "bg-[var(--pastel-purple)] text-purple-900 border-purple-300",
                default: "bg-gray-100 text-gray-700 border-gray-200",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export interface BadgeProps
    extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
