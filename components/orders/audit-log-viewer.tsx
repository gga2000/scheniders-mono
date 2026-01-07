"use client";

import { useQuery } from "@tanstack/react-query";
import { activityLogger, ActivityLogEntry } from "@/lib/activity-logger";
import { format } from "date-fns";
import { type ReactNode } from "react";
import { Loader2, History, User, AlertCircle } from "lucide-react";

interface AuditLogViewerProps {
    orderId: string;
}

export function AuditLogViewer({ orderId }: AuditLogViewerProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ["activity-logs", orderId],
        queryFn: async () => {
            const result = await activityLogger.getActivityLogs({
                entityId: orderId,
                limit: 100,
            });
            if (result.error) throw new Error(result.error);
            return result.data;
        },
    });

    if (isLoading) {
        return (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading history...
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-40 flex-col items-center justify-center text-red-500">
                <AlertCircle className="mb-2 h-6 w-6" />
                <p>Failed to load history</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
                <History className="mb-2 h-6 w-6 opacity-20" />
                <p>No activity recorded yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {data.map((log) => (
                <LogEntry key={log.id} log={log} />
            ))}
        </div>
    );
}

function LogEntry({ log }: { log: ActivityLogEntry }) {
    const date = new Date(log.created_at);

    return (
        <div className="relative flex gap-4 border-l-2 border-border/50 pb-6 pl-6 last:border-0 last:pb-0">
            {/* Timeline Dot */}
            <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-4 border-background bg-zinc-400 dark:bg-zinc-600" />

            <div className="flex-1 space-y-1">
                {/* Header */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{log.user_email || "System"}</span>
                    </div>
                    <time dateTime={log.created_at} title={log.created_at}>
                        {format(date, "PP p")}
                    </time>
                </div>

                {/* Action Title */}
                <h4 className="font-medium text-foreground">{formatAction(log.action)}</h4>

                {/* Details / Diff */}
                <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <LogDetails log={log} />
                </div>
            </div>
        </div>
    );
}

function formatAction(action: string): string {
    switch (action) {
        case "order.create": return "Created Order";
        case "order.status_change": return "Changed Status";
        case "order.edit": return "Edited Order Details";
        case "order.print": return "Printed Order";
        case "order.assign": return "Assigned Order";
        default: return action.replace(".", " ");
    }
}

function LogDetails({ log }: { log: ActivityLogEntry }) {
    const details = log.details;

    if (log.action === "order.status_change") {
        return (
            <>
                <div className="flex items-center gap-2">
                    <Badge>{String(details.from_status)}</Badge>
                    <span>→</span>
                    <Badge variant="outline">{String(details.to_status)}</Badge>
                </div>
                {details.reason && (
                    <p className="mt-1 text-xs italic text-orange-500">
                        Reason: {String(details.reason)}
                    </p>
                )}
            </>
        );
    }

    if (log.action === "order.edit") {
        const changes = details.changes as Record<string, { from: unknown; to: unknown }>;
        if (!changes) return null;

        return (
            <div className="grid gap-2 rounded-md bg-muted/50 p-2 text-xs">
                {Object.entries(changes).map(([field, delta]) => (
                    <div key={field} className="grid grid-cols-[100px_1fr_20px_1fr] items-center gap-2">
                        <span className="font-mono font-medium text-muted-foreground">{field}:</span>
                        <span className="truncate text-red-500 line-through" title={String(delta.from)}>
                            {String(delta.from ?? "empty")}
                        </span>
                        <span className="text-center text-muted-foreground">→</span>
                        <span className="truncate text-green-600 font-medium" title={String(delta.to)}>
                            {String(delta.to ?? "empty")}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (log.action === "order.create") {
        return (
            <p>Source: <span className="font-mono">{details.source as string}</span></p>
        )
    }

    // Fallback json view
    return (
        <pre className="max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
            {JSON.stringify(details, null, 2)}
        </pre>
    );
}

// Simple Badge component for this file
function Badge({ children, variant }: { children: ReactNode; variant?: "outline" }) {
    const style = variant === "outline"
        ? "border border-zinc-300 bg-transparent text-foreground"
        : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";

    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
            {children}
        </span>
    );
}

export default AuditLogViewer;
