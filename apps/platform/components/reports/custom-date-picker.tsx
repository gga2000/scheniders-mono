"use client";

import { useLanguage } from "@/hooks/use-language";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRange } from "@/hooks/use-reports-metrics";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isWithinInterval,
    addMonths,
    subMonths,
    startOfDay,
    endOfDay
} from "date-fns";

interface CustomDatePickerProps {
    dateRange: DateRange;
    onChange: (range: DateRange) => void;
    presets: {
        key: string;
        label: string;
        range: DateRange;
    }[];
}

export function CustomDatePicker({ dateRange, onChange, presets }: CustomDatePickerProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(dateRange.from);
    const [selecting, setSelecting] = useState<'from' | 'to' | null>(null);
    const [tempFrom, setTempFrom] = useState<Date | null>(dateRange.from);
    const [tempTo, setTempTo] = useState<Date | null>(dateRange.to);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Reset temp values when opening
    useEffect(() => {
        if (isOpen) {
            setTempFrom(dateRange.from);
            setTempTo(dateRange.to);
            setCurrentMonth(dateRange.from);
            setSelecting(null);
        }
    }, [isOpen, dateRange]);

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const handleDayClick = (day: Date) => {
        if (!selecting || selecting === 'from') {
            setTempFrom(startOfDay(day));
            setTempTo(null);
            setSelecting('to');
        } else {
            // If clicking before start date, swap
            if (tempFrom && day < tempFrom) {
                setTempTo(endOfDay(tempFrom));
                setTempFrom(startOfDay(day));
            } else {
                setTempTo(endOfDay(day));
            }
            setSelecting(null);
        }
    };

    const handleApply = () => {
        if (tempFrom && tempTo) {
            onChange({ from: tempFrom, to: tempTo });
            setIsOpen(false);
        }
    };

    const handlePresetClick = (preset: typeof presets[0]) => {
        onChange(preset.range);
        setIsOpen(false);
    };

    const isInRange = (day: Date) => {
        if (!tempFrom || !tempTo) return false;
        return isWithinInterval(day, { start: tempFrom, end: tempTo });
    };

    const isRangeStart = (day: Date) => tempFrom && isSameDay(day, tempFrom);
    const isRangeEnd = (day: Date) => tempTo && isSameDay(day, tempTo);

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl",
                    "pastel-card hover:shadow-md transition-all",
                    "text-sm font-medium text-foreground",
                    isOpen && "ring-2 ring-indigo-500/20"
                )}
            >
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}</span>
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute right-0 top-full mt-2 z-50",
                            "bg-white dark:bg-neutral-900 border border-border rounded-2xl shadow-2xl",
                            "overflow-hidden"
                        )}
                    >
                        <div className="flex">
                            {/* Presets Sidebar */}
                            <div className="w-40 border-r border-border p-2 bg-gray-50/50 dark:bg-white/5">
                                <p className="text-xs font-medium text-muted px-2 py-1.5 mb-1">{t("reports.picker.quick")}</p>
                                {presets.map((preset) => (
                                    <button
                                        key={preset.key}
                                        onClick={() => handlePresetClick(preset)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                            "hover:bg-indigo-50 hover:text-indigo-600"
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            {/* Calendar */}
                            <div className="p-4 w-72">
                                {/* Month Navigation */}
                                <div className="flex items-center justify-between mb-4">
                                    <button
                                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <h3 className="font-semibold text-foreground">
                                        {format(currentMonth, "MMMM yyyy")}
                                    </h3>
                                    <button
                                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Day Headers */}
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => (
                                        <div key={day} className="text-center text-xs font-medium text-muted py-1">
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                {/* Days Grid */}
                                <div className="grid grid-cols-7 gap-1">
                                    {days.map((day, i) => {
                                        const isCurrentMonth = isSameMonth(day, currentMonth);
                                        const isSelected = isRangeStart(day) || isRangeEnd(day);
                                        const inRange = isInRange(day);
                                        const isToday = isSameDay(day, new Date());

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleDayClick(day)}
                                                disabled={!isCurrentMonth}
                                                className={cn(
                                                    "w-9 h-9 rounded-lg text-sm transition-all relative",
                                                    "hover:bg-indigo-50",
                                                    !isCurrentMonth && "text-gray-300 cursor-not-allowed hover:bg-transparent",
                                                    isCurrentMonth && "text-foreground",
                                                    isToday && !isSelected && "ring-1 ring-indigo-500",
                                                    inRange && !isSelected && "bg-indigo-50 dark:bg-indigo-500/10",
                                                    isSelected && "bg-indigo-500 text-white hover:bg-indigo-600",
                                                    isRangeStart(day) && tempTo && "rounded-r-none",
                                                    isRangeEnd(day) && tempFrom && "rounded-l-none",
                                                    inRange && !isRangeStart(day) && !isRangeEnd(day) && "rounded-none"
                                                )}
                                            >
                                                {format(day, "d")}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Selection Info */}
                                <div className="mt-4 pt-4 border-t border-border">
                                    <div className="flex items-center justify-between text-sm mb-3">
                                        <div>
                                            <span className="text-muted">{t("reports.picker.from")} </span>
                                            <span className="font-medium">
                                                {tempFrom ? format(tempFrom, "MMM d, yyyy") : "Select..."}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-muted">{t("reports.picker.to")} </span>
                                            <span className="font-medium">
                                                {tempTo ? format(tempTo, "MMM d, yyyy") : "Select..."}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsOpen(false)}
                                            className="flex-1 py-2 px-3 text-sm font-medium text-muted hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                        >
                                            {t("reports.common.cancel")}
                                        </button>
                                        <button
                                            onClick={handleApply}
                                            disabled={!tempFrom || !tempTo}
                                            className={cn(
                                                "flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors",
                                                tempFrom && tempTo
                                                    ? "bg-indigo-500 text-white hover:bg-indigo-600"
                                                    : "bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed"
                                            )}
                                        >
                                            {t("reports.common.apply")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
