"use client";

import { Wallet, Download, Printer } from "lucide-react";
import { motion } from "framer-motion";
import { PeriodPicker } from "./period-picker";
import type { FinancePeriod, PresetKey } from "@/hooks/use-finance-period";

interface PageHeaderProps {
    period: FinancePeriod;
    onApplyPreset: (preset: PresetKey) => void;
    onApplyCustom: (start: Date, end: Date) => void;
    onChangeCompareMode: (mode: FinancePeriod["compareMode"]) => void;
    onExport?: () => void;
    onPrint?: () => void;
}

export function PageHeader({
    period, onApplyPreset, onApplyCustom, onChangeCompareMode, onExport, onPrint,
}: PageHeaderProps) {
    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
        >
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                    <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Finances</h1>
                    <p className="text-[13px] text-muted mt-0.5">Single source of truth for your money</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <PeriodPicker
                    period={period}
                    onApplyPreset={onApplyPreset}
                    onApplyCustom={onApplyCustom}
                    onChangeCompareMode={onChangeCompareMode}
                />
                {onPrint && (
                    <button
                        onClick={onPrint}
                        className="w-10 h-10 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--ink)] transition-colors"
                        title="Print"
                        aria-label="Print"
                    >
                        <Printer className="w-4 h-4" />
                    </button>
                )}
                {onExport && (
                    <button
                        onClick={onExport}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--ink)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                )}
            </div>
        </motion.header>
    );
}
