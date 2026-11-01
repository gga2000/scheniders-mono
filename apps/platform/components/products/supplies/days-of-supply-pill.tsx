"use client";

import { cn } from "@/lib/utils";
import { Infinity as InfinityIcon } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface DaysOfSupplyPillProps {
    /** Estimated days of supply remaining. null = no data (no sales velocity). */
    days: number | null;
    /** Optional trend: direction of recent change in days-of-supply. */
    trend?: "up" | "down" | "flat";
    size?: "sm" | "md";
    className?: string;
}

function tone(days: number | null): {
    text: string;
    bg: string;
    ring: string;
} {
    if (days === null) {
        return {
            text: "text-muted",
            bg: "bg-[var(--card-border)]/50",
            ring: "ring-[var(--card-border)]/60",
        };
    }
    if (days <= 3) return { text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-100" };
    if (days <= 7) return { text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" };
    if (days <= 30) return { text: "text-teal-600", bg: "bg-teal-50", ring: "ring-teal-100" };
    return { text: "text-sky-600", bg: "bg-sky-50", ring: "ring-sky-100" };
}

function TrendGlyph({ direction }: { direction: "up" | "down" | "flat" }) {
    if (direction === "up") return <span className="text-emerald-600 text-[10px] leading-none">▲</span>;
    if (direction === "down") return <span className="text-rose-600 text-[10px] leading-none">▼</span>;
    return <span className="text-muted text-[10px] leading-none">─</span>;
}

export function DaysOfSupplyPill({
    days,
    trend,
    size = "md",
    className,
}: DaysOfSupplyPillProps) {
    const { t: tr } = useLanguage();
    const t = tone(days);
    const big = size === "md";
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-xl ring-1 transition-colors",
                big ? "px-2.5 py-1" : "px-2 py-0.5",
                t.bg,
                t.ring,
                className
            )}
            title={days === null ? tr("supplies.dos.none") : tr("supplies.dos.approx", { days })}
        >
            <span
                className={cn(
                    "font-bold tabular-nums leading-none",
                    big ? "text-[22px]" : "text-sm",
                    t.text
                )}
            >
                {days === null ? (
                    <InfinityIcon className={cn(big ? "w-5 h-5" : "w-3.5 h-3.5", "inline-block -mt-0.5")} />
                ) : (
                    `${days}d`
                )}
            </span>
            {trend && days !== null && <TrendGlyph direction={trend} />}
        </div>
    );
}

export function daysOfSupplyFrom({
    stock,
    reserved = 0,
    timesSold30d,
}: {
    stock: number;
    reserved?: number;
    timesSold30d: number;
}): number | null {
    if (stock <= 0) return 0;
    if (timesSold30d <= 0) return null;
    const rate = timesSold30d / 30;
    if (rate <= 0) return null;
    const available = Math.max(0, stock - reserved);
    return Math.round(available / rate);
}
