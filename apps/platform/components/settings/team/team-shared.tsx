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

export const ROLE_CONFIG: Record<UserRole, { label: string; labelAr: string; icon: typeof Shield; color: string }> = {
    super_admin: {
        label: "Super Admin",
        labelAr: "مدير عام",
        icon: ShieldCheck,
        color: "text-rose-400 bg-rose-500/20 border-rose-500/30",
    },
    admin: {
        label: "Admin",
        labelAr: "مسؤول",
        icon: ShieldCheck,
        color: "text-amber-400 bg-amber-500/20 border-amber-500/30",
    },
    employee: {
        label: "Employee",
        labelAr: "موظف",
        icon: Shield,
        color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
    },
    viewer: {
        label: "Viewer",
        labelAr: "مشاهد",
        icon: Eye,
        color: "text-blue-400 bg-blue-500/20 border-blue-500/30",
    },
};

// Helper to format activity in human-readable way
export function formatActivityDescription(log: ActivityLogEntry): { icon: React.ReactNode; title: string; description: string } {
    const details = log.details as Record<string, unknown>;
    const orderId = details?.order_id as string | undefined;
    const fromStatus = details?.from_status as string | undefined;
    const toStatus = details?.to_status as string | undefined;

    switch (log.action) {
        case "user.login":
            return {
                icon: <LogIn className="w-4 h-4 text-blue-500" />,
                title: "Logged in",
                description: "User session started"
            };
        case "order.status_change":
            return {
                icon: <RefreshCw className="w-4 h-4 text-amber-500" />,
                title: `Changed order #${orderId || 'N/A'}`,
                description: `Status: ${fromStatus || '?'} → ${toStatus || '?'}`
            };
        case "order.create":
            return {
                icon: <Package className="w-4 h-4 text-emerald-500" />,
                title: `Created order #${orderId || 'N/A'}`,
                description: `Source: ${details?.source || 'manual'}`
            };
        case "order.edit":
            return {
                icon: <Edit className="w-4 h-4 text-violet-500" />,
                title: `Edited order #${orderId || 'N/A'}`,
                description: "Order details updated"
            };
        case "settings.update":
            return {
                icon: <Settings className="w-4 h-4 text-slate-500" />,
                title: "Updated settings",
                description: details?.updated_user ? `User: ${details.updated_user}` : "Configuration changed"
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
export function formatRelativeTime(date: string): string {
    const now = Date.now();
    const then = new Date(date).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// ... InviteUserModal (Keep existing implementation, maybe update with avatar/name but user asked for functionality to be added to employees usually after creation or during editing)
// For brevity, I will focus on the Edit User Modal which is the main requirement.

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
