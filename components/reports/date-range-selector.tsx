"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRange, useDateRangePresets } from "@/hooks/use-reports-metrics";

interface DateRangeSelectorProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
}

type PresetKey = 'today' | 'thisWeek' | 'thisMonth' | 'last7Days' | 'last30Days' | 'custom';

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activePreset, setActivePreset] = useState<PresetKey>('last30Days');
    const presets = useDateRangePresets();

    const presetLabels: Record<PresetKey, string> = {
        today: 'Today',
        thisWeek: 'This Week',
        thisMonth: 'This Month',
        last7Days: 'Last 7 Days',
        last30Days: 'Last 30 Days',
        custom: 'Custom Range',
    };

    const handlePresetClick = (key: PresetKey) => {
        if (key !== 'custom') {
            setActivePreset(key);
            onChange(presets[key]);
        }
        setIsOpen(false);
    };

    const formatDateRange = (range: DateRange) => {
        const from = range.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const to = range.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${from} - ${to}`;
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-2xl",
                    "bg-[var(--card-bg)] border border-[var(--card-border)]",
                    "hover:bg-white/5 transition-all",
                    "text-sm font-medium text-foreground"
                )}
            >
                <Calendar className="w-4 h-4 text-muted" />
                <span>{presetLabels[activePreset]}</span>
                <span className="text-muted text-xs">({formatDateRange(value)})</span>
                <ChevronDown className={cn(
                    "w-4 h-4 text-muted transition-transform",
                    isOpen && "rotate-180"
                )} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={cn(
                                "absolute right-0 top-full mt-2 z-50",
                                "w-56 py-2 rounded-2xl",
                                "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                "shadow-xl"
                            )}
                        >
                            {(Object.keys(presetLabels) as PresetKey[])
                                .filter(k => k !== 'custom')
                                .map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => handlePresetClick(key)}
                                        className={cn(
                                            "w-full px-4 py-2.5 text-left text-sm transition-colors",
                                            "hover:bg-white/5",
                                            activePreset === key
                                                ? "text-foreground bg-white/5"
                                                : "text-muted"
                                        )}
                                    >
                                        {presetLabels[key]}
                                    </button>
                                ))
                            }
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
