"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Flame,
    Sparkles,
    Calendar,
    ChevronRight,
    Settings2,
    Trophy,
    Zap,
    Crown,
    Star,
    Rocket,
    Clock,
    Eye,
    EyeOff,
    Layers,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EraMode, EpochMilestone } from "@/hooks/use-financial-epoch";

// =============================================
// PROPS
// =============================================

interface EpochBannerProps {
    // Epoch state
    isEpochSet: boolean;
    epochDate: string | null;
    streakDays: number;
    currentMilestone: EpochMilestone | null;
    nextMilestone: EpochMilestone | null;
    milestoneProgress: number;

    // Era mode
    eraMode: EraMode;
    onEraModeChange: (mode: EraMode) => void;

    // Actions
    onSetEpoch: (date: string) => void;
    isUpdating: boolean;
}

// =============================================
// MILESTONE ICON MAP
// =============================================

function getMilestoneIcon(emoji: string) {
    switch (emoji) {
        case "🔥": return Flame;
        case "⚡": return Zap;
        case "🏆": return Trophy;
        case "🚀": return Rocket;
        case "⭐": return Star;
        case "👑": return Crown;
        default: return Sparkles;
    }
}

// =============================================
// SETUP STATE (no epoch configured)
// =============================================

function EpochSetupState({
    onSetEpoch,
    isUpdating,
}: {
    onSetEpoch: (date: string) => void;
    isUpdating: boolean;
}) {
    const [selectedDate, setSelectedDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl"
        >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />

            {/* Floating particles */}
            <motion.div
                className="absolute top-4 right-12 w-2 h-2 rounded-full bg-white/20"
                animate={{ y: [-5, 5, -5], opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 3, repeat: Infinity }}
            />
            <motion.div
                className="absolute top-8 right-24 w-1.5 h-1.5 rounded-full bg-white/15"
                animate={{ y: [5, -5, 5], opacity: [0.15, 0.4, 0.15] }}
                transition={{ duration: 4, repeat: Infinity, delay: 1 }}
            />
            <motion.div
                className="absolute bottom-6 right-16 w-1 h-1 rounded-full bg-white/25"
                animate={{ y: [-3, 3, -3], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
            />

            {/* Content */}
            <div className="relative z-10 px-6 py-8 md:px-8 md:py-10">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    {/* Left — Text */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <motion.div
                                animate={{ rotate: [0, 15, -15, 0] }}
                                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                            >
                                <Sparkles className="w-5 h-5 text-amber-300" />
                            </motion.div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                                Financial Epoch
                            </span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                            Start Your Financial Era
                        </h2>
                        <p className="text-indigo-200 text-sm md:text-base max-w-lg leading-relaxed">
                            Set a &ldquo;Day Zero&rdquo; to separate old, incomplete data from your new, accurate financial tracking.
                            Your dashboard will default to showing only clean data from this date forward.
                        </p>
                    </div>

                    {/* Right — Action */}
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-indigo-200 font-medium">Pick Your Day Zero</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 [color-scheme:dark]"
                            />
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onSetEpoch(selectedDate)}
                            disabled={isUpdating}
                            className="mt-5 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-gray-900 font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all disabled:opacity-50"
                        >
                            {isUpdating ? (
                                <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                            ) : (
                                <Rocket className="w-4 h-4" />
                            )}
                            Set Day Zero
                        </motion.button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// =============================================
// ACTIVE STATE (epoch is set)
// =============================================

function EpochActiveState({
    epochDate,
    streakDays,
    currentMilestone,
    nextMilestone,
    milestoneProgress,
    eraMode,
    onEraModeChange,
}: {
    epochDate: string;
    streakDays: number;
    currentMilestone: EpochMilestone | null;
    nextMilestone: EpochMilestone | null;
    milestoneProgress: number;
    eraMode: EraMode;
    onEraModeChange: (mode: EraMode) => void;
}) {
    const [showDetails, setShowDetails] = useState(false);
    const MilestoneIcon = currentMilestone ? getMilestoneIcon(currentMilestone.emoji) : Sparkles;

    const eraModes: { id: EraMode; label: string; icon: typeof Eye; description: string }[] = [
        { id: "clean", label: "Clean Era", icon: Sparkles, description: "Only accurate data" },
        { id: "legacy", label: "Legacy", icon: Clock, description: "Pre-epoch data" },
        { id: "combined", label: "Combined", icon: Layers, description: "All data" },
    ];

    const formattedEpochDate = new Date(epochDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl"
        >
            {/* Subtle gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--card-bg)] via-[var(--card-bg)] to-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl" />
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b from-violet-500 via-indigo-500 to-blue-500" />

            {/* Content */}
            <div className="relative z-10 px-5 py-4 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Left — Streak Counter */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Streak badge */}
                        <div className="relative">
                            <motion.div
                                className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20"
                                animate={streakDays > 0 ? { scale: [1, 1.05, 1] } : {}}
                                transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
                            >
                                <Flame className="w-6 h-6 text-white" />
                            </motion.div>
                            {currentMilestone && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center border-2 border-[var(--card-bg)]"
                                >
                                    <MilestoneIcon className="w-3 h-3 text-white" />
                                </motion.div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-baseline gap-1.5">
                                <motion.span
                                    key={streakDays}
                                    initial={{ y: -10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="text-2xl font-bold text-foreground tabular-nums"
                                >
                                    {streakDays}
                                </motion.span>
                                <span className="text-sm text-muted font-medium">
                                    {streakDays === 1 ? "day" : "days"}
                                </span>
                            </div>
                            {currentMilestone && (
                                <p className="text-xs text-muted">
                                    {currentMilestone.emoji} {currentMilestone.label}
                                </p>
                            )}
                        </div>

                        {/* Mini progress bar to next milestone */}
                        {nextMilestone && (
                            <div className="hidden md:flex flex-col gap-1 min-w-[100px]">
                                <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${milestoneProgress}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                                    />
                                </div>
                                <p className="text-[10px] text-muted">
                                    {nextMilestone.days - streakDays}d to {nextMilestone.emoji} {nextMilestone.label}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="hidden md:block w-px h-10 bg-[var(--card-border)]" />

                    {/* Center — Era Mode Toggle */}
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex bg-[var(--background)] rounded-xl p-1 gap-1 border border-[var(--card-border)]">
                            {eraModes.map((mode) => {
                                const Icon = mode.icon;
                                const isActive = eraMode === mode.id;
                                return (
                                    <motion.button
                                        key={mode.id}
                                        onClick={() => onEraModeChange(mode.id)}
                                        whileTap={{ scale: 0.97 }}
                                        className={cn(
                                            "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                            isActive
                                                ? "text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="era-mode-bg"
                                                className={cn(
                                                    "absolute inset-0 rounded-lg shadow-sm",
                                                    mode.id === "clean" && "bg-gradient-to-r from-emerald-500 to-green-600",
                                                    mode.id === "legacy" && "bg-gradient-to-r from-amber-500 to-orange-500",
                                                    mode.id === "combined" && "bg-gradient-to-r from-indigo-500 to-violet-600",
                                                )}
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                            />
                                        )}
                                        <span className="relative z-10 flex items-center gap-1.5">
                                            <Icon className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{mode.label}</span>
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right — Epoch Info */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                            <p className="text-xs text-muted">Day Zero</p>
                            <p className="text-sm font-semibold text-foreground">{formattedEpochDate}</p>
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-muted" />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function EpochBanner({
    isEpochSet,
    epochDate,
    streakDays,
    currentMilestone,
    nextMilestone,
    milestoneProgress,
    eraMode,
    onEraModeChange,
    onSetEpoch,
    isUpdating,
}: EpochBannerProps) {
    return (
        <AnimatePresence mode="wait">
            {!isEpochSet ? (
                <EpochSetupState
                    key="setup"
                    onSetEpoch={onSetEpoch}
                    isUpdating={isUpdating}
                />
            ) : (
                <EpochActiveState
                    key="active"
                    epochDate={epochDate!}
                    streakDays={streakDays}
                    currentMilestone={currentMilestone}
                    nextMilestone={nextMilestone}
                    milestoneProgress={milestoneProgress}
                    eraMode={eraMode}
                    onEraModeChange={onEraModeChange}
                />
            )}
        </AnimatePresence>
    );
}
