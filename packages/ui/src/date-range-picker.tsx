"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    X,
    Check,
    Sparkles,
} from "lucide-react";
import { cn } from "@scheniders/shared";

interface DateRangePickerProps {
    dateFrom?: string;
    dateTo?: string;
    onDateChange: (from: string | undefined, to: string | undefined, presetId?: string) => void;
    className?: string;
    inline?: boolean; // When true, shows calendar directly without trigger button
    epochDate?: string; // Financial epoch date — adds "Since Day Zero" preset
    /** The reader's language. Arabic also starts the week on Saturday, as in Iraq. */
    language?: "en" | "ar";
    /**
     * The zone whose calendar "today" is read on (e.g. "Asia/Baghdad"), for
     * apps that count every day there whatever the browser's zone. Left out,
     * today is the browser's own day.
     */
    timeZone?: string;
}

type PresetType = "dayZero" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "thisYear" | "last7" | "last30" | "pastYear" | "custom";

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

type Copy = {
    presets: Record<Exclude<PresetType, "custom">, string>;
    quickPick: string;
    allOrders: string;
    apply: string;
    dateRange: string;
    /** One letter per weekday, starting on the language's first day of the week. */
    weekdays: string[];
    /** Day the week starts on, as Date.getDay() numbers it (0 = Sunday). */
    weekStart: number;
    /** Intl locale; Arabic keeps Latin digits like the rest of the app. */
    intl: string;
};

const COPY: Record<"en" | "ar", Copy> = {
    en: {
        presets: {
            dayZero: "Since day zero",
            today: "Today",
            yesterday: "Yesterday",
            thisWeek: "This week",
            thisMonth: "This month",
            last7: "Last 7 days",
            last30: "Last 30 days",
            thisYear: "This year",
            pastYear: "Past year",
        },
        quickPick: "Quick pick",
        allOrders: "All orders",
        apply: "Apply",
        dateRange: "Date range",
        weekdays: ["S", "M", "T", "W", "T", "F", "S"],
        weekStart: 0,
        intl: "en-US",
    },
    ar: {
        presets: {
            dayZero: "منذ اليوم الأول",
            today: "اليوم",
            yesterday: "أمس",
            thisWeek: "هذا الأسبوع",
            thisMonth: "هذا الشهر",
            last7: "آخر 7 أيام",
            last30: "آخر 30 يوماً",
            thisYear: "هذه السنة",
            pastYear: "آخر سنة",
        },
        quickPick: "اختيار سريع",
        allOrders: "كل الطلبات",
        apply: "تطبيق",
        dateRange: "التاريخ",
        // Saturday first, as the week runs in Iraq: السبت، الأحد ... الجمعة.
        weekdays: ["س", "ح", "ن", "ث", "ر", "خ", "ج"],
        weekStart: 6,
        intl: "ar-IQ-u-nu-latn",
    },
};

type Preset = { id: PresetType; label: string; getRange: () => { from: string; to: string } };

/**
 * Now, as a calendar day: today in `timeZone` at local midnight, so the
 * calendar math below (getDate, setDate, getDay) counts that zone's days.
 * The only place this file reads the clock.
 */
function calendarNow(timeZone?: string): Date {
    if (!timeZone) return new Date();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
    return parseDate(day);
}

