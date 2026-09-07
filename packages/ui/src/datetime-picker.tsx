"use client";

import { useState, useEffect, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
    Calendar,
    Clock,
    ChevronLeft,
    ChevronRight,
    Check,
    X
} from "lucide-react";
import { cn } from "@scheniders/shared";

interface DateTimePickerProps {
    value: string | null; // ISO string or null
    onChange: (isoString: string) => void;
    label?: string;
    showTime?: boolean;
    className?: string;
    /**
     * Latest selectable instant. Days past it are disabled and a selection is
     * clamped to it. Pass "now" rather than a `new Date()` when the bound is the
     * present moment: it is resolved on each interaction, so a form left open
     * for an hour does not clamp against an hour-old clock.
     */
    maxDate?: Date | "now" | null;
    /** Earliest selectable instant. Accepts "now" on the same terms as maxDate. */
    minDate?: Date | "now" | null;
}

const MONTHS_AR = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DateTimePicker({
    value,
    onChange,
    showTime = true,
    className,
    maxDate = null,
    minDate = null
}: DateTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<"date" | "time">("date");

    // Parse initial value or use current date
    const initialDate = value ? new Date(value) : new Date();

    // Internal state for calendar view and selection
    const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
    const [viewYear, setViewYear] = useState(initialDate.getFullYear());
    const [selectedDay, setSelectedDay] = useState(initialDate.getDate());
    const [selectedHour, setSelectedHour] = useState(initialDate.getHours());
    const [selectedMinute, setSelectedMinute] = useState(initialDate.getMinutes());

    // Sync internal state when value prop changes
    useEffect(() => {
        if (value) {
            const date = new Date(value);
            setViewMonth(date.getMonth());
            setViewYear(date.getFullYear());
            setSelectedDay(date.getDate());
            setSelectedHour(date.getHours());
            setSelectedMinute(date.getMinutes());
        }
    }, [value]);

    // Reset mode when opening
    useEffect(() => {
        if (isOpen) {
            setMode("date");
        }
    }, [isOpen]);

    // Calendar calculations
    const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

    const daysInMonth = getDaysInMonth(viewMonth, viewYear);
    const firstDay = getFirstDayOfMonth(viewMonth, viewYear);

    // Build calendar grid
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

    // Navigation handlers
    const prevMonth = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(y => y - 1);
        } else {
            setViewMonth(m => m - 1);
        }
    }, [viewMonth]);

    const nextMonth = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(y => y + 1);
        } else {
            setViewMonth(m => m + 1);
        }
    }, [viewMonth]);

    /** Read the bound at the moment it is needed, so "now" never goes stale. */
    const resolveBound = useCallback((bound: Date | "now" | null) => {
        if (bound === null) return null;
        return bound === "now" ? Date.now() : bound.getTime();
    }, []);

    /** A whole day is unreachable only when it falls entirely outside the range. */
    const isDayDisabled = useCallback((day: number) => {
        const maxTime = resolveBound(maxDate);
        const minTime = resolveBound(minDate);
        const dayStart = new Date(viewYear, viewMonth, day, 0, 0, 0, 0).getTime();
        const dayEnd = new Date(viewYear, viewMonth, day, 23, 59, 59, 999).getTime();
        if (maxTime !== null && dayStart > maxTime) return true;
        if (minTime !== null && dayEnd < minTime) return true;
        return false;
    }, [viewYear, viewMonth, maxDate, minDate, resolveBound]);

    /** Pull a selection back inside the range so the picker cannot emit a value it disallows. */
    const clampToRange = useCallback((date: Date) => {
        const maxTime = resolveBound(maxDate);
        const minTime = resolveBound(minDate);
        let time = date.getTime();
        if (maxTime !== null && time > maxTime) time = maxTime;
        if (minTime !== null && time < minTime) time = minTime;
        return new Date(time);
    }, [maxDate, minDate, resolveBound]);

    // Day selection
    const selectDay = useCallback((day: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDayDisabled(day)) return;
        setSelectedDay(day);

        if (showTime) {
            // Switch to time mode after selecting date
            setMode("time");
        } else {
            // If no time picker, confirm immediately
            const newDate = clampToRange(new Date(viewYear, viewMonth, day, selectedHour, selectedMinute));
            onChange(newDate.toISOString());
            setIsOpen(false);
        }
    }, [showTime, viewYear, viewMonth, selectedHour, selectedMinute, onChange, isDayDisabled, clampToRange]);

    // Quick select today
    const selectToday = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Clamp first, so the quick action lands on a value the picker would accept
        // rather than showing "now" and silently emitting something else on confirm.
        const now = clampToRange(new Date());
        setViewMonth(now.getMonth());
        setViewYear(now.getFullYear());
        setSelectedDay(now.getDate());
        setSelectedHour(now.getHours());
        setSelectedMinute(now.getMinutes());
    }, [clampToRange]);

    // Confirm final selection
    const confirmSelection = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const finalDate = clampToRange(new Date(viewYear, viewMonth, selectedDay, selectedHour, selectedMinute));
        onChange(finalDate.toISOString());
        setIsOpen(false);
    }, [viewYear, viewMonth, selectedDay, selectedHour, selectedMinute, onChange, clampToRange]);

    // AM/PM toggle
    const setAM = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedHour >= 12) setSelectedHour(h => h - 12);
    }, [selectedHour]);

    const setPM = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedHour < 12) setSelectedHour(h => h + 12);
    }, [selectedHour]);

    // Check if day is today
    const isToday = (day: number) => {
        const today = new Date();
        return day === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();
    };

    // Format display value
    const formatDisplayValue = () => {
        if (!value) return "اختر التاريخ";
        const date = new Date(value);
        const day = date.getDate();
        const month = MONTHS_AR[date.getMonth()];
        const year = date.getFullYear();
        if (showTime) {
            const hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'م' : 'ص';
            const displayHour = hours % 12 || 12;
            return `${day} ${month} ${year} - ${displayHour}:${minutes} ${ampm}`;
        }
        return `${day} ${month} ${year}`;
    };

    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
            {/* Trigger Button */}
            <DialogPrimitive.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "w-full h-[38px] flex items-center gap-2 px-3 rounded-lg",
                        "bg-[var(--background)] border border-[var(--card-border)]",
                        "hover:border-[var(--card-border)] hover:bg-[var(--background)]",
                        "focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]",
                        "transition-all",
                        className
                    )}
                >
                    <span className={cn(
                        "flex-1 text-left text-sm font-mono",
                        value ? "text-foreground" : "text-muted"
                    )}>
                        {formatDisplayValue()}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                </button>
            </DialogPrimitive.Trigger>

            <AnimatePresence>
                {isOpen && (
                    <DialogPrimitive.Portal forceMount>
                        {/* Overlay */}
                        <DialogPrimitive.Overlay asChild>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                                style={{ zIndex: 99999 }}
                            />
                        </DialogPrimitive.Overlay>

                        {/* Content */}
                        <DialogPrimitive.Content asChild>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-[var(--card-border)]"
                                style={{ zIndex: 99999 }}
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] bg-[var(--background)]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                                            <Calendar className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <DialogPrimitive.Title className="font-bold text-foreground">
                                                اختر التاريخ والوقت
                                            </DialogPrimitive.Title>
                                            <DialogPrimitive.Description className="text-xs text-muted">
                                                {selectedDay} {MONTHS_AR[viewMonth]} {viewYear}
                                                {showTime && ` - ${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`}
                                            </DialogPrimitive.Description>
                                        </div>
                                    </div>
                                    <DialogPrimitive.Close asChild>
                                        <button
                                            type="button"
                                            className="w-8 h-8 rounded-lg hover:bg-[var(--card-border)] flex items-center justify-center transition-all"
                                        >
                                            <X className="w-4 h-4 text-muted" />
                                        </button>
                                    </DialogPrimitive.Close>
                                </div>

                                {/* Mode Tabs */}
                                {showTime && (
                                    <div className="flex border-b border-gray-100">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode("date"); }}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all",
                                                mode === "date"
                                                    ? "bg-blue-50 text-blue-700 border-b-2 border-blue-500"
                                                    : "text-muted hover:bg-gray-50"
                                            )}
                                        >
                                            <Calendar className="w-4 h-4" />
                                            التاريخ
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode("time"); }}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all",
                                                mode === "time"
                                                    ? "bg-blue-50 text-blue-700 border-b-2 border-blue-500"
                                                    : "text-muted hover:bg-gray-50"
                                            )}
                                        >
                                            <Clock className="w-4 h-4" />
                                            الوقت
                                        </button>
                                    </div>
                                )}

                                {/* Date Picker View */}
                                {mode === "date" && (
                                    <div className="p-4">
                                        {/* Month/Year Navigation */}
                                        <div className="flex items-center justify-between mb-4">
                                            <button
                                                type="button"
                                                onClick={prevMonth}
                                                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <div className="text-center">
                                                <span className="font-bold text-foreground">{MONTHS_AR[viewMonth]}</span>
                                                <span className="text-muted ml-2">{viewYear}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={nextMonth}
                                                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Day Labels */}
                                        <div className="grid grid-cols-7 gap-1 mb-2">
                                            {DAYS.map((day, i) => (
                                                <div key={i} className="text-center text-xs font-medium text-muted py-1">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Days Grid */}
                                        <div className="grid grid-cols-7 gap-1">
                                            {calendarDays.map((day, i) => (
                                                <div key={i} className="aspect-square">
                                                    {day && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => selectDay(day, e)}
                                                            disabled={isDayDisabled(day)}
                                                            className={cn(
                                                                "w-full h-full rounded-lg text-sm font-medium transition-all",
                                                                isDayDisabled(day)
                                                                    ? "text-gray-300 cursor-not-allowed"
                                                                    : selectedDay === day && viewMonth === (value ? new Date(value).getMonth() : viewMonth)
                                                                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-200"
                                                                        : isToday(day)
                                                                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                                            : "hover:bg-gray-100 text-foreground"
                                                            )}
                                                        >
                                                            {day}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={selectToday}
                                                className="text-xs text-blue-600 font-medium hover:text-blue-700"
                                            >
                                                اليوم
                                            </button>
                                            {!showTime && (
                                                <button
                                                    type="button"
                                                    onClick={confirmSelection}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    تأكيد
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Time Picker View */}
                                {mode === "time" && (
                                    <div className="p-4">
                                        {/* Selected Date Display */}
                                        <div className="text-center mb-4 pb-3 border-b border-gray-100">
                                            <p className="text-sm text-muted">التاريخ المحدد</p>
                                            <p className="font-bold text-foreground">
                                                {selectedDay} {MONTHS_AR[viewMonth]} {viewYear}
                                            </p>
                                        </div>

                                        {/* Time Selectors */}
                                        <div className="flex items-center justify-center gap-4">
                                            {/* Hour (12-hour format) */}
                                            <div className="flex flex-col items-center">
                                                <label className="text-xs text-muted mb-2">الساعة</label>
                                                <select
                                                    value={selectedHour % 12 || 12}
                                                    onChange={(e) => {
                                                        const displayHour = parseInt(e.target.value);
                                                        // Convert 12-hour to 24-hour
                                                        if (selectedHour >= 12) {
                                                            // PM
                                                            setSelectedHour(displayHour === 12 ? 12 : displayHour + 12);
                                                        } else {
                                                            // AM
                                                            setSelectedHour(displayHour === 12 ? 0 : displayHour);
                                                        }
                                                    }}
                                                    className="appearance-none w-20 h-12 text-center text-xl font-bold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => {
                                                        const hour = i === 0 ? 12 : i;
                                                        return (
                                                            <option key={hour} value={hour}>
                                                                {hour}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>

                                            <span className="text-2xl font-bold text-muted mt-6">:</span>

                                            {/* Minute */}
                                            <div className="flex flex-col items-center">
                                                <label className="text-xs text-muted mb-2">الدقيقة</label>
                                                <select
                                                    value={selectedMinute}
                                                    onChange={(e) => setSelectedMinute(parseInt(e.target.value))}
                                                    className="appearance-none w-20 h-12 text-center text-xl font-bold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                                >
                                                    {Array.from({ length: 60 }, (_, i) => (
                                                        <option key={i} value={i}>
                                                            {String(i).padStart(2, '0')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* AM/PM Toggle */}
                                        <div className="flex justify-center gap-2 mt-4">
                                            <button
                                                type="button"
                                                onClick={setAM}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                                    selectedHour < 12
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-gray-100 text-muted hover:bg-gray-200"
                                                )}
                                            >
                                                صباحاً
                                            </button>
                                            <button
                                                type="button"
                                                onClick={setPM}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                                    selectedHour >= 12
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-gray-100 text-muted hover:bg-gray-200"
                                                )}
                                            >
                                                مساءً
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-end gap-2 p-4 bg-[var(--background)] border-t border-[var(--card-border)]">
                                    <DialogPrimitive.Close asChild>
                                        <button
                                            type="button"
                                            className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                                        >
                                            إلغاء
                                        </button>
                                    </DialogPrimitive.Close>
                                    <button
                                        type="button"
                                        onClick={confirmSelection}
                                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-md"
                                    >
                                        <Check className="w-4 h-4" />
                                        تأكيد
                                    </button>
                                </div>
                            </motion.div>
                        </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                )}
            </AnimatePresence>
        </DialogPrimitive.Root>
    );
}
