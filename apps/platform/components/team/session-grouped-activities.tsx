"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkSession, formatSessionDuration, formatSessionTimeRange } from "./hooks/use-work-sessions";
import { ActivityTimeline } from "./activity-timeline";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";

interface SessionGroupedActivitiesProps {
    sessions: WorkSession[];
    maxSessions?: number;
    className?: string;
}

// Session Card
function SessionCard({
    session,
    isExpanded,
    onToggle,
    delay = 0,
    t,
    language,
}: {
    session: WorkSession;
    isExpanded: boolean;
    onToggle: () => void;
    delay?: number;
    t: ReturnType<typeof useLanguage>["t"];
    language: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="rounded-2xl border border-[#E8E4DC] dark:border-white/10 overflow-hidden bg-white dark:bg-[#1A1A1A]"
        >
            {/* Session Header */}
            <button
                onClick={onToggle}
                className={cn(
                    "w-full flex items-center justify-between p-4",
                    "hover:bg-muted/30 transition-colors",
                    isExpanded && "bg-muted/20"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#F5F0E8] dark:bg-white/10 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-[#6B6B6B] dark:text-gray-300" aria-hidden="true" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-foreground">
                            {formatSessionTimeRange(session, language)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {new Date(session.startTime).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Session stats */}
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-primary" />
                            <span className="font-medium">{session.activityCount}</span>
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-muted">
                            <span className="text-xs font-medium text-muted-foreground">
                                {formatSessionDuration(session.durationMinutes, t)}
                            </span>
                        </div>
                    </div>

                    {/* Toggle icon */}
                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                </div>
            </button>

            {/* Session Activities */}
            {isExpanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border/50"
                >
                    <div className="p-4 max-h-80 overflow-y-auto">
                        <ActivityTimeline
                            activities={session.activities}
                            showUserInfo={false}
                            groupBy="30min"
                        />
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}

export function SessionGroupedActivities({
    sessions,
    maxSessions = 10,
    className,
}: SessionGroupedActivitiesProps) {
    const { t, language } = useLanguage();
    const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

    // Limit sessions
    const displayedSessions = useMemo(() => {
        return sessions.slice(0, maxSessions);
    }, [sessions, maxSessions]);

    // Toggle session expansion
    const toggleSession = (sessionId: string) => {
        setExpandedSessions((prev) => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                next.delete(sessionId);
            } else {
                next.add(sessionId);
            }
            return next;
        });
    };

    if (sessions.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t("team.sessions.empty")}</p>
            </div>
        );
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Sessions List */}
            <div className="space-y-3">
                {displayedSessions.map((session, index) => (
                    <SessionCard
                        key={session.id}
                        session={session}
                        isExpanded={expandedSessions.has(session.id)}
                        onToggle={() => toggleSession(session.id)}
                        delay={index * 0.05}
                        t={t}
                        language={language}
                    />
                ))}
            </div>

            {/* Show more indicator */}
            {sessions.length > maxSessions && (
                <p className="text-center text-sm text-muted-foreground">
                    {t("team.sessions.moreSessions", { count: (sessions.length - maxSessions).toString() })}
                </p>
            )}
        </div>
    );
}
