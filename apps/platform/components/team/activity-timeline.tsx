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
    Bot,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { useLanguage } from "@/hooks/use-language";
import { PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";

// Action configuration
const ACTION_CONFIG: Record<string, {
    icon: React.ElementType;
    tone: string;
    labelKey: string;
}> = {
    "order.create": {
        icon: Package,
        tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        labelKey: "team.timeline.createdOrder",
    },
    "order.status_change": {
        icon: RefreshCw,
        tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        labelKey: "team.timeline.changedStatus",
    },
    "order.edit": {
        icon: Edit,
        tone: "bg-stone-100 text-stone-700 dark:bg-white/10 dark:text-gray-300",
        labelKey: "team.timeline.editedOrder",
    },
    "order.print": {
        icon: Printer,
        tone: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
        labelKey: "team.timeline.printedOrders",
    },
    "order.delete": {
        icon: Trash2,
        tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
        labelKey: "team.timeline.deletedOrder",
    },
    "order.assign": {
        icon: UserCheck,
        tone: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
        labelKey: "team.timeline.assignedOrder",
    },
    "customer.blacklist": {
        icon: AlertTriangle,
        tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        labelKey: "team.timeline.blacklistedCustomer",
    },
    "user.login": {
        icon: LogIn,
        tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        labelKey: "team.timeline.loggedIn",
    },
    "mcp.tool_call": {
        icon: Bot,
        tone: "bg-stone-100 text-stone-700 dark:bg-white/10 dark:text-gray-300",
        labelKey: "team.timeline.mcpToolCall",
    },
    "settings.update": {
        icon: Settings,
        tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-300",
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
    /** Name to show for the actor; defaults to the email's local part. */
    resolveName?: (activity: ActivityLogEntry) => string | null;
    className?: string;
}

function statusLabel(status: unknown, t: (key: string) => string): string {
    const id = String(status);
    const meta = (PIPELINE_STAGE_REGISTRY as Record<string, { labelKey: string } | undefined>)[id];
    return meta ? t(meta.labelKey) : id;
}

/** Fallback when the caller has no roster to resolve names: the part of the email before "@". */
function emailName(activity: ActivityLogEntry): string | null {
    return activity.user_email ? activity.user_email.split("@")[0] : null;
}

// Timeline Item
function TimelineItem({
    activity,
    isNew = false,
    showUserInfo = true,
    resolveName,
    delay = 0,
}: {
    activity: ActivityLogEntry;
    isNew?: boolean;
    showUserInfo?: boolean;
    resolveName: (activity: ActivityLogEntry) => string | null;
    delay?: number;
}) {
    const { t, language } = useLanguage();
    const config = ACTION_CONFIG[activity.action] || {
        icon: Activity,
        tone: "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-gray-300",
        labelKey: activity.action,
    };
    const Icon = config.icon;
    const details = activity.details as Record<string, unknown>;
    const name = showUserInfo ? resolveName(activity) : null;
    // Claude tool ids (e.g. sales_summary) read as words in the reader's language; unknown ids stay as sent.
    const toolLabel = (tool: string) => (tool ? t(`team.timeline.tool.${tool}`, tool) : tool);
    const label = ACTION_CONFIG[activity.action]
        ? t(config.labelKey, activity.action === "mcp.tool_call" ? { tool: toolLabel(String(details?.tool ?? "")) } : undefined)
        : activity.action;
    const reason = typeof details?.reason === "string" && details.reason.trim() ? details.reason : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.2 }}
            className="relative flex gap-3 pb-4 last:pb-2 group/item"
        >
            {/* Connector to the next item in the same hour */}
            <div className="absolute top-9 bottom-0 left-4 w-px bg-[#F0ECE4] dark:bg-white/5 group-last/item:hidden" aria-hidden="true" />

            <div
                className={cn(
                    "relative z-10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    config.tone,
                    isNew && "ring-2 ring-emerald-500/60",
                )}
            >
                <Icon className="w-4 h-4" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-snug text-[#1E1E1E] dark:text-gray-100 min-w-0">
                        {name && <><bdi className="font-semibold">{name}</bdi>{" "}</>}
                        <span className="text-[#4A4A4A] dark:text-gray-300">{label}</span>
                        {Boolean(details?.order_id) && (
                            <>{" "}<bdi dir="ltr" className="font-medium tabular-nums">#{String(details.order_id)}</bdi></>
                        )}
                    </p>
                    <time dateTime={activity.created_at} className="text-[11px] text-[#9A9A9A] dark:text-gray-500 shrink-0 pt-0.5 whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.created_at), {
                            addSuffix: true,
                            locale: language === "ar" ? ar : undefined,
                        })}
                    </time>
                </div>

                {Boolean(details?.from_status) && Boolean(details?.to_status) && (
                    <div className="flex items-center gap-1.5 text-xs mt-1.5">
                        <span className="px-1.5 py-0.5 rounded-md bg-[#F5F0E8] dark:bg-white/10 text-[#6B6B6B] dark:text-gray-400">
                            {statusLabel(details.from_status, t)}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[#9A9A9A]" aria-hidden="true" />
                        <span className="px-1.5 py-0.5 rounded-md bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] font-medium">
                            {statusLabel(details.to_status, t)}
                        </span>
                    </div>
                )}
                {reason && <p className="mt-1 text-xs text-[#6B6B6B] dark:text-gray-400 truncate">{reason}</p>}
            </div>
        </motion.div>
    );
}

// Time Marker
function TimeMarker({ label, count }: { label: string; count: number }) {
    return (
        <div className="flex items-center justify-between gap-2 mb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A] dark:text-gray-500">
            <span className="tabular-nums">{label}</span>
            <span className="tabular-nums">{count}</span>
        </div>
    );
}

export function ActivityTimeline({
    activities,
    groupBy = "hour",
    showUserInfo = true,
    maxItems = 50,
    isNew,
    resolveName = emailName,
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
            const bucket = new Date(groupActivities[0].created_at);
            if (groupBy === "hour") bucket.setMinutes(0, 0, 0);
            else bucket.setMinutes(bucket.getMinutes() < 30 ? 0 : 30, 0, 0);
            const timeLabel = bucket.toLocaleTimeString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
                hour: "numeric",
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
                                resolveName={resolveName}
                                delay={groupIndex * 0.05 + activityIndex * 0.02}
                            />
                        ))}
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}
