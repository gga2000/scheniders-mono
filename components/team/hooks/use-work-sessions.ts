"use client";

import { useMemo } from "react";
import { ActivityLogEntry } from "@/lib/activity-logger";

// Types
export interface WorkSession {
    id: string;
    userId: string;
    userEmail: string | null;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    activityCount: number;
    activities: ActivityLogEntry[];
}

export interface DailyWorkSummary {
    date: string; // YYYY-MM-DD
    sessions: WorkSession[];
    totalMinutes: number;
    totalActivities: number;
}

export interface WorkSessionStats {
    sessions: WorkSession[];
    dailySummaries: DailyWorkSummary[];
    totalHours: number;
    averageSessionMinutes: number;
    longestSessionMinutes: number;
    totalSessions: number;
    averageActivitiesPerSession: number;
}

interface UseWorkSessionsOptions {
    /** Inactivity gap in minutes to end a session (default: 30) */
    inactivityThresholdMinutes?: number;
}

/**
 * Hook to calculate work sessions from activity logs
 * Handles variable schedules - employees may work any time of day
 * 
 * A session ends when there's an inactivity gap longer than the threshold
 */
export function useWorkSessions(
    activities: ActivityLogEntry[],
    userId?: string,
    options: UseWorkSessionsOptions = {}
): WorkSessionStats {
    const { inactivityThresholdMinutes = 30 } = options;
    const thresholdMs = inactivityThresholdMinutes * 60 * 1000;

    return useMemo(() => {
        // Filter activities for specific user if provided
        const userActivities = userId
            ? activities.filter(a => a.user_id === userId)
            : activities;

        // Sort by time (oldest first)
        const sorted = [...userActivities].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        if (sorted.length === 0) {
            return {
                sessions: [],
                dailySummaries: [],
                totalHours: 0,
                averageSessionMinutes: 0,
                longestSessionMinutes: 0,
                totalSessions: 0,
                averageActivitiesPerSession: 0,
            };
        }

        const sessions: WorkSession[] = [];
        let currentSession: {
            startTime: Date;
            endTime: Date;
            activities: ActivityLogEntry[];
        } | null = null;

        for (const activity of sorted) {
            const activityTime = new Date(activity.created_at);

            if (!currentSession) {
                // Start a new session
                currentSession = {
                    startTime: activityTime,
                    endTime: activityTime,
                    activities: [activity],
                };
            } else {
                const gap = activityTime.getTime() - currentSession.endTime.getTime();

                if (gap > thresholdMs) {
                    // End current session and start new one
                    const durationMinutes = Math.round(
                        (currentSession.endTime.getTime() - currentSession.startTime.getTime()) / 60000
                    );

                    // Minimum session duration is 1 minute (for single-activity sessions)
                    sessions.push({
                        id: `session-${sessions.length}`,
                        userId: currentSession.activities[0].user_id || "",
                        userEmail: currentSession.activities[0].user_email,
                        startTime: currentSession.startTime,
                        endTime: currentSession.endTime,
                        durationMinutes: Math.max(1, durationMinutes),
                        activityCount: currentSession.activities.length,
                        activities: currentSession.activities,
                    });

                    // Start new session
                    currentSession = {
                        startTime: activityTime,
                        endTime: activityTime,
                        activities: [activity],
                    };
                } else {
                    // Continue current session
                    currentSession.endTime = activityTime;
                    currentSession.activities.push(activity);
                }
            }
        }

        // Don't forget the last session
        if (currentSession) {
            const durationMinutes = Math.round(
                (currentSession.endTime.getTime() - currentSession.startTime.getTime()) / 60000
            );

            sessions.push({
                id: `session-${sessions.length}`,
                userId: currentSession.activities[0].user_id || "",
                userEmail: currentSession.activities[0].user_email,
                startTime: currentSession.startTime,
                endTime: currentSession.endTime,
                durationMinutes: Math.max(1, durationMinutes),
                activityCount: currentSession.activities.length,
                activities: currentSession.activities,
            });
        }

        // Group sessions by day
        const dailyMap = new Map<string, WorkSession[]>();
        for (const session of sessions) {
            const dateKey = session.startTime.toISOString().split("T")[0];
            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, []);
            }
            dailyMap.get(dateKey)!.push(session);
        }

        const dailySummaries: DailyWorkSummary[] = Array.from(dailyMap.entries())
            .map(([date, daySessions]) => ({
                date,
                sessions: daySessions,
                totalMinutes: daySessions.reduce((sum, s) => sum + s.durationMinutes, 0),
                totalActivities: daySessions.reduce((sum, s) => sum + s.activityCount, 0),
            }))
            .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first

        // Calculate stats
        const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const totalActivities = sessions.reduce((sum, s) => sum + s.activityCount, 0);
        const longestSession = Math.max(...sessions.map(s => s.durationMinutes), 0);

        return {
            sessions,
            dailySummaries,
            totalHours: Math.round((totalMinutes / 60) * 10) / 10, // 1 decimal place
            averageSessionMinutes: sessions.length > 0
                ? Math.round(totalMinutes / sessions.length)
                : 0,
            longestSessionMinutes: longestSession,
            totalSessions: sessions.length,
            averageActivitiesPerSession: sessions.length > 0
                ? Math.round(totalActivities / sessions.length)
                : 0,
        };
    }, [activities, userId, thresholdMs]);
}

/**
 * Format session duration for display
 */
export function formatSessionDuration(minutes: number): string {
    if (minutes < 60) {
        return `${minutes} دقيقة`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
        return `${hours} ساعة`;
    }
    return `${hours} ساعة و ${remainingMinutes} دقيقة`;
}

/**
 * Get session time range string
 */
export function formatSessionTimeRange(session: WorkSession): string {
    const startTime = session.startTime.toLocaleTimeString("ar-IQ", {
        hour: "2-digit",
        minute: "2-digit",
    });
    const endTime = session.endTime.toLocaleTimeString("ar-IQ", {
        hour: "2-digit",
        minute: "2-digit",
    });
    return `${startTime} - ${endTime}`;
}
