"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSettings } from "./use-settings";

// =============================================
// TYPES
// =============================================

export interface FinancialEpochData {
    epoch_date: string;      // YYYY-MM-DD
    set_at: string;          // ISO timestamp
    notes?: string;
}

export type EraMode = "clean" | "legacy" | "combined";

export interface EpochMilestone {
    days: number;
    label: string;
    emoji: string;
}

const MILESTONES: EpochMilestone[] = [
    { days: 1, label: "Day One", emoji: "🌱" },
    { days: 7, label: "One Week", emoji: "🔥" },
    { days: 14, label: "Two Weeks", emoji: "⚡" },
    { days: 30, label: "One Month", emoji: "🏆" },
    { days: 60, label: "Two Months", emoji: "💎" },
    { days: 90, label: "Quarter", emoji: "🚀" },
    { days: 180, label: "Half Year", emoji: "⭐" },
    { days: 365, label: "One Year", emoji: "👑" },
];

// =============================================
// HOOK
// =============================================

export function useFinancialEpoch() {
    const { get, updateSetting, loading: settingsLoading } = useSettings();
    const [isUpdating, setIsUpdating] = useState(false);

    // Read epoch data from settings
    const epochData = useMemo((): FinancialEpochData | null => {
        const raw = get("financial_epoch");
        if (!raw || !raw.epoch_date) return null;
        return raw as FinancialEpochData;
    }, [get]);

    const epochDate = epochData?.epoch_date ?? null;
    const isEpochSet = !!epochDate;
    const epochSetAt = epochData?.set_at ?? null;

    // =============================================
    // STREAK CALCULATION
    // =============================================

    const streakDays = useMemo((): number => {
        if (!epochDate) return 0;

        const epoch = new Date(epochDate + "T00:00:00");
        const now = new Date();
        // Reset to start of day in local timezone
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const epochDay = new Date(epoch.getFullYear(), epoch.getMonth(), epoch.getDate());

        const diffMs = today.getTime() - epochDay.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Day 1 is the epoch date itself
        return Math.max(diffDays + 1, 1);
    }, [epochDate]);

    // =============================================
    // MILESTONES
    // =============================================

    const currentMilestone = useMemo((): EpochMilestone | null => {
        if (!isEpochSet || streakDays <= 0) return null;

        // Find the highest achieved milestone
        let achieved: EpochMilestone | null = null;
        for (const milestone of MILESTONES) {
            if (streakDays >= milestone.days) {
                achieved = milestone;
            }
        }
        return achieved;
    }, [isEpochSet, streakDays]);

    const nextMilestone = useMemo((): EpochMilestone | null => {
        if (!isEpochSet) return null;

        for (const milestone of MILESTONES) {
            if (streakDays < milestone.days) {
                return milestone;
            }
        }
        return null;
    }, [isEpochSet, streakDays]);

    const milestoneProgress = useMemo((): number => {
        if (!nextMilestone || !currentMilestone) {
            if (nextMilestone) {
                // No current milestone yet, progress from 0
                return (streakDays / nextMilestone.days) * 100;
            }
            return 100; // All milestones achieved
        }
        const range = nextMilestone.days - currentMilestone.days;
        const progress = streakDays - currentMilestone.days;
        return Math.min((progress / range) * 100, 100);
    }, [streakDays, currentMilestone, nextMilestone]);

    // =============================================
    // HELPERS
    // =============================================

    /**
     * Check if a given date string (YYYY-MM-DD) falls within the clean era
     */
    const isInCleanEra = useCallback((dateStr: string): boolean => {
        if (!epochDate) return true; // No epoch = everything is "clean"
        return dateStr >= epochDate;
    }, [epochDate]);

    /**
     * Get the date range for a given era mode
     * Returns { startDate, endDate } — empty strings mean "no filter"
     */
    const getEraDateRange = useCallback((mode: EraMode): { startDate: string; endDate: string } => {
        if (!epochDate) return { startDate: "", endDate: "" };

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        switch (mode) {
            case "clean":
                return { startDate: epochDate, endDate: todayStr };
            case "legacy": {
                // Day before epoch
                const epochDt = new Date(epochDate + "T00:00:00");
                epochDt.setDate(epochDt.getDate() - 1);
                const beforeEpoch = `${epochDt.getFullYear()}-${String(epochDt.getMonth() + 1).padStart(2, "0")}-${String(epochDt.getDate()).padStart(2, "0")}`;
                return { startDate: "", endDate: beforeEpoch };
            }
            case "combined":
                return { startDate: "", endDate: "" };
        }
    }, [epochDate]);

    // =============================================
    // SETTERS
    // =============================================

    const setEpochDate = useCallback(async (date: string, notes?: string) => {
        setIsUpdating(true);
        try {
            const data: FinancialEpochData = {
                epoch_date: date,
                set_at: new Date().toISOString(),
                notes: notes || "Financial tracking epoch set",
            };
            await updateSetting("financial_epoch", data);
        } finally {
            setIsUpdating(false);
        }
    }, [updateSetting]);

    const clearEpoch = useCallback(async () => {
        setIsUpdating(true);
        try {
            await updateSetting("financial_epoch", {});
        } finally {
            setIsUpdating(false);
        }
    }, [updateSetting]);

    return {
        // State
        epochDate,
        isEpochSet,
        epochSetAt,
        epochData,

        // Streak
        streakDays,
        currentMilestone,
        nextMilestone,
        milestoneProgress,

        // Helpers
        isInCleanEra,
        getEraDateRange,

        // Actions
        setEpochDate,
        clearEpoch,

        // Loading
        loading: settingsLoading,
        isUpdating,

        // Constants
        milestones: MILESTONES,
    };
}
