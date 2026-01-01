"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Calendar,
    Clock,
    ChevronLeft,
    ChevronRight,
    X,
    Check
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
    value: string | null; // ISO string or null
    onChange: (isoString: string) => void;
    label?: string;
    showTime?: boolean;
    className?: string;
}

const MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const MONTHS_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DateTimePicker({
    value,
    onChange,
    label,
    showTime = true,
    className
}: DateTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<"date" | "time">("date");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

    // Parse the value into a Date object
    const currentDate = value ? new Date(value) : new Date();
    const [viewMonth, setViewMonth] = useState(currentDate.getMonth());
    const [viewYear, setViewYear] = useState(currentDate.getFullYear());
    const [selectedDate, setSelectedDate] = useState(currentDate);
    const [selectedHour, setSelectedHour] = useState(currentDate.getHours());
    const [selectedMinute, setSelectedMinute] = useState(currentDate.getMinutes());

    // Update internal state when value prop changes
    useEffect(() => {
        if (value) {
            const date = new Date(value);
            setSelectedDate(date);
            setViewMonth(date.getMonth());
            setViewYear(date.getFullYear());
            setSelectedHour(date.getHours());
            setSelectedMinute(date.getMinutes());
        }
    }, [value]);

    // Update dropdown position when opened
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const dropdownHeight = 380; // Approximate height of dropdown
            const viewportHeight = window.innerHeight;

            // Check if dropdown would overflow bottom of viewport
            const wouldOverflowBottom = rect.bottom + dropdownHeight > viewportHeight;

            // If it would overflow, position above the trigger instead
            if (wouldOverflowBottom && rect.top > dropdownHeight) {
                // Position above
                setDropdownPosition({
                    top: rect.top - dropdownHeight - 8,
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 330)) // Keep within viewport
                });
            } else {
                // Position below (default)
                setDropdownPosition({
                    top: rect.bottom + 8,
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 330)) // Keep within viewport
                });
            }
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Get days in month
    const getDaysInMonth = (month: number, year: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    // Get first day of month (0 = Sunday)
    const getFirstDayOfMonth = (month: number, year: number) => {
        return new Date(year, month, 1).getDay();
    };

    // Navigate months
    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(viewYear - 1);
        } else {
            setViewMonth(viewMonth - 1);
        }
    };

    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(viewYear + 1);
        } else {
            setViewMonth(viewMonth + 1);
        }
    };

    // Select a day
    const selectDay = (day: number) => {
        const newDate = new Date(viewYear, viewMonth, day, selectedHour, selectedMinute);
        setSelectedDate(newDate);
        if (showTime) {
            setMode("time");
        } else {
            onChange(newDate.toISOString());
            setIsOpen(false);
        }
    };

    // Confirm selection
    const confirmSelection = () => {
        const finalDate = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            selectedHour,
            selectedMinute
        );
        onChange(finalDate.toISOString());
        setIsOpen(false);
    };

    // Quick select today
    const selectToday = () => {
        const now = new Date();
        setViewMonth(now.getMonth());
        setViewYear(now.getFullYear());
        setSelectedDate(now);
        setSelectedHour(now.getHours());
        setSelectedMinute(now.getMinutes());
    };

    // Format display value
    const formatDisplayValue = () => {
        if (!value) return "اختر التاريخ";
        const date = new Date(value);
        const day = date.getDate();
        const month = MONTHS[date.getMonth()];
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

    // Generate calendar grid
    const daysInMonth = getDaysInMonth(viewMonth, viewYear);
    const firstDay = getFirstDayOfMonth(viewMonth, viewYear);
    const days: (number | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        days.push(null);
    }
    // Add actual days
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }

    // Check if a day is today
    const isToday = (day: number) => {
        const today = new Date();
        return day === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();
    };

    // Check if a day is selected
    const isSelected = (day: number) => {
        return day === selectedDate.getDate() &&
            viewMonth === selectedDate.getMonth() &&
            viewYear === selectedDate.getFullYear();
    };

    return (
        <div className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl",
                    "bg-gradient-to-br from-white to-gray-50 border border-gray-200",
                    "hover:border-blue-300 hover:shadow-md transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400",
                    isOpen && "border-blue-400 ring-2 ring-blue-100 shadow-md"
                )}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                        <Calendar className="w-4 h-4 text-white" />
                    </div>
                    <span className={cn(
                        "text-sm font-medium",
                        value ? "text-foreground" : "text-muted"
                    )}>
                        {formatDisplayValue()}
                    </span>
                </div>
                <ChevronRight className={cn(
                    "w-4 h-4 text-muted transition-transform duration-200",
                    isOpen && "rotate-90"
                )} />
            </button>

            {/* Picker Dropdown - Using Portal */}
            {typeof window !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                position: 'fixed',
                                top: dropdownPosition.top,
                                left: dropdownPosition.left,
                            }}
                            className={cn(
                                "z-[9999] w-[320px]",
                                "bg-white rounded-2xl shadow-2xl border border-gray-100",
                                "overflow-hidden"
                            )}
                        >
                            {/* Header Tabs */}
                            {showTime && (
                                <div className="flex border-b border-gray-100">
                                    <button
                                        onClick={() => setMode("date")}
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
                                        onClick={() => setMode("time")}
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

                            {/* Date Picker */}
                            {mode === "date" && (
                                <div className="p-4">
                                    {/* Month/Year Navigation */}
                                    <div className="flex items-center justify-between mb-4">
                                        <button
                                            onClick={prevMonth}
                                            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <div className="text-center">
                                            <span className="font-bold text-foreground">
                                                {MONTHS[viewMonth]}
                                            </span>
                                            <span className="text-muted ml-2">
                                                {viewYear}
                                            </span>
                                        </div>
                                        <button
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
                                        {days.map((day, i) => (
                                            <div key={i} className="aspect-square">
                                                {day && (
                                                    <button
                                                        onClick={() => selectDay(day)}
                                                        className={cn(
                                                            "w-full h-full rounded-lg text-sm font-medium transition-all",
                                                            isSelected(day)
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
                                            onClick={selectToday}
                                            className="text-xs text-blue-600 font-medium hover:text-blue-700"
                                        >
                                            اليوم
                                        </button>
                                        {!showTime && (
                                            <button
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

                            {/* Time Picker */}
                            {mode === "time" && (
                                <div className="p-4">
                                    {/* Selected Date Display */}
                                    <div className="text-center mb-4 pb-3 border-b border-gray-100">
                                        <p className="text-sm text-muted">التاريخ المحدد</p>
                                        <p className="font-bold text-foreground">
                                            {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                                        </p>
                                    </div>

                                    {/* Time Selectors */}
                                    <div className="flex items-center justify-center gap-4">
                                        {/* Hour Selector */}
                                        <div className="flex flex-col items-center">
                                            <label className="text-xs text-muted mb-2">الساعة</label>
                                            <div className="relative">
                                                <select
                                                    value={selectedHour}
                                                    onChange={(e) => setSelectedHour(parseInt(e.target.value))}
                                                    className="appearance-none w-20 h-12 text-center text-xl font-bold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                                >
                                                    {Array.from({ length: 24 }, (_, i) => (
                                                        <option key={i} value={i}>
                                                            {String(i).padStart(2, '0')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <span className="text-2xl font-bold text-muted mt-6">:</span>

                                        {/* Minute Selector */}
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

                                    {/* AM/PM Display */}
                                    <div className="flex justify-center gap-2 mt-4">
                                        <button
                                            onClick={() => {
                                                if (selectedHour >= 12) setSelectedHour(selectedHour - 12);
                                            }}
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
                                            onClick={() => {
                                                if (selectedHour < 12) setSelectedHour(selectedHour + 12);
                                            }}
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

                                    {/* Confirm Button */}
                                    <button
                                        onClick={confirmSelection}
                                        className="w-full mt-6 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-200"
                                    >
                                        <Check className="w-4 h-4" />
                                        تأكيد الوقت والتاريخ
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
