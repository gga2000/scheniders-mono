"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, Check, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinancePeriod, PresetKey } from "@/hooks/use-finance-period";
import { useLanguage } from "@/hooks/use-language";
import { baghdadDayKey } from "@/lib/order-window";

interface PeriodPickerProps {
    period: FinancePeriod;
    onApplyPreset: (preset: PresetKey) => void;
    onApplyCustom: (start: Date, end: Date) => void;
    onChangeCompareMode: (mode: FinancePeriod["compareMode"]) => void;
}

const PRESETS: PresetKey[] = ["today", "yesterday", "last7", "last30", "mtd", "ytd"];

export function PeriodPicker({ period, onApplyPreset, onApplyCustom, onChangeCompareMode }: PeriodPickerProps) {
    const { t, language } = useLanguage();
    const [open, setOpen] = useState(false);
    const [start, setStart] = useState(formatISO(period.start));
    const [end, setEnd] = useState(formatISO(period.end));
    const [customError, setCustomError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const today = formatISO(new Date());

    useEffect(() => {
        setStart(formatISO(period.start));
        setEnd(formatISO(period.end));
        setCustomError(null);
    }, [period.start, period.end]);

    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    const label = formatRangeLabel(period, t, language === "ar" ? "ar-IQ-u-nu-latn" : "en-US");

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--ink)] transition-colors"
            >
                <Calendar className="w-4 h-4 text-muted" />
                <span className="text-[13px] font-medium text-foreground whitespace-nowrap">{label}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted transition-transform", open && "rotate-180")} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-2 z-40 w-[340px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl overflow-hidden"
                    >
                        <div className="p-2 border-b border-[var(--card-border)]">
                            <div className="grid grid-cols-2 gap-1">
                                {PRESETS.map((key) => {
                                    const active = period.preset === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => { onApplyPreset(key); setOpen(false); }}
                                            className={cn(
                                                "flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors",
                                                active
                                                    ? "bg-[var(--ink)] text-white"
                                                    : "text-foreground hover:bg-[var(--background)]"
                                            )}
                                        >
                                            {t(`finances.period.${key}`)}
                                            {active && <Check className="w-3 h-3" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-3 border-b border-[var(--card-border)] space-y-2">
                            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t("finances.period.custom")}</div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={start}
                                    max={today}
                                    onChange={(e) => setStart(e.target.value)}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-[12px] text-foreground outline-none focus:border-[var(--ink)]"
                                />
                                <span className="text-muted text-xs">{t("finances.period.to")}</span>
                                <input
                                    type="date"
                                    value={end}
                                    max={today}
                                    onChange={(e) => setEnd(e.target.value)}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-[12px] text-foreground outline-none focus:border-[var(--ink)]"
                                />
                            </div>
                            {customError && (
                                <div className="text-[11px] text-rose-600 dark:text-rose-400">{customError}</div>
                            )}
                            <button
                                onClick={() => {
                                    const s = new Date(start);
                                    const e = new Date(end);
                                    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
                                        setCustomError(t("finances.period.errInvalid"));
                                        return;
                                    }
                                    if (s > e) {
                                        setCustomError(t("finances.period.errOrder"));
                                        return;
                                    }
                                    const now = new Date();
                                    now.setHours(23, 59, 59, 999);
                                    if (s > now || e > now) {
                                        setCustomError(t("finances.period.errFuture"));
                                        return;
                                    }
                                    setCustomError(null);
                                    onApplyCustom(s, e);
                                    setOpen(false);
                                }}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--ink)] text-white text-[12px] font-medium hover:opacity-90"
                            >
                                {t("finances.period.apply")}
                            </button>
                        </div>

                        <div className="p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <ArrowLeftRight className="w-3 h-3 text-muted" />
                                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t("finances.period.compare")}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                                {(["previous", "yoy", "none"] as const).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => onChangeCompareMode(m)}
                                        className={cn(
                                            "px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                                            period.compareMode === m
                                                ? "bg-[var(--ink)] text-white"
                                                : "text-foreground hover:bg-[var(--background)] border border-[var(--card-border)]"
                                        )}
                                    >
                                        {t(`finances.period.compare.${m}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function formatISO(d: Date): string {
    return baghdadDayKey(d);
}

function formatRangeLabel(
    p: FinancePeriod,
    t: (key: string) => string,
    locale: string,
): string {
    // Baghdad days, whatever the browser's own timezone.
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "Asia/Baghdad" };
    const startYear = baghdadDayKey(p.start).slice(0, 4);
    const endYear = baghdadDayKey(p.end).slice(0, 4);
    const sameYear = startYear === endYear;
    const s = p.start.toLocaleDateString(locale, opts);
    const e = p.end.toLocaleDateString(locale, opts);
    if (p.preset === "today") return t("finances.period.today");
    if (p.preset === "yesterday") return t("finances.period.yesterday");
    return sameYear ? `${s} – ${e}` : `${s}, ${startYear} – ${e}, ${endYear}`;
}
