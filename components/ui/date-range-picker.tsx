"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    X,
    Check,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
    dateFrom?: string;
    dateTo?: string;
    onDateChange: (from: string | undefined, to: string | undefined) => void;
    className?: string;
    inline?: boolean; // When true, shows calendar directly without trigger button
}

type PresetType = "today" | "yesterday" | "thisWeek" | "thisMonth" | "last7" | "last30" | "custom";

/**
 * Format a Date to YYYY-MM-DD string using LOCAL timezone (not UTC)
 * This fixes the issue where after midnight local time, toISOString() would return previous day
 */
function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const presets: { id: PresetType; label: string; getRange: () => { from: string; to: string } }[] = [
    {
        id: "today",
        label: "Today",
        getRange: () => {
            const today = formatLocalDate(new Date());
            return { from: today, to: today };
        },
    },
    {
        id: "yesterday",
        label: "Yesterday",
        getRange: () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const date = formatLocalDate(yesterday);
            return { from: date, to: date };
        },
    },
    {
        id: "thisWeek",
        label: "This Week",
        getRange: () => {
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            return {
                from: formatLocalDate(startOfWeek),
                to: formatLocalDate(now),
            };
        },
    },
    {
        id: "thisMonth",
        label: "This Month",
        getRange: () => {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return {
                from: formatLocalDate(startOfMonth),
                to: formatLocalDate(now),
            };
        },
    },
    {
        id: "last7",
        label: "Last 7 Days",
        getRange: () => {
            const now = new Date();
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return {
                from: formatLocalDate(weekAgo),
                to: formatLocalDate(now),
            };
        },
    },
    {
        id: "last30",
        label: "Last 30 Days",
        getRange: () => {
            const now = new Date();
            const monthAgo = new Date();
            monthAgo.setDate(now.getDate() - 30);
            return {
                from: formatLocalDate(monthAgo),
                to: formatLocalDate(now),
            };
        },
    },
];

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
    // Use local timezone formatting instead of UTC
    return formatLocalDate(date);
}

function parseDate(dateStr: string): Date {
    return new Date(dateStr + "T00:00:00");
}

function formatDisplayDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const date = parseDate(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DateRangePicker({
    dateFrom,
    dateTo,
    onDateChange,
    className,
    inline = false,
}: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(inline); // Start open if inline
    const [activePreset, setActivePreset] = useState<PresetType | null>(null);
    const [viewDate, setViewDate] = useState(() => new Date());
    const [selectingEnd, setSelectingEnd] = useState(false);
    const [tempFrom, setTempFrom] = useState<string | undefined>(dateFrom);
    const [tempTo, setTempTo] = useState<string | undefined>(dateTo);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Detect active preset
    useEffect(() => {
        if (!dateFrom || !dateTo) {
            setActivePreset(null);
            return;
        }
        const matchingPreset = presets.find((p) => {
            const range = p.getRange();
            return range.from === dateFrom && range.to === dateTo;
        });
        setActivePreset(matchingPreset?.id || "custom");
    }, [dateFrom, dateTo]);

    const handlePresetClick = (preset: typeof presets[0]) => {
        const range = preset.getRange();
        onDateChange(range.from, range.to);
        setTempFrom(range.from);
        setTempTo(range.to);
        setActivePreset(preset.id);
        setIsOpen(false);
    };

    const handleDayClick = (day: number) => {
        const clickedDate = formatDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));

        if (!selectingEnd || !tempFrom) {
            // Start new selection
            setTempFrom(clickedDate);
            setTempTo(undefined);
            setSelectingEnd(true);
        } else {
            // Complete selection
            if (clickedDate < tempFrom) {
                setTempTo(tempFrom);
                setTempFrom(clickedDate);
            } else {
                setTempTo(clickedDate);
            }
            setSelectingEnd(false);
        }
    };

    const handleApply = () => {
        onDateChange(tempFrom, tempTo || tempFrom);
        setIsOpen(false);
    };

    const handleClear = () => {
        onDateChange(undefined, undefined);
        setTempFrom(undefined);
        setTempTo(undefined);
        setActivePreset(null);
        setIsOpen(false);
    };

    const goToPrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days: (number | null)[] = [];

        // Add empty cells for days before first day of month
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        // Add actual days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        const isInRange = (day: number) => {
            if (!day || !tempFrom) return false;
            const dateStr = formatDate(new Date(year, month, day));
            const from = tempFrom;
            const to = tempTo || tempFrom;
            return dateStr >= from && dateStr <= to;
        };

        const isStart = (day: number) => {
            if (!day || !tempFrom) return false;
            return formatDate(new Date(year, month, day)) === tempFrom;
        };

        const isEnd = (day: number) => {
            if (!day || !tempTo) return false;
            return formatDate(new Date(year, month, day)) === tempTo;
        };

        const isToday = (day: number) => {
            if (!day) return false;
            const today = new Date();
            return (
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear()
            );
        };

        return (
            <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div
                        key={i}
                        className="text-center text-xs font-medium text-muted py-2"
                    >
                        {d}
                    </div>
                ))}
                {days.map((day, i) => (
                    <motion.button
                        key={i}
                        type="button"
                        disabled={!day}
                        onClick={() => day && handleDayClick(day)}
                        whileHover={day ? { scale: 1.1 } : {}}
                        whileTap={day ? { scale: 0.95 } : {}}
                        className={cn(
                            "h-9 w-9 rounded-xl text-sm font-medium transition-all relative",
                            !day && "invisible",
                            day && "hover:bg-[var(--pastel-yellow)] hover:text-amber-900",
                            isInRange(day!) && !isStart(day!) && !isEnd(day!) && "bg-amber-100/50",
                            (isStart(day!) || isEnd(day!)) &&
                            "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30",
                            isToday(day!) && !isInRange(day!) && "ring-2 ring-amber-400 ring-offset-2"
                        )}
                    >
                        {day}
                        {isToday(day!) && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                        )}
                    </motion.button>
                ))}
            </div>
        );
    };

    const getDisplayValue = () => {
        if (!dateFrom && !dateTo) return "Select dates";
        if (activePreset && activePreset !== "custom") {
            const preset = presets.find((p) => p.id === activePreset);
            return preset?.label || "Custom Range";
        }
        if (dateFrom === dateTo) return formatDisplayDate(dateFrom);
        return `${formatDisplayDate(dateFrom)} — ${formatDisplayDate(dateTo)}`;
    };

    // For inline mode, render just the panel content directly
    if (inline) {
        return (
            <div className={cn("flex bg-white rounded-2xl min-w-[420px]", className)}>
                {/* Presets Sidebar */}
                <div className="w-40 bg-gradient-to-b from-amber-50 to-orange-50 p-3 border-r border-amber-100">
                    <div className="flex items-center gap-2 mb-3 px-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                            Quick Pick
                        </span>
                    </div>
                    <div className="space-y-1">
                        {presets.map((preset) => (
                            <motion.button
                                key={preset.id}
                                type="button"
                                onClick={() => handlePresetClick(preset)}
                                whileHover={{ x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                    "w-full px-3 py-2 rounded-xl text-sm text-left transition-all flex items-center gap-2",
                                    activePreset === preset.id
                                        ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30"
                                        : "text-foreground hover:bg-white hover:shadow-sm"
                                )}
                            >
                                {activePreset === preset.id && (
                                    <Check className="w-3.5 h-3.5" />
                                )}
                                <span className={activePreset !== preset.id ? "ml-5" : ""}>
                                    {preset.label}
                                </span>
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* Calendar */}
                <div className="p-4 w-72">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <motion.button
                            type="button"
                            onClick={goToPrevMonth}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-2 rounded-xl hover:bg-amber-100 text-muted transition-all"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </motion.button>
                        <span className="font-semibold text-foreground">
                            {viewDate.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                            })}
                        </span>
                        <motion.button
                            type="button"
                            onClick={goToNextMonth}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-2 rounded-xl hover:bg-amber-100 text-muted transition-all"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </motion.button>
                    </div>

                    {/* Calendar Grid */}
                    {renderCalendar()}

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-amber-100">
                        <motion.button
                            type="button"
                            onClick={handleClear}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex-1 py-2.5 rounded-xl border border-amber-200 text-sm font-medium text-muted hover:bg-amber-50 transition-all"
                        >
                            All Orders
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={handleApply}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-500/30 hover:shadow-lg transition-all"
                        >
                            Apply
                        </motion.button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <motion.button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all",
                    "bg-gradient-to-br from-white to-amber-50/50",
                    "border-amber-200 hover:border-amber-300",
                    "shadow-sm hover:shadow-md hover:shadow-amber-100",
                    isOpen && "ring-2 ring-amber-400 ring-offset-2",
                    dateFrom && "border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50"
                )}
            >
                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                    <Calendar className="w-4 h-4" />
                </div>
                <span className="font-medium text-foreground">{getDisplayValue()}</span>
                {dateFrom && (
                    <motion.button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        className="p-1 rounded-full hover:bg-amber-100 text-muted"
                    >
                        <X className="w-4 h-4" />
                    </motion.button>
                )}
            </motion.button>

            {/* Dropdown Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="absolute top-full left-0 mt-2 z-50 flex bg-white rounded-3xl shadow-2xl shadow-black/10 border border-amber-100 overflow-hidden"
                    >
                        {/* Presets Sidebar */}
                        <div className="w-40 bg-gradient-to-b from-amber-50 to-orange-50 p-3 border-r border-amber-100">
                            <div className="flex items-center gap-2 mb-3 px-2">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                                    Quick Pick
                                </span>
                            </div>
                            <div className="space-y-1">
                                {presets.map((preset) => (
                                    <motion.button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => handlePresetClick(preset)}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={cn(
                                            "w-full px-3 py-2 rounded-xl text-sm text-left transition-all flex items-center gap-2",
                                            activePreset === preset.id
                                                ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30"
                                                : "text-foreground hover:bg-white hover:shadow-sm"
                                        )}
                                    >
                                        {activePreset === preset.id && (
                                            <Check className="w-3.5 h-3.5" />
                                        )}
                                        <span className={activePreset !== preset.id ? "ml-5" : ""}>
                                            {preset.label}
                                        </span>
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Calendar */}
                        <div className="p-4 w-72">
                            {/* Month Navigation */}
                            <div className="flex items-center justify-between mb-4">
                                <motion.button
                                    type="button"
                                    onClick={goToPrevMonth}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="p-2 rounded-xl hover:bg-amber-100 text-muted transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </motion.button>
                                <span className="font-semibold text-foreground">
                                    {viewDate.toLocaleDateString("en-US", {
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </span>
                                <motion.button
                                    type="button"
                                    onClick={goToNextMonth}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="p-2 rounded-xl hover:bg-amber-100 text-muted transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </motion.button>
                            </div>

                            {/* Calendar Grid */}
                            {renderCalendar()}

                            {/* Actions */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-amber-100">
                                <motion.button
                                    type="button"
                                    onClick={handleClear}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex-1 py-2.5 rounded-xl border border-amber-200 text-sm font-medium text-muted hover:bg-amber-50 transition-all"
                                >
                                    All Orders
                                </motion.button>
                                <motion.button
                                    type="button"
                                    onClick={handleApply}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-500/30 hover:shadow-lg transition-all"
                                >
                                    Apply
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
