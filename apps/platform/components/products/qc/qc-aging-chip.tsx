"use client";

import { cn } from "@/lib/utils";
import { Clock, AlertTriangle } from "lucide-react";
import { getAgingBucket } from "./qc-constants";

export function QCAgingChip({ createdAt, compact = false }: { createdAt: string; compact?: boolean }) {
    const { days, label, color, urgency } = getAgingBucket(createdAt);
    const Icon = urgency === "critical" || urgency === "high" ? AlertTriangle : Clock;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md border font-semibold",
                color,
                compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
            )}
            title={`${days} days in quarantine`}
        >
            <Icon className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            {label}
        </span>
    );
}
