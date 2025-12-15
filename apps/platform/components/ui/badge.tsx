import { type VariantProps, cva } from "class-variance-authority";
import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 hover:scale-110 backdrop-blur-sm",
    {
        variants: {
            variant: {
                new: "bg-blue-500/20 text-blue-300 border-blue-400/50 shadow-sm shadow-blue-500/20",
                contacted: "bg-yellow-500/20 text-yellow-300 border-yellow-400/50 shadow-sm shadow-yellow-500/20",
                confirmed: "bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-sm shadow-emerald-500/20",
                rejected: "bg-pink-500/20 text-pink-300 border-pink-400/50 shadow-sm shadow-pink-500/20",
                delivered: "bg-purple-500/20 text-purple-300 border-purple-400/50 shadow-sm shadow-purple-500/20",
                default: "bg-zinc-800/50 text-zinc-300 border-zinc-700/50",
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