/** The quick picks in the reader's language, with "Since day zero" first when the shop has an epoch. */
function buildPresets(copy: Copy, epochDate?: string, timeZone?: string): Preset[] {
    const now = () => calendarNow(timeZone);
    const today = () => formatLocalDate(now());
    const daysAgo = (n: number) => {
        const d = now();
        d.setDate(d.getDate() - n);
        return formatLocalDate(d);
    };
    const presets: Preset[] = [
        { id: "today", label: copy.presets.today, getRange: () => ({ from: today(), to: today() }) },
        { id: "yesterday", label: copy.presets.yesterday, getRange: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
        {
            id: "thisWeek",
            label: copy.presets.thisWeek,
            getRange: () => ({ from: daysAgo((now().getDay() - copy.weekStart + 7) % 7), to: today() }),
        },
        {
            id: "thisMonth",
            label: copy.presets.thisMonth,
            getRange: () => {
                const day = now();
                return { from: formatLocalDate(new Date(day.getFullYear(), day.getMonth(), 1)), to: today() };
            },
        },
        { id: "last7", label: copy.presets.last7, getRange: () => ({ from: daysAgo(6), to: today() }) },
        { id: "last30", label: copy.presets.last30, getRange: () => ({ from: daysAgo(29), to: today() }) },
        {
            id: "thisYear",
            label: copy.presets.thisYear,
            getRange: () => ({ from: formatLocalDate(new Date(now().getFullYear(), 0, 1)), to: today() }),
        },
        {
            id: "pastYear",
            label: copy.presets.pastYear,
            getRange: () => {
                const yearAgo = now();
                yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                return { from: formatLocalDate(yearAgo), to: today() };
            },
        },
    ];
    if (!epochDate) return presets;
    return [{ id: "dayZero", label: copy.presets.dayZero, getRange: () => ({ from: epochDate, to: today() }) }, ...presets];
}

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

function formatDisplayDate(dateStr: string | undefined, intl: string): string {
    if (!dateStr) return "";
    const date = parseDate(dateStr);
    return date.toLocaleDateString(intl, { month: "short", day: "numeric" });
}

export function DateRangePicker({
    dateFrom,
    dateTo,
    onDateChange,
    className,
    inline = false,
    epochDate,
    language = "en",
    timeZone,
}: DateRangePickerProps) {
    const copy = COPY[language];
    const presets = buildPresets(copy, epochDate, timeZone);
    const [isOpen, setIsOpen] = useState(inline); // Start open if inline
    const [activePreset, setActivePreset] = useState<PresetType | null>(null);
    const [viewDate, setViewDate] = useState(() => calendarNow(timeZone));
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
        onDateChange(range.from, range.to, preset.id);
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
        onDateChange(tempFrom, tempTo || tempFrom, "custom");
        setIsOpen(false);
    };

    const handleClear = () => {
        onDateChange(undefined, undefined, undefined);
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
        // Blank cells before the 1st, counted from the language's first weekday.
        const firstDay = (getFirstDayOfMonth(year, month) - copy.weekStart + 7) % 7;
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
            const today = calendarNow(timeZone);
            return (
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear()
            );
        };

        return (
            <div className="grid grid-cols-7 gap-1">
                {copy.weekdays.map((d, i) => (
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
                            day && "hover:bg-lime-100 hover:text-lime-900 dark:hover:bg-[#EFFF00]/15 dark:hover:text-[#EFFF00]",
                            isInRange(day!) && !isStart(day!) && !isEnd(day!) && "bg-lime-100/50 dark:bg-[#EFFF00]/10",
                            (isStart(day!) || isEnd(day!)) &&
                            "bg-gradient-to-br from-lime-400 to-[#EFFF00] text-black shadow-lg shadow-lime-500/30",
                            isToday(day!) && !isInRange(day!) && "ring-2 ring-[#EFFF00] ring-offset-2 dark:ring-offset-[#1a1a2e]"
                        )}
                    >
                        {day}
                        {isToday(day!) && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#EFFF00] rounded-full" />
                        )}
                    </motion.button>
                ))}
            </div>
        );
    };

    const getDisplayValue = () => {
        if (!dateFrom && !dateTo) return copy.dateRange;
        // If a preset is active, show its label
        if (activePreset && activePreset !== "custom") {
            const preset = presets.find((p) => p.id === activePreset);
            if (preset) return preset.label;
        }
        // Single date
        if (dateFrom && (!dateTo || dateFrom === dateTo)) return formatDisplayDate(dateFrom, copy.intl);
        // Date range
        if (dateFrom && dateTo) return `${formatDisplayDate(dateFrom, copy.intl)} — ${formatDisplayDate(dateTo, copy.intl)}`;
        return copy.dateRange;
    };

    // For inline mode, render just the panel content directly
    if (inline) {
        return (
            <div className={cn("flex bg-white dark:bg-[#1a1a2e] rounded-2xl min-w-[420px] shadow-2xl border border-lime-200 dark:border-white/10 overflow-hidden", className)}>
                {/* Presets Sidebar */}
                <div className="w-40 bg-gradient-to-b from-lime-50 to-green-50 dark:from-[#151528] dark:to-[#1a1a2e] p-3 border-r border-lime-200 dark:border-white/10">
                    <div className="flex items-center gap-2 mb-3 px-2">
                        <Sparkles className="w-4 h-4 text-lime-500 dark:text-[#EFFF00]" />
                        <span className="text-xs font-semibold text-lime-700 dark:text-[#EFFF00] uppercase tracking-wider">
                            {copy.quickPick}
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
                                        ? "bg-gradient-to-r from-lime-400 to-[#EFFF00] text-black shadow-md shadow-lime-500/30"
                                        : "text-foreground hover:bg-white dark:hover:bg-white/10 hover:shadow-sm"
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
                            className="p-2 rounded-xl hover:bg-lime-100 dark:hover:bg-[#EFFF00]/10 text-muted transition-all"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-[#EFFF00]" />
                        </motion.button>
                        <span className="font-semibold text-foreground">
                            {viewDate.toLocaleDateString(copy.intl, {
                                month: "long",
                                year: "numeric",
                            })}
                        </span>
                        <motion.button
                            type="button"
                            onClick={goToNextMonth}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-2 rounded-xl hover:bg-lime-100 dark:hover:bg-[#EFFF00]/10 text-muted transition-all"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-[#EFFF00]" />
                        </motion.button>
                    </div>

                    {/* Calendar Grid */}
                    {renderCalendar()}

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-lime-200 dark:border-white/10">
                        <motion.button
                            type="button"
                            onClick={handleClear}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex-1 py-2.5 rounded-xl border border-lime-300 dark:border-white/10 text-sm font-medium text-muted hover:bg-lime-50 dark:hover:bg-white/5 dark:text-gray-300 transition-all"
                        >
                            {copy.allOrders}
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={handleApply}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-lime-400 to-[#EFFF00] text-black text-sm font-semibold shadow-md shadow-lime-500/30 hover:shadow-lg transition-all"
                        >
                            {copy.apply}
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
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm",
                    "bg-[var(--card-bg)] dark:bg-[#1E1E1E]",
                    "border-[var(--card-border)] hover:border-lime-400/40 dark:border-white/10 dark:hover:border-[#EFFF00]/40",
                    "shadow-sm hover:shadow-md dark:hover:shadow-none",
                    isOpen && "ring-2 ring-[#EFFF00]/50 ring-offset-1 dark:ring-offset-[#1E1E1E]",
                    dateFrom && "border-lime-400 dark:border-[#EFFF00]/40 bg-lime-50 dark:bg-[#EFFF00]/5"
                )}
            >
                <CalendarDays className="w-4 h-4 text-lime-600 dark:text-[#EFFF00]" />
                <span className="font-medium text-foreground text-xs">{getDisplayValue()}</span>
                {dateFrom && (
                    <motion.span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                handleClear();
                            }
                        }}
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        className="p-0.5 rounded-full hover:bg-lime-100 dark:hover:bg-[#EFFF00]/10 text-muted cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5" />
                    </motion.span>
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
                        className="absolute top-full left-0 mt-2 z-50 flex bg-white dark:bg-[#1a1a2e] rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 border border-lime-200 dark:border-white/10 overflow-hidden"
                    >
                        {/* Presets Sidebar */}
                        <div className="w-40 bg-gradient-to-b from-lime-50 to-green-50 dark:from-[#151528] dark:to-[#1a1a2e] p-3 border-r border-lime-200 dark:border-white/10">
                            <div className="flex items-center gap-2 mb-3 px-2">
                                <Sparkles className="w-4 h-4 text-lime-500 dark:text-[#EFFF00]" />
                                <span className="text-xs font-semibold text-lime-700 dark:text-[#EFFF00] uppercase tracking-wider">
                                    {copy.quickPick}
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
                                                ? "bg-gradient-to-r from-lime-400 to-[#EFFF00] text-black shadow-md shadow-lime-500/30"
                                                : "text-foreground hover:bg-white dark:hover:bg-white/5 hover:shadow-sm"
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
                                    className="p-2 rounded-xl hover:bg-lime-100 dark:hover:bg-[#EFFF00]/10 text-muted dark:text-[#EFFF00] transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-[#EFFF00]" />
                                </motion.button>
                                <span className="font-semibold text-foreground">
                                    {viewDate.toLocaleDateString(copy.intl, {
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </span>
                                <motion.button
                                    type="button"
                                    onClick={goToNextMonth}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="p-2 rounded-xl hover:bg-lime-100 dark:hover:bg-[#EFFF00]/10 text-muted dark:text-[#EFFF00] transition-all"
                                >
                                    <ChevronRight className="w-5 h-5 text-gray-600 dark:text-[#EFFF00]" />
                                </motion.button>
                            </div>

                            {/* Calendar Grid */}
                            {renderCalendar()}

                            {/* Actions */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-lime-200 dark:border-white/10">
                                <motion.button
                                    type="button"
                                    onClick={handleClear}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex-1 py-2.5 rounded-xl border border-lime-300 dark:border-white/10 text-sm font-medium text-muted hover:bg-lime-50 dark:hover:bg-white/5 transition-all"
                                >
                                    {copy.allOrders}
                                </motion.button>
                                <motion.button
                                    type="button"
                                    onClick={handleApply}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-lime-400 to-[#EFFF00] text-black text-sm font-semibold shadow-md shadow-lime-500/30 hover:shadow-lg transition-all"
                                >
                                    {copy.apply}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
