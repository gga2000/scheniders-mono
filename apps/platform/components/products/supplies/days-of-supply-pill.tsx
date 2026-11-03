"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { SupplyTone } from "@/lib/utils/supply-reorder";

interface DaysOfSupplyPillProps {
    /** Estimated days of supply remaining. null = no data (no sales velocity). */
    days: number | null;
    /** Optional trend: direction of recent change in days-of-supply. */
    trend?: "up" | "down" | "flat";
    size?: "sm" | "md";
    /** The supply's shared status; without it the colour follows the day count alone. */
    status?: SupplyTone;
    className?: string;
}

const STATUS_TONE: Record<SupplyTone, { text: string; bg: string; ring: string }> = {
    out: { text: "text-rose-600 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-500/15", ring: "ring-rose-100 dark:ring-rose-500/30" },
    critical: { text: "text-rose-600 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-500/15", ring: "ring-rose-100 dark:ring-rose-500/30" },
    low: { text: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/15", ring: "ring-amber-100 dark:ring-amber-500/30" },
    ok: { text: "text-teal-600 dark:text-teal-300", bg: "bg-teal-50 dark:bg-teal-500/15", ring: "ring-teal-100 dark:ring-teal-500/30" },
};

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
    if (days <= 3) return { text: "text-rose-600 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-500/15", ring: "ring-rose-100 dark:ring-rose-500/30" };
    if (days <= 7) return { text: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/15", ring: "ring-amber-100 dark:ring-amber-500/30" };
    if (days <= 30) return { text: "text-teal-600 dark:text-teal-300", bg: "bg-teal-50 dark:bg-teal-500/15", ring: "ring-teal-100 dark:ring-teal-500/30" };
    return { text: "text-sky-600 dark:text-sky-300", bg: "bg-sky-50 dark:bg-sky-500/15", ring: "ring-sky-100 dark:ring-sky-500/30" };
}

function TrendGlyph({ direction }: { direction: "up" | "down" | "flat" }) {
    if (direction === "up") return <span className="text-emerald-600 text-[10px] leading-none dark:text-emerald-300">▲</span>;
    if (direction === "down") return <span className="text-rose-600 text-[10px] leading-none dark:text-rose-300">▼</span>;
    return <span className="text-muted text-[10px] leading-none">─</span>;
}

export function DaysOfSupplyPill({
    days,
    trend,
    size = "md",
    status,
    className,
}: DaysOfSupplyPillProps) {
    const { t: tr } = useLanguage();
    const t = status ? STATUS_TONE[status] : tone(days);
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
                    "font-bold tabular-nums leading-none whitespace-nowrap",
                    big ? "text-[22px]" : "text-sm",
                    t.text
                )}
            >
                {/* No usage yet means "unknown", not "lasts forever": a supply
                    below its reorder point must never read as infinite. */}
                {days === null ? "—" : days <= 0 ? tr("supplies.dos.out") : tr("supplies.sp.leadDays", { count: days })}
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
