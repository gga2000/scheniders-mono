"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { formatShortDate, formatTime } from "@/lib/order-format-utils";
import { baghdadDayKey } from "@/lib/order-window";
import type { JourneyStep } from "@/lib/orders/order-activity";

/**
 * The order's path across the top of the history: each step it reached with
 * the first time it got there, the current one ringed, the rest faded. A final
 * off-path status (cancelled, rejected) ends the bar in rose.
 */
export function HistoryJourney({ steps, isReturn, now }: { steps: JourneyStep[]; isReturn: boolean; now: number }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const today = baghdadDayKey(now);

    return (
        <ol aria-label={t("orders.history.journey")} className="flex items-start">
            {steps.map((step, i) => {
                const reached = step.state === "done" || step.state === "current" || step.state === "stopped";
                const lineDone = i > 0 && reached;
                const when = step.at
                    ? baghdadDayKey(Date.parse(step.at)) === today
                        ? formatTime(step.at)
                        : `${formatShortDate(step.at)} · ${formatTime(step.at)}`
                    : null;
                return (
                    <li key={`${step.status}-${i}`} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
                        {i > 0 && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "absolute right-1/2 top-[13px] h-[3px] w-full -translate-y-1/2 rounded-full",
                                    lineDone
                                        ? step.state === "stopped" ? "bg-rose-300 dark:bg-rose-500/50" : "bg-[var(--ink)]"
                                        : "bg-[var(--card-border)]",
                                )}
                            />
                        )}
                        <span
                            className={cn(
                                "relative z-10 grid h-[26px] w-[26px] place-items-center rounded-full border-2 text-[11px] font-bold",
                                step.state === "done" && "border-[var(--ink)] bg-[var(--ink)] text-[var(--ink-contrast)]",
                                step.state === "current" && "border-[var(--ink)] bg-[var(--pastel-yellow)] text-[var(--ink)] ring-4 ring-[var(--pastel-yellow-light)] dark:ring-yellow-500/20",
                                step.state === "stopped" && "border-rose-500 bg-rose-500 text-white",
                                step.state === "upcoming" && "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground-subtle)]",
                            )}
                            aria-current={step.state === "current" ? "step" : undefined}
                        >
                            {step.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step.state === "stopped" ? <X className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                        </span>
                        <span
                            className={cn(
                                "mt-1.5 max-w-full truncate px-1 text-xs font-semibold",
                                step.state === "upcoming" ? "text-[var(--foreground-subtle)]" : step.state === "stopped" ? "text-rose-700 dark:text-rose-300" : "text-[var(--foreground)]",
                            )}
                        >
                            {statusLabel(step.status, isReturn)}
                        </span>
                        <span className="mt-0.5 h-4 text-[11px] tabular-nums text-[var(--foreground-muted)]">{when}</span>
                    </li>
                );
            })}
        </ol>
    );
}
