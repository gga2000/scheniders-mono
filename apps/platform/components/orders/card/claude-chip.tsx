"use client";

import Image from "next/image";
import type { Order } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * A "Claude" chip: the order was made through the merchant MCP connector
 * (`created_via`, set by the server). It sits beside the source chip, which
 * still says where the customer came from.
 */
export function ClaudeChip({ createdVia, iconOnly = false, className }: {
    createdVia: Order["created_via"];
    iconOnly?: boolean;
    className?: string;
}) {
    if (createdVia !== "claude") return null;
    return (
        <span
            title="Claude"
            className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-[#F5E6DC] text-[11px] font-semibold text-[#8A3F22]",
                iconOnly ? "w-6 justify-center" : "px-2",
                className,
            )}
        >
            <Image src="/assets/claude-logo.png" alt="" width={14} height={14} unoptimized className="h-3.5 w-3.5" aria-hidden="true" />
            {iconOnly ? <span className="sr-only">Claude</span> : "Claude"}
        </span>
    );
}
