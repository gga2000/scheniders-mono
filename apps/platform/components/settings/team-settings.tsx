"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users,
    UserPlus,
    Search,
    Shield,
    ShieldCheck,
    Eye,
    MoreVertical,
    Mail,
    Clock,
    CheckCircle,
    XCircle,
    RefreshCw,
    Lock,
    User,
    Loader2,
    AlertCircle,
    X,
    ShieldAlert,
    Check,
    Minus,
    Upload,
    Camera,
    Activity,
    TrendingUp,
    Package,
    LogIn,
    Settings,
    Edit
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider"; // Import useAuth

import {
    UserRole,
    ROLE_PERMISSIONS,
    hasPermission,
    PERMISSION_CATEGORIES,
    PERMISSIONS as ALL_PERMISSIONS
} from "@/lib/permissions";
import { activityLogger, ActivityLogEntry } from "@/lib/activity-logger";
import { toast } from "sonner";
import { toggleRolePermissionAction, toggleUserOverrideAction } from "@/app/actions/permissions";

// Types
interface UserProfile {
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

interface UserPermissionOverride {
    permission: string;
    is_granted: boolean;
}

const ROLE_CONFIG: Record<UserRole, { label: string; labelAr: string; icon: typeof Shield; color: string }> = {
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
function formatActivityDescription(log: ActivityLogEntry): { icon: React.ReactNode; title: string; description: string } {
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
function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    return new Date(lastLogin).getTime() > fifteenMinutesAgo;
}

// Helper to format relative time
function formatRelativeTime(date: string): string {
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

// EDIT USER MODAL
interface EditUserModalProps {
    user: UserProfile;
    onClose: () => void;
    onUpdate: () => void;
}

function EditUserModal({ user, onClose, onUpdate }: EditUserModalProps) {
    const { user: currentUser, refreshProfile } = useAuth(); // Get current user and refreshProfile
    const [activeTab, setActiveTab] = useState<"profile" | "permissions" | "activity">("profile");
    const [displayName, setDisplayName] = useState(user.display_name || "");
    const [role, setRole] = useState<UserRole>(user.role);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Permission Overrides State
    const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
    const [rolePermissions, setRolePermissions] = useState<string[]>([]);
    const [loadingPerms, setLoadingPerms] = useState(false);

    // Activity Logs State
    const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load initial permissions data
    useEffect(() => {
        if (activeTab === "permissions") {
            fetchPermissionsData();
        } else if (activeTab === "activity") {
            fetchActivityLogs();
        }
    }, [activeTab]);

    const fetchActivityLogs = async () => {
        setLoadingLogs(true);
        try {
            const { data } = await activityLogger.getActivityLogs({
                userId: user.id,
                limit: 20
            });
            setLogs(data);
        } catch (err) {
            console.error("Error fetching logs:", err);
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchPermissionsData = async () => {
        setLoadingPerms(true);
        try {
            // 1. Fetch current role permissions (Global)
            const { data: roleData } = await supabase
                .from('role_permissions')
                .select('permission')
                .eq('role', role);

            setRolePermissions(roleData?.map(p => p.permission) || []);

            // 2. Fetch user overrides
            const { data: overrideData } = await supabase
                .from('user_permissions')
                .select('permission, is_granted')
                .eq('user_id', user.id);

            setOverrides(overrideData || []);
        } catch (err) {
            console.error("Error fetching permissions:", err);
        } finally {
            setLoadingPerms(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true);
            const file = e.target.files?.[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop();
            const filePath = `${user.id}/${Math.random()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrl);
        } catch (error) {
            console.error('Error uploading avatar:', error);
            alert('Error uploading avatar');
        } finally {
            setUploading(false);
        }
    };

    const saveProfile = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({
                    display_name: displayName,
                    role: role,
                    avatar_url: avatarUrl
                })
                .eq('id', user.id);

            if (error) throw error;

            // Log activity
            await activityLogger.log({
                action: "settings.update",
                entityType: "user",
                entityId: user.id,
                details: {
                    updated_user: displayName || user.email,
                    changes: { role, display_name: displayName, avatar: !!avatarUrl }
                }
            });

            onUpdate();

            // If updating self, refresh auth profile
            if (currentUser && currentUser.id === user.id) {
                await refreshProfile();
            }

            onClose();
        } catch (err) {
            console.error("Error updating profile:", err);
        } finally {
            setSaving(false);
        }
    };

    const toggleOverride = async (permission: string, currentRoleHasAccess: boolean) => {
        const existing = overrides.find(o => o.permission === permission);
        const newValue = !currentRoleHasAccess;
        
        // Optimistic UI update
        if (existing) {
            setOverrides(prev => prev.filter(o => o.permission !== permission));
        } else {
            setOverrides(prev => [...prev, { permission, is_granted: newValue }]);
        }

        try {
            const { success, error } = await toggleUserOverrideAction(
                user.id, 
                permission, 
                existing ? null : newValue
            );
            
            if (!success) {
                toast.error(error || "Failed to update user override");
                // Rollback optimistic update
                if (existing) {
                    setOverrides(prev => [...prev, existing]);
                } else {
                    setOverrides(prev => prev.filter(o => o.permission !== permission));
                }
            }
        } catch (err) {
            console.error("Error toggling override:", err);
            toast.error("Failed to communicate with server");
            // Rollback optimistic update
            if (existing) {
                setOverrides(prev => [...prev, existing]);
            } else {
                setOverrides(prev => prev.filter(o => o.permission !== permission));
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-background border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-card/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg overflow-hidden relative group">
                            {avatarUrl ? (
                                <img loading="lazy" decoding="async" src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                                (displayName || user.email)[0].toUpperCase()
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{displayName || user.email}</h2>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab("profile")}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                            activeTab === "profile"
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        Profile Settings
                    </button>
                    <button
                        onClick={() => setActiveTab("permissions")}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                            activeTab === "permissions"
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        User Permissions
                    </button>
                    <button
                        onClick={() => setActiveTab("activity")}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                            activeTab === "activity"
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:bg-muted/50"
                        )}
                    >
                        Activity History
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === "profile" ? (
                        <div className="space-y-6">
                            {/* Avatar */}
                            <div className="flex items-center gap-6">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-muted-foreground overflow-hidden border-2 border-border shadow-sm">
                                        {avatarUrl ? (
                                            <img loading="lazy" decoding="async" src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-10 h-10" />
                                        )}
                                        {uploading && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 animate-spin text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
                                    >
                                        <Camera className="w-4 h-4" />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarUpload}
                                    />
                                </div>
                                <div>
                                    <h3 className="font-medium">Profile Picture</h3>
                                    <p className="text-sm text-muted-foreground">Upload a PNG or JPG (max 2MB).</p>
                                </div>
                            </div>

                            {/* Name */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Display Name / Nickname</label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full h-11 px-4 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="e.g. John Doe"
                                />
                            </div>

                            {/* Role */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Role</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as UserRole)}
                                    className="w-full h-11 px-4 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                                >
                                    <option value="employee">Employee</option>
                                    <option value="viewer">Viewer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <button
                                onClick={saveProfile}
                                disabled={saving}
                                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </div>
                    ) : activeTab === "permissions" ? (
                        <div className="space-y-4">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
                                <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-medium text-blue-700 dark:text-blue-300">Permission Overrides</p>
                                    <p className="text-blue-600/80 dark:text-blue-400/80">
                                        Customize permissions for this specific user. These settings override the default Role permissions.
                                    </p>
                                </div>
                            </div>

                            {loadingPerms ? (
                                <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {PERMISSION_CATEGORIES.map(category => (
                                        <div key={category.category} className="py-4 first:pt-0">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                                                {category.category}
                                            </h4>
                                            <div className="grid gap-2">
                                                {category.items.map(item => {
                                                    const roleHasAccess = rolePermissions.includes(item.key);
                                                    const override = overrides.find(o => o.permission === item.key);

                                                    // Effective status
                                                    const isGranted = override ? override.is_granted : roleHasAccess;
                                                    const status = override
                                                        ? (override.is_granted ? 'override_granted' : 'override_revoked')
                                                        : 'inherited';

                                                    return (
                                                        <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                                            <div>
                                                                <p className="font-medium text-sm">{item.label}</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <div className={cn(
                                                                        "text-[10px] px-1.5 py-0.5 rounded border uppercase font-semibold",
                                                                        status === 'inherited' ? "bg-muted border-border text-muted-foreground" :
                                                                            status === 'override_granted' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                                                                "bg-rose-500/10 border-rose-500/20 text-rose-500"
                                                                    )}>
                                                                        {status === 'inherited' ? 'Inherited' : status === 'override_granted' ? 'Granted Override' : 'Revoked'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <button
                                                                    onClick={() => toggleOverride(item.key, roleHasAccess)}
                                                                    className={cn(
                                                                        "w-10 h-6 rounded-full transition-colors relative",
                                                                        isGranted ? "bg-primary" : "bg-muted-foreground/30"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-all",
                                                                        isGranted ? "left-5" : "left-1"
                                                                    )} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    Recent Activity
                                </h3>
                                <button
                                    onClick={fetchActivityLogs}
                                    className="p-1 hover:bg-muted rounded-full"
                                    title="Refresh Logs"
                                >
                                    <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loadingLogs && "animate-spin")} />
                                </button>
                            </div>

                            {loadingLogs ? (
                                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">No activity recorded yet</div>
                            ) : (
                                <div className="space-y-3">
                                    {logs.map((log) => {
                                        const { icon, title, description } = formatActivityDescription(log);
                                        return (
                                            <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                                <div className="p-2 rounded-lg bg-background border border-border shrink-0">
                                                    {icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="font-medium text-sm text-foreground truncate">{title}</p>
                                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                                            {formatRelativeTime(log.created_at)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

// ... Main TeamSettings Component (Similar to before but with added state for EditUserModal) ...

export function TeamSettings() {
    const { profile } = useAuth();
    const isAdmin = profile?.role === 'admin';

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
    const fetchGlobalLogs = async () => {
        if (!isAdmin) return;
        setLoadingGlobalLogs(true);
        try {
            const { data } = await activityLogger.getActivityLogs({ limit: 30 });
            setGlobalLogs(data);

            // Calculate actions today
            const today = new Date().toISOString().split('T')[0];
            const todayActions = data.filter(log => log.created_at.startsWith(today));
            setActionsToday(todayActions.length);
        } catch (err) {
            console.error("Error fetching global logs:", err);
        } finally {
            setLoadingGlobalLogs(false);
        }
    };

    useEffect(() => {
        fetchDbPermissions();
    }, []);

    useEffect(() => {
        if (isAdmin) {
            fetchGlobalLogs();
        }
    }, [isAdmin]);

    // Toggle Permission (Global Role Matrix)
    const togglePermission = async (role: string, permission: string, checked: boolean) => {
        // Optimistic Update
        if (checked) {
            setDbPermissions(prev => [...prev, { role, permission }]);
        } else {
            setDbPermissions(prev => prev.filter(p => !(p.role === role && p.permission === permission)));
        }

        try {
            const { success, error } = await toggleRolePermissionAction(role, permission, checked);
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

    // Fetch all users
    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("user_profiles")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Toggle user status
    const toggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            await supabase.from("user_profiles").update({ is_active: !isActive }).eq("id", userId);
            setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_active: !isActive } : u)));
        } catch (err) {
            console.error("Error toggling status:", err);
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
                        <span>Invite User</span>
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

            {/* Users List */}
            <div className="space-y-4">
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

// Re-including InviteUserModal just to be safe and complete as I'm overwriting the file.
function InviteUserModal({ onClose, onUserCreated }: { onClose: () => void; onUserCreated: () => void; }) {
    const { tenantId } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState<UserRole>("employee");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch("/api/auth/create-user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    email,
                    password,
                    displayName: displayName || email.split("@")[0],
                    role,
                    tenantId,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to create user");
            }

            onUserCreated();
        } catch (err) {
            console.error("Error creating user:", err);
            setError(err instanceof Error ? err.message : "Failed to create user");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Invite User</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 border rounded-lg" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-10 px-3 border rounded-lg" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Name</label>
                        <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full h-10 px-3 border rounded-lg" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Role</label>
                        <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="w-full h-10 px-3 border rounded-lg">
                            <option value="employee">Employee</option>
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button className="w-full bg-primary text-primary-foreground py-2 rounded-lg" disabled={loading}>
                        {loading ? "Creating..." : "Create User"}
                    </button>
                </form>
            </motion.div>
        </div>
    )
}
