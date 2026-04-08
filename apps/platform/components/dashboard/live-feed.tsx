"use client";

import { formatDistanceToNow } from "date-fns";
import { Activity, TrendingUp, ChevronRight } from "lucide-react";

interface ActivityItem {
    id: string;
    user: string;
    orderId: string;
    status: string;
    timestamp: Date;
}

// Mock data for demonstration - in production, this would come from a real-time data source
const mockActivities: ActivityItem[] = [
    {
        id: "1",
        user: "Ahmed",
        orderId: "ORD-001",
        status: "confirmed",
        timestamp: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    },
    {
        id: "2",
        user: "Fatima",
        orderId: "ORD-002",
        status: "delivered",
        timestamp: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
    },
    {
        id: "3",
        user: "Ali",
        orderId: "ORD-003",
        status: "rejected",
        timestamp: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
    },
    {
        id: "4",
        user: "Sarah",
        orderId: "ORD-004",
        status: "contacted",
        timestamp: new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago
    },
    {
        id: "5",
        user: "Mohammed",
        orderId: "ORD-005",
        status: "confirmed",
        timestamp: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    }
];

const getStatusStyle = (status: string) => {
    switch (status) {
        case "confirmed":
            return {
                bg: "bg-[var(--pastel-green)]",
                text: "text-green-800",
                dot: "bg-green-500"
            };
        case "rejected":
            return {
                bg: "bg-[var(--pastel-pink)]",
                text: "text-rose-800",
                dot: "bg-rose-500"
            };
        case "contacted":
            return {
                bg: "bg-[var(--pastel-mint)]",
                text: "text-teal-800",
                dot: "bg-teal-500"
            };
        case "delivered":
            return {
                bg: "bg-[var(--pastel-purple)]",
                text: "text-purple-800",
                dot: "bg-purple-500"
            };
        default:
            return {
                bg: "bg-[var(--pastel-yellow)]",
                text: "text-amber-800",
                dot: "bg-amber-500"
            };
    }
};

export function LiveFeed() {
    return (
        <div className="pastel-card p-6 h-fit sticky top-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--background)] flex items-center justify-center">
                        <Activity className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">Activity Stream</h3>
                        <p className="text-xs text-subtle">Live audit trail</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--pastel-green-light)] text-green-700 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Live
                </div>
            </div>

            {/* Activity List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {mockActivities.map((activity, index) => {
                    const style = getStatusStyle(activity.status);
                    return (
                        <div
                            key={activity.id}
                            className="group p-4 rounded-2xl bg-[var(--background)] hover:bg-[var(--background-soft)] transition-all border border-transparent hover:border-[var(--card-border)] cursor-pointer"
                            style={{ animationDelay: `${index * 100}ms` }}
                        >
                            <div className="flex items-start gap-3">
                                {/* User Avatar */}
                                <div className="w-10 h-10 rounded-full bg-[var(--pastel-yellow)] flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm font-bold text-amber-900">
                                        {activity.user.charAt(0)}
                                    </span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground leading-relaxed">
                                        User <span className="font-semibold">{activity.user}</span>
                                        {" "}changed Order{" "}
                                        <span className="font-mono text-xs bg-[var(--card-border)] px-1.5 py-0.5 rounded">
                                            #{activity.orderId}
                                        </span>
                                        {" "}to{" "}
                                        <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${style.bg} ${style.text}`}>
                                            {activity.status}
                                        </span>
                                    </p>
                                    <p className="text-xs text-subtle mt-2 flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                                    </p>
                                </div>

                                {/* Arrow */}
                                <ChevronRight className="w-4 h-4 text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* View All Link */}
            <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                <button className="w-full py-3 text-center text-sm font-semibold text-foreground hover:text-[var(--button-success)] transition-colors rounded-xl hover:bg-[var(--background)]">
                    View all activity
                </button>
            </div>
        </div>
    );
}
