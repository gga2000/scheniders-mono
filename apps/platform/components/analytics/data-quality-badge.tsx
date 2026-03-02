"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Layers, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EraMode } from "@/hooks/use-financial-epoch";

// =============================================
// PROPS
// =============================================

interface DataQualityBadgeProps {
    eraMode: EraMode;
    epochDate?: string | null;
    className?: string;
    compact?: boolean;
}

// =============================================
// COMPONENT
// =============================================

export function DataQualityBadge({
    eraMode,
    epochDate,
    className,
    compact = false,
}: DataQualityBadgeProps) {
    // Don't show badge in clean mode — data is trustworthy
    if (eraMode === "clean" || !epochDate) return null;

    const formattedDate = epochDate
        ? new Date(epochDate + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        })
        : "";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                    eraMode === "legacy" && "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
                    eraMode === "combined" && "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400",
                    className,
                )}
            >
                {eraMode === "legacy" ? (
                    <>
                        <AlertTriangle className="w-3 h-3" />
                        {!compact && <span>Legacy Data</span>}
                        {compact && <span>Legacy</span>}
                    </>
                ) : (
                    <>
                        <Layers className="w-3 h-3" />
                        {!compact && <span>Mixed · Clean since {formattedDate}</span>}
                        {compact && <span>Mixed</span>}
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
