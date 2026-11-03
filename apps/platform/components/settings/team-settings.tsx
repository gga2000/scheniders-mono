"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users,
    UserPlus,
    Search,
    RefreshCw,
    Loader2,
    ShieldAlert,
    CheckCircle,
    Activity,
    TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { UserRole, isAdminRole, PERMISSION_CATEGORIES } from "@/lib/permissions";
import { activityLogger, ActivityLogEntry } from "@/lib/activity-logger";
import { toast } from "@/hooks/use-toast";
import { teamRangeStart } from "@/lib/team-time-window";
import { GoogleInvitesCard } from "./google-invites-card";
import { LinkMemberGoogleCard } from "./link-member-google-card";
import { AccessRequestsCard } from "./access-requests-card";
import { toggleRolePermissionAction } from "@/app/actions/permissions";
import { EditUserModal } from "./team/edit-user-modal";
import { InviteUserModal } from "./team/invite-user-modal";
import { ROLE_CONFIG, UserProfile, formatActivityDescription, formatRelativeTime, isUserOnline } from "./team/team-shared";


export function TeamSettings() {
    const { role: currentRole, tenantId } = useAuth();
    const isAdmin = isAdminRole(currentRole);

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showPermissions, setShowPermissions] = useState(false);

    // NEW: Edit User State
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

    // State for permissions management
    const [dbPermissions, setDbPermissions] = useState<{ role: string; permission: string }[]>([]);

    // Global Activity Feed State (Admin Only)
    const [globalLogs, setGlobalLogs] = useState<ActivityLogEntry[]>([]);
    const [loadingGlobalLogs, setLoadingGlobalLogs] = useState(false);
    const [actionsToday, setActionsToday] = useState(0);

    // Fetch DB permissions
    const fetchDbPermissions = async () => {
        try {
            const { data, error } = await supabase
                .from('role_permissions')
                .select('*');
            if (error) throw error;
            setDbPermissions(data || []);
        } catch (err) {
            console.error("Error fetching permissions:", err);
        }
    };

    // Fetch Global Activity Logs (Admin Only)
    const fetchGlobalLogs = useCallback(async () => {
        if (!isAdmin || !tenantId) return;
        setLoadingGlobalLogs(true);
        try {
            const [feed, today] = await Promise.all([
                activityLogger.getActivityLogs({ tenantId, limit: 30 }),
                // Count every action since the start of the Baghdad day, not
                // just the ones that fit in the feed above.
                activityLogger.getActivityLogs({ tenantId, limit: 1, dateFrom: teamRangeStart("today") ?? undefined }),
            ]);
            if (feed.error || today.error) throw new Error(feed.error ?? today.error);
            setGlobalLogs(feed.data);
            setActionsToday(today.count);
        } catch (err) {
            console.error("Error fetching global logs:", err);
            toast.error("Could not load the activity feed.");
        } finally {
            setLoadingGlobalLogs(false);
        }
    }, [isAdmin, tenantId]);

    useEffect(() => {
        fetchDbPermissions();
    }, []);

    useEffect(() => {
        fetchGlobalLogs();
    }, [isAdmin, tenantId, fetchGlobalLogs]);

    // Toggle Permission (Global Role Matrix)
    const togglePermission = async (role: string, permission: string, checked: boolean) => {
        // Optimistic Update
        if (checked) {
            setDbPermissions(prev => [...prev, { role, permission }]);
        } else {
            setDbPermissions(prev => prev.filter(p => !(p.role === role && p.permission === permission)));
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const { success, error } = await toggleRolePermissionAction(role, permission, checked, session?.access_token ?? "");
            if (!success) {
                toast.error(error || "Failed to update role permission");
                fetchDbPermissions(); // Sync back on error
            }
        } catch (err) {
            console.error("Error toggling permission:", err);
            toast.error("Failed to communicate with server");
            fetchDbPermissions(); // Sync back
        }
    };

    // Helper to check if role has permission in DB
    const hasDbPermission = (role: string, permission: string) => {
        return dbPermissions.some(p => p.role === role && p.permission === permission);
    };

    // Fetch the current tenant's members. The role shown and edited is the
    // per-store tenant_members.role, not the global user_profiles.role.
    const fetchUsers = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("tenant_members")
                // Two FKs to user_profiles (user_id + invited_by): name the constraint.
                .select("role, user_profiles!tenant_members_user_id_fkey(*)")
                .eq("tenant_id", tenantId)
                .eq("status", "active");

            if (error) throw error;
            // The browser client is untyped, so the embed comes back as `unknown`.
            type Row = { role: UserRole; user_profiles: UserProfile | UserProfile[] | null };
            const members = ((data ?? []) as unknown as Row[]).flatMap((r) => {
                const p = Array.isArray(r.user_profiles) ? r.user_profiles[0] : r.user_profiles;
                return p ? [{ ...p, role: r.role }] : [];
            });
            members.sort((a, b) => b.created_at.localeCompare(a.created_at));
            setUsers(members);
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Toggle user status
    const toggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            // Another user's profile row is not writable through RLS; the
            // definer RPC checks that the caller administers the user's tenant.
            const { error } = await supabase.rpc("set_team_member_active", {
                p_user_id: userId,
                p_is_active: !isActive,
            });
            if (error) throw error;
            setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_active: !isActive } : u)));
        } catch (err) {
            console.error("Error toggling status:", err);
            toast.error("Failed to change the user's status");
        }
    };

    const filteredUsers = users.filter(
        u =>
            (u.display_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Calculate stats
    const onlineUsers = users.filter(u => isUserOnline(u.last_login_at)).length;
    const activeUsers = users.filter(u => u.is_active).length;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        Team & Permissions
                    </h2>
                    <p className="text-muted-foreground">Manage user access and roles</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowPermissions(!showPermissions)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                            showPermissions
                                ? "bg-muted text-foreground border-primary/50"
                                : "bg-card hover:bg-muted border-border"
                        )}
                    >
                        <ShieldAlert className="w-4 h-4" />
                        <span>Permissions Matrix</span>
                    </button>
                    <button
                        onClick={() => setShowInviteModal(true)} // Invite Modal logic not duplicated here for brevity but assumed present
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <UserPlus className="w-4 h-4" />
                        <span>Add member</span>
                    </button>
                </div>
            </div>

            {/* Dashboard Stats Cards (Admin Only) */}
            {isAdmin && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-primary/10">
                                <Users className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{users.length}</p>
                                <p className="text-xs text-muted-foreground">Total Users</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-emerald-500/10">
                                <div className="w-5 h-5 flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-emerald-600">{onlineUsers}</p>
                                <p className="text-xs text-muted-foreground">Online Now</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-500/10">
                                <CheckCircle className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{activeUsers}</p>
                                <p className="text-xs text-muted-foreground">Active Accounts</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-amber-500/10">
                                <TrendingUp className="w-5 h-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{actionsToday}</p>
                                <p className="text-xs text-muted-foreground">Actions Today</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Permissions Matrix (Collapsible) */}
            <AnimatePresence>
                {showPermissions && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-card/50 border border-border rounded-xl p-6 mb-6">
                            <h3 className="font-semibold mb-4">Role Permission Access</h3>
                            <div className="grid gap-6">
                                {PERMISSION_CATEGORIES.map((section) => (
                                    <div key={section.category}>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                                            {section.category}
                                        </h4>
                                        <div className="bg-background rounded-xl border border-border overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-muted/50 border-b border-border">
                                                        <th className="p-3 text-left font-medium">Action</th>
                                                        <th className="p-3 text-center w-24">Admin</th>
                                                        <th className="p-3 text-center w-24">Employee</th>
                                                        <th className="p-3 text-center w-24">Viewer</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border">
                                                    {section.items.map((item) => (
                                                        <tr key={item.key} className="hover:bg-muted/30">
                                                            <td className="p-3 font-medium">{item.label}</td>
                                                            {['admin', 'employee', 'viewer'].map(role => (
                                                                <td key={role} className="p-3 text-center">
                                                                    <div className="flex justify-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            disabled={role === 'admin'}
                                                                            checked={role === 'admin' ? true : hasDbPermission(role, item.key)}
                                                                            onChange={(e) => togglePermission(role, item.key, e.target.checked)}
                                                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        />
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isAdmin && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <GoogleInvitesCard onMembersChanged={fetchUsers} />
                    <LinkMemberGoogleCard />
                </div>
            )}
            <AccessRequestsCard />

            {/* Users List */}
            <div className="space-y-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or email"
                        className="w-full h-10 pl-9 pr-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                    />
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">User</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Role</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Status</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading && users.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground inline-block" />
                                        </td>
                                    </tr>
                                )}
                                {!loading && filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                                            {users.length === 0 ? "No team members yet." : "No member matches your search."}
                                        </td>
                                    </tr>
                                )}
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-bold text-sm overflow-hidden">
                                                        {user.avatar_url ? (
                                                            <img loading="lazy" decoding="async" src={user.avatar_url} alt={user.display_name || user.email} className="w-full h-full object-cover" />
                                                        ) : (
                                                            (user.display_name || user.email)[0].toUpperCase()
                                                        )}
                                                    </div>
                                                    {/* Online Indicator */}
                                                    {isUserOnline(user.last_login_at) && (
                                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-foreground">
                                                        {user.display_name || user.email.split("@")[0]}
                                                    </p>
                                                    <div className="flex flex-col">
                                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                                        {user.last_login_at && (
                                                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                                Active: {new Date(user.last_login_at).toLocaleString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-lg text-xs font-medium border",
                                                ROLE_CONFIG[user.role].color
                                            )}>
                                                {ROLE_CONFIG[user.role].label}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => toggleUserStatus(user.id, user.is_active)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                                                    user.is_active
                                                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                                        : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                                                )}
                                            >
                                                {user.is_active ? <>Active</> : <>Inactive</>}
                                            </button>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => setEditingUser(user)}
                                                className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium transition-colors"
                                            >
                                                Edit / Manage
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Global Activity Feed (Admin Only) */}
            {isAdmin && (
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Live Activity Feed
                        </h3>
                        <button
                            onClick={fetchGlobalLogs}
                            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loadingGlobalLogs && "animate-spin")} />
                        </button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                        {loadingGlobalLogs ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : globalLogs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No activity recorded yet
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {globalLogs.map((log) => {
                                    const { icon, title, description } = formatActivityDescription(log);
                                    return (
                                        <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors">
                                            <div className="p-2 rounded-lg bg-muted shrink-0">
                                                {icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-medium text-sm text-foreground truncate">{title}</p>
                                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                                        {formatRelativeTime(log.created_at)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-primary font-medium">
                                                        {log.user_email?.split('@')[0] || 'System'}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{description}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            <AnimatePresence>
                {editingUser && (
                    <EditUserModal
                        user={editingUser}
                        onClose={() => setEditingUser(null)}
                        onUpdate={() => {
                            fetchUsers();
                            fetchGlobalLogs();
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Invite User Modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <InviteUserModal
                        onClose={() => setShowInviteModal(false)}
                        onUserCreated={() => {
                            setShowInviteModal(false);
                            fetchUsers();
                            if (isAdmin) {
                                fetchGlobalLogs();
                            }
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
