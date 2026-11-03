import { Shield, ShieldCheck, Eye, RefreshCw, Package, LogIn, Settings, Activity, Edit } from "lucide-react";
import type { UserRole } from "@/lib/permissions";
import type { ActivityLogEntry } from "@/lib/activity-logger";

// Types
export interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    role: UserRole;
    avatar_url: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface UserPermissionOverride {
    permission: string;
    is_granted: boolean;
}

export const ROLE_CONFIG: Record<UserRole, { icon: typeof Shield; color: string }> = {
    super_admin: {
        icon: ShieldCheck,
        color: "text-rose-400 bg-rose-500/20 border-rose-500/30",
    },
    admin: {
        icon: ShieldCheck,
        color: "text-amber-400 bg-amber-500/20 border-amber-500/30",
    },
    employee: {
        icon: Shield,
        color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
    },
    viewer: {
        icon: Eye,
        color: "text-blue-400 bg-blue-500/20 border-blue-500/30",
    },
};

// Helper to format activity in human-readable way
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function formatActivityDescription(log: ActivityLogEntry, t: Translate): { icon: React.ReactNode; title: string; description: string } {
    const details = log.details as Record<string, unknown>;
    const orderId = details?.order_id as string | undefined;
    const fromStatus = details?.from_status as string | undefined;
    const toStatus = details?.to_status as string | undefined;

    switch (log.action) {
        case "user.login":
            return {
                icon: <LogIn className="w-4 h-4 text-blue-500" />,
                title: t("team.log.loggedIn"),
                description: t("team.log.sessionStarted")
            };
        case "order.status_change":
            return {
                icon: <RefreshCw className="w-4 h-4 text-amber-500" />,
                title: t("team.log.changedOrder", { id: orderId || "N/A" }),
                description: t("team.log.statusChange", { from: fromStatus || "?", to: toStatus || "?" })
            };
        case "order.create":
            return {
                icon: <Package className="w-4 h-4 text-emerald-500" />,
                title: t("team.log.createdOrder", { id: orderId || "N/A" }),
                description: t("team.log.source", { source: String(details?.source || "manual") })
            };
        case "order.edit":
            return {
                icon: <Edit className="w-4 h-4 text-violet-500" />,
                title: t("team.log.editedOrder", { id: orderId || "N/A" }),
                description: t("team.log.orderUpdated")
            };
        case "settings.update":
            return {
                icon: <Settings className="w-4 h-4 text-slate-500" />,
                title: t("team.log.updatedSettings"),
                description: details?.updated_user ? t("team.log.userLine", { user: String(details.updated_user) }) : t("team.log.configChanged")
            };
        default:
            return {
                icon: <Activity className="w-4 h-4 text-muted-foreground" />,
                title: log.action.replace(/\./g, " ").replace(/_/g, " "),
                description: log.entity_type || ""
            };
    }
}

// Helper to check if user is online (active in last 15 minutes)
export function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    return new Date(lastLogin).getTime() > fifteenMinutesAgo;
}

// Helper to format relative time
export function formatRelativeTime(date: string, t: Translate): string {
    const now = Date.now();
    const then = new Date(date).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("team.time.justNow");
    if (diffMins < 60) return t("team.time.minutes", { n: diffMins });
    if (diffHours < 24) return t("team.time.hours", { n: diffHours });
    return t("team.time.days", { n: diffDays });
}

// Photo rules: a 2MB image in a format the avatars bucket accepts.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};

// Supabase errors are plain objects with a message, not Error instances.
export function errorMessage(err: unknown, fallback: string): string {
    if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string" && err.message) {
        return err.message;
    }
    return fallback;
}
