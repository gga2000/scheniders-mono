"use client";

import { cn } from "@/lib/utils";

interface StockFillBarProps {
    stock: number;
    reorderPoint?: number | null;
    lowStockThreshold?: number | null;
    className?: string;
}

type Status = "out" | "critical" | "low" | "healthy" | "overstock";

function statusFor({
    stock,
    reorderPoint,
    lowStockThreshold,
}: {
    stock: number;
    reorderPoint: number;
    lowStockThreshold: number;
}): Status {
    if (stock <= 0) return "out";
    if (stock <= lowStockThreshold) return "critical";
    if (stock <= reorderPoint) return "low";
    // Overstock heuristic: 10× reorder point or 4× threshold, whichever is defined.
    const overCap = reorderPoint > 0 ? reorderPoint * 10 : lowStockThreshold * 10;
    if (overCap > 0 && stock > overCap) return "overstock";
    return "healthy";
}

const STATUS_STYLES: Record<Status, { fill: string; glow: string }> = {
    out: {
        fill: "from-slate-400 to-slate-300",
        glow: "shadow-[0_0_12px_rgba(100,116,139,0.25)]",
    },
    critical: {
        fill: "from-rose-500 to-rose-400",
        glow: "shadow-[0_0_12px_rgba(244,63,94,0.35)]",
    },
    low: {
        fill: "from-amber-500 to-amber-400",
        glow: "shadow-[0_0_12px_rgba(245,158,11,0.35)]",
    },
    healthy: {
        fill: "from-teal-500 to-emerald-400",
        glow: "shadow-[0_0_12px_rgba(20,184,166,0.3)]",
    },
    overstock: {
        fill: "from-sky-500 to-indigo-400",
        glow: "shadow-[0_0_12px_rgba(99,102,241,0.3)]",
    },
};

export function StockFillBar({
    stock,
    reorderPoint,
    lowStockThreshold,
    className,
}: StockFillBarProps) {
    const rp = reorderPoint ?? lowStockThreshold ?? 5;
    const lt = lowStockThreshold ?? 5;
    const status = statusFor({
        stock,
        reorderPoint: rp,
        lowStockThreshold: lt,
    });

    // Fill target: aim to hit 100% at 2× reorder point; overstock clamps at 100% with stripe overlay.
    const fullAt = Math.max(rp * 2, lt * 3, 1);
    const pct = Math.min(100, Math.max(2, (stock / fullAt) * 100));

    const style = STATUS_STYLES[status];

    return (
        <div
            className={cn(
                "relative h-1.5 w-full rounded-full bg-[var(--card-border)]/60 overflow-hidden",
                className
            )}
            aria-label={`Stock level: ${stock} units`}
        >
            <div
                className={cn(
                    "absolute left-0 top-0 h-full rounded-full bg-gradient-to-r transition-[width] duration-500",
                    style.fill,
                    style.glow
                )}
                style={{ width: `${pct}%` }}
            />
            {status === "overstock" && (
                <div
                    className="absolute inset-0 opacity-40 rounded-full pointer-events-none"
                    style={{
                        backgroundImage:
                            "repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,0.35) 3px 6px)",
                    }}
                />
            )}
        </div>
    );
}
