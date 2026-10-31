"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity,
    Package,
    RefreshCw,
    Edit,
    Printer,
    Trash2,
    UserCheck,
    AlertTriangle,
    LogIn,
    Settings,
    ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { useLanguage } from "@/hooks/use-language";

// Action configuration
const ACTION_CONFIG: Record<string, {
    icon: React.ElementType;
    gradient: string;
    labelKey: string;
}> = {
    "order.create": {
        icon: Package,
        gradient: "from-emerald-500/20 to-emerald-600/10",
        labelKey: "team.timeline.createdOrder",
    },
    "order.status_change": {
        icon: RefreshCw,
        gradient: "from-amber-500/20 to-amber-600/10",
        labelKey: "team.timeline.changedStatus",
    },
    "order.edit": {
        icon: Edit,
        gradient: "from-violet-500/20 to-violet-600/10",
        labelKey: "team.timeline.editedOrder",
    },
    "order.print": {
        icon: Printer,
        gradient: "from-blue-500/20 to-blue-600/10",
        labelKey: "team.timeline.printedOrders",
    },
    "order.delete": {
        icon: Trash2,
        gradient: "from-rose-500/20 to-rose-600/10",
        labelKey: "team.timeline.deletedOrder",
    },
    "order.assign": {
        icon: UserCheck,
        gradient: "from-cyan-500/20 to-cyan-600/10",
        labelKey: "team.timeline.assignedOrder",
    },
    "customer.blacklist": {
        icon: AlertTriangle,
        gradient: "from-red-500/20 to-red-600/10",
        labelKey: "team.timeline.blacklistedCustomer",
    },
    "user.login": {
        icon: LogIn,
        gradient: "from-green-500/20 to-green-600/10",
        labelKey: "team.timeline.loggedIn",
    },
    "settings.update": {
        icon: Settings,
        gradient: "from-slate-500/20 to-slate-600/10",
        labelKey: "team.timeline.updatedSettings",
    },
};

interface TimelineGroup {
    time: string;
    timeLabel: string;
    activities: ActivityLogEntry[];
}

interface ActivityTimelineProps {
    activities: ActivityLogEntry[];
    groupBy?: "hour" | "30min";
    showUserInfo?: boolean;
    maxItems?: number;
    isNew?: (activityId: string) => boolean;
    className?: string;
}

// Timeline Item
function TimelineItem({
    activity,
    isNew = false,
    showUserInfo = true,
    delay = 0,
}: {
    activity: ActivityLogEntry;
    isNew?: boolean;
    showUserInfo?: boolean;
    delay?: number;
}) {
    const { t, language } = useLanguage();
    const config = ACTION_CONFIG[activity.action] || {
        icon: Activity,
        gradient: "from-zinc-500/20 to-zinc-600/10",
        labelKey: activity.action,
    };
    const Icon = config.icon;
    const details = activity.details as Record<string, unknown>;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.3 }}
            className={cn(
                "relative flex gap-3 pb-4",
                isNew && "animate-pulse"
            )}
        >
            {/* Timeline connector */}
            <div className="absolute top-12 bottom-0 right-5 w-px bg-border/50" />

            {/* Icon */}
            <div
                className={cn(
                    "relative z-10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    "bg-gradient-to-br",
                    config.gradient,
                    isNew && "ring-2 ring-primary ring-offset-2"
                )}
            >
                <Icon className="w-5 h-5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 bg-muted/30 rounded-xl p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {showUserInfo && activity.user_email && (
                            <span className="font-semibold text-sm">
                                {activity.user_email.split("@")[0]}
                            </span>
                        )}
                        <span className="text-sm text-foreground">
                            {ACTION_CONFIG[activity.action] ? t(config.labelKey) : config.labelKey}
                        </span>
                        {Boolean(details?.order_id) && (
                            <span className="text-sm font-medium text-primary">
                                #{String(details.order_id)}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(activity.created_at), {
                            addSuffix: true,
                            locale: language === "ar" ? ar : undefined,
                        })}
                    </span>
                </div>

                {/* Status change details */}
                {Boolean(details?.from_status) && Boolean(details?.to_status) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-muted">
                            {String(details.from_status)}
                        </span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {String(details.to_status)}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// Time Marker
function TimeMarker({ label, count }: { label: string; count: number }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted rounded-full">
                {label} ({count})
            </span>
            <div className="h-px flex-1 bg-border" />
        </div>
    );
}

export function ActivityTimeline({
    activities,
    groupBy = "hour",
    showUserInfo = true,
    maxItems = 50,
    isNew,
    className,
}: ActivityTimelineProps) {
    const { t, language } = useLanguage();
    // Group activities by time
    const groups = useMemo(() => {
        const result: TimelineGroup[] = [];
        const groupMap = new Map<string, ActivityLogEntry[]>();

        // Limit activities
        const limitedActivities = activities.slice(0, maxItems);

        limitedActivities.forEach((activity) => {
            const date = new Date(activity.created_at);
            let key: string;

            if (groupBy === "hour") {
                key = `${date.toDateString()}-${date.getHours()}`;
            } else {
                const halfHour = date.getMinutes() < 30 ? "00" : "30";
                key = `${date.toDateString()}-${date.getHours()}-${halfHour}`;
            }

            if (!groupMap.has(key)) {
                groupMap.set(key, []);
            }
            groupMap.get(key)!.push(activity);
        });

        groupMap.forEach((groupActivities, key) => {
            const firstActivity = groupActivities[0];
            const date = new Date(firstActivity.created_at);
            const timeLabel = date.toLocaleTimeString(language === "ar" ? "ar-IQ" : "en-US", {
                hour: "2-digit",
                minute: "2-digit",
            });

            result.push({
                time: key,
                timeLabel,
                activities: groupActivities,
            });
        });

        return result;
    }, [activities, groupBy, maxItems, language]);

    if (activities.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t("team.timeline.empty")}</p>
            </div>
        );
    }

    return (
        <div className={cn("relative", className)}>
            <AnimatePresence>
                {groups.map((group, groupIndex) => (
                    <div key={group.time}>
                        <TimeMarker
                            label={group.timeLabel}
                            count={group.activities.length}
                        />
                        {group.activities.map((activity, activityIndex) => (
                            <TimelineItem
                                key={activity.id}
                                activity={activity}
                                isNew={isNew?.(activity.id)}
                                showUserInfo={showUserInfo}
                                delay={groupIndex * 0.05 + activityIndex * 0.02}
                            />
                        ))}
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}
