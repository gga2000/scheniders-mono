"use client";

import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseStoreBuilderReturn } from "@/hooks/use-store-builder";

interface StoreHealthScoreProps {
    builder: UseStoreBuilderReturn;
    onScrollToSection?: (sectionId: string) => void;
}

// ── Circular Progress Ring ──

function ProgressRing({ score }: { score: number }) {
    const size = 96;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const color =
        score >= 80 ? "#16a34a" : score >= 50 ? "#ca8a04" : "#dc2626";

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`Store health score: ${score} out of 100`}>
                {/* Background track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/20"
                />
                {/* Progress arc */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                    className="text-xl font-bold"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    {score}
                </motion.span>
            </div>
        </div>
    );
}

// ── Main ──

export function StoreHealthScore({ builder, onScrollToSection }: StoreHealthScoreProps) {
    const { completionScore, completionItems } = builder;

    return (
        <div className="space-y-4">
            {/* Score + ring */}
            <div className="flex items-center gap-4">
                <ProgressRing score={completionScore} />
                <div>
                    <p className="text-sm font-semibold">
                        Store Health
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {completionScore >= 80
                            ? "Your store is looking great!"
                            : completionScore >= 50
                            ? "Good progress — keep going!"
                            : "Complete the checklist to improve your store."}
                    </p>
                </div>
            </div>

            {/* Checklist */}
            <div className="space-y-1">
                {completionItems.map((item) => (
                    <div
                        key={item.key}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                            item.complete
                                ? "text-muted-foreground"
                                : "text-foreground"
                        )}
                    >
                        {item.complete ? (
                            <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3 text-green-600" />
                            </div>
                        ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-(--card-border) shrink-0" />
                        )}
                        <span className={cn("flex-1", item.complete && "line-through opacity-60")}>
                            {item.label}
                        </span>
                        {!item.complete && item.sectionId && onScrollToSection && (
                            <button
                                type="button"
                                onClick={() => onScrollToSection(item.sectionId!)}
                                className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline"
                            >
                                Fix <ChevronRight className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
