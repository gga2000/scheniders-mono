"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown } from "lucide-react";

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
}

type QuickRange = "today" | "week" | "month" | "quarter" | "year" | "custom";

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeRange, setActiveRange] = useState<QuickRange>("month");
    const [customStart, setCustomStart] = useState(startDate);
    const [customEnd, setCustomEnd] = useState(endDate);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const getQuickRange = (range: QuickRange): { start: string; end: string } => {
        const now = new Date();
        const today = now.toISOString().split("T")[0];

        switch (range) {
            case "today":
                return { start: today, end: today };
            case "week": {
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - 7);
                return { start: weekStart.toISOString().split("T")[0], end: today };
            }
            case "month": {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                return { start: monthStart.toISOString().split("T")[0], end: today };
            }
            case "quarter": {
                const quarterStart = new Date(now);
                quarterStart.setMonth(now.getMonth() - 3);
                return { start: quarterStart.toISOString().split("T")[0], end: today };
            }
            case "year": {
                const yearStart = new Date(now.getFullYear(), 0, 1);
                return { start: yearStart.toISOString().split("T")[0], end: today };
            }
            default:
                return { start: customStart, end: customEnd };
        }
    };

    const handleQuickRange = (range: QuickRange) => {
        setActiveRange(range);
        if (range !== "custom") {
            const { start, end } = getQuickRange(range);
            onChange(start, end);
            setIsOpen(false);
        }
    };

    const handleCustomApply = () => {
        onChange(customStart, customEnd);
        setIsOpen(false);
    };

    const formatDisplayDate = () => {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (startDate === endDate) {
            return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }

        return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground hover:border-[var(--ink)] transition-all"
            >
                <Calendar className="w-4 h-4 text-muted" />
                <span className="font-medium">{formatDisplayDate()}</span>
                <ChevronDown className={`w-4 h-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 top-full mt-2 z-50 bg-[var(--card-bg)] rounded-2xl shadow-lg border border-[var(--card-border)] overflow-hidden min-w-[300px]"
                    >
                        {/* Quick Ranges */}
                        <div className="p-3 border-b border-[var(--card-border)]">
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { key: "today", label: "Today" },
                                    { key: "week", label: "7 Days" },
                                    { key: "month", label: "This Month" },
                                    { key: "quarter", label: "3 Months" },
                                    { key: "year", label: "This Year" },
                                    { key: "custom", label: "Custom" },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => handleQuickRange(item.key as QuickRange)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeRange === item.key
                                                ? "bg-[var(--ink)] text-white"
                                                : "bg-[var(--background)] text-muted hover:text-foreground"
                                            }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Date Inputs */}
                        {activeRange === "custom" && (
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            value={customStart}
                                            onChange={(e) => setCustomStart(e.target.value)}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted mb-1">End Date</label>
                                        <input
                                            type="date"
                                            value={customEnd}
                                            onChange={(e) => setCustomEnd(e.target.value)}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleCustomApply}
                                    className="w-full px-4 py-2 bg-[var(--ink)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
                                >
                                    Apply Range
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
