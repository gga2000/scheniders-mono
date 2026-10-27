"use client";

import { useState, useEffect } from "react";
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
    Pencil,
    Trash2,
    Key,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { GoogleInvitesCard } from "@/components/settings/google-invites-card";
import { LinkMemberGoogleCard } from "@/components/settings/link-member-google-card";
import { AccessRequestsCard } from "@/components/settings/access-requests-card";

// Types
type UserRole = "super_admin" | "admin" | "employee" | "viewer";

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

// Role configuration
const ROLE_CONFIG: Record<UserRole, { label: string; labelAr: string; icon: typeof Shield; color: string }> = {
    super_admin: {
        label: "Super Admin",
        labelAr: "مدير عام",
        icon: ShieldCheck,
        color: "text-rose-700 bg-rose-500/10 border-rose-500/20 dark:text-rose-400 dark:bg-rose-500/20 dark:border-rose-500/30",
    },
    admin: {
        label: "Admin",
        labelAr: "مسؤول",
        icon: ShieldCheck,
        color: "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/20 dark:border-amber-500/30",
    },
    employee: {
        label: "Employee",
        labelAr: "موظف",
        icon: Shield,
        color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-500/20 dark:border-emerald-500/30",
    },
    viewer: {
        label: "Viewer",
        labelAr: "مشاهد",
        icon: Eye,
        color: "text-blue-700 bg-blue-500/10 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/20 dark:border-blue-500/30",
    },
};

// Invite User Modal Component
interface InviteUserModalProps {
    onClose: () => void;
    onUserCreated: () => void;
}

function InviteUserModal({ onClose, onUserCreated }: InviteUserModalProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState<UserRole>("employee");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

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
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "حدث خطأ أثناء إنشاء المستخدم");
            }

            if (response.status === 207) {
                toast({ title: "تنبيه", description: result.error, variant: "error" });
            } else {
                toast({ title: "تم إنشاء الحساب", description: `تم إنشاء حساب ${email} بنجاح.` });
            }

            onUserCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء المستخدم");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">
                                إضافة مستخدم جديد
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                إنشاء حساب جديد للفريق
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-surface transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Error Message */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:border-rose-500/30 dark:text-rose-400 mb-4 overflow-hidden"
                        >
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Display Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            الاسم (اختياري)
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="اسم المستخدم"
                            className="w-full h-11 px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            البريد الإلكتروني *
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                            required
                            className="w-full h-11 px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Lock className="w-4 h-4 text-muted-foreground" />
                            كلمة المرور *
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                minLength={6}
                                className="w-full h-11 px-4 pl-12 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <Eye className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            يجب أن تكون 6 أحرف على الأقل
                        </p>
                    </div>

                    {/* Role */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            الدور *
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(ROLE_CONFIG) as UserRole[]).map((r) => {
                                const config = ROLE_CONFIG[r];
                                const RoleIcon = config.icon;
                                return (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setRole(r)}
                                        className={cn(
                                            "flex flex-col items-center gap-1 p-3 rounded-xl border transition-all",
                                            role === r
                                                ? config.color + " border-2"
                                                : "bg-surface border-border hover:bg-surface-hover"
                                        )}
                                    >
                                        <RoleIcon className="w-5 h-5" />
                                        <span className="text-sm font-medium">{config.labelAr}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    جاري الإنشاء...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-4 h-4" />
                                    إنشاء حساب
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

export default function TeamSettingsPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [actionMenuUserId, setActionMenuUserId] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<{ id: string; name: string } | null>(null);
    const [editName, setEditName] = useState("");
    const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

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
        } catch {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Update user role
    const updateUserRole = async (userId: string, newRole: UserRole) => {
        try {
            const { error } = await supabase
                .from("user_profiles")
                .update({ role: newRole })
                .eq("id", userId);

            if (error) throw error;

            setUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, role: newRole } : u))
            );
            toast({ title: "تم تحديث الدور", description: "تم تغيير دور المستخدم بنجاح." });
        } catch {
            toast({ title: "خطأ في تحديث الدور", description: "تعذر تغيير دور المستخدم. حاول مرة أخرى.", variant: "error" });
        }
    };

    // Toggle user active status
    const toggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            // Another user's profile row is not writable through RLS; the
            // definer RPC checks that the caller administers the user's tenant.
            const { error } = await supabase.rpc("set_team_member_active", {
                p_user_id: userId,
                p_is_active: !isActive,
            });

            if (error) throw error;

            setUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, is_active: !isActive } : u))
            );
            toast({ title: isActive ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم", description: isActive ? "تم تعطيل حساب المستخدم." : "تم تفعيل حساب المستخدم." });
        } catch {
            toast({ title: "خطأ في تغيير الحالة", description: "تعذر تغيير حالة المستخدم. حاول مرة أخرى.", variant: "error" });
        }
    };

    // Update display name
    const updateDisplayName = async (userId: string, newName: string) => {
        try {
            const { error } = await supabase
                .from("user_profiles")
                .update({ display_name: newName })
                .eq("id", userId);

            if (error) throw error;

            setUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, display_name: newName } : u))
            );
            toast({ title: "تم تحديث الاسم", description: "تم تغيير اسم المستخدم بنجاح." });
            setEditingUser(null);
        } catch {
            toast({ title: "خطأ في تحديث الاسم", description: "تعذر تغيير اسم المستخدم.", variant: "error" });
        }
    };

    // Deactivate user (soft delete)
    const deactivateUser = async (userId: string) => {
        try {
            const { error } = await supabase.rpc("set_team_member_active", {
                p_user_id: userId,
                p_is_active: false,
            });

            if (error) throw error;

            setUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, is_active: false } : u))
            );
            toast({ title: "تم تعطيل الحساب", description: "تم تعطيل حساب المستخدم بنجاح." });
            setConfirmDeleteUserId(null);
        } catch {
            toast({ title: "خطأ", description: "تعذر تعطيل الحساب.", variant: "error" });
        }
    };

    // Filter users by search
    const filteredUsers = users.filter(
        u =>
            u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                        <Users className="w-7 h-7 text-primary" />
                        إدارة الفريق
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        إدارة المستخدمين والصلاحيات
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchUsers}
                        className="p-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors"
                        title="تحديث"
                    >
                        <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
                    >
                        <UserPlus className="w-5 h-5" />
                        <span>دعوة مستخدم</span>
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="mb-6">
                <div className="relative max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ابحث بالاسم أو البريد..."
                        className="w-full h-11 pr-11 pl-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-border bg-(--card-bg) shadow-(--card-shadow)">
                    <p className="text-sm text-muted-foreground">إجمالي المستخدمين</p>
                    <p className="text-2xl font-bold text-foreground">{users.length}</p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-(--card-bg) shadow-(--card-shadow)">
                    <p className="text-sm text-muted-foreground">المسؤولين</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {users.filter(u => u.role === "admin" || u.role === "super_admin").length}
                    </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-(--card-bg) shadow-(--card-shadow)">
                    <p className="text-sm text-muted-foreground">نشط</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {users.filter(u => u.is_active).length}
                    </p>
                </div>
                <div className="p-4 rounded-xl border border-border bg-(--card-bg) shadow-(--card-shadow)">
                    <p className="text-sm text-muted-foreground">غير نشط</p>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {users.filter(u => !u.is_active).length}
                    </p>
                </div>
            </div>

            {/* Pending access requests (super-admin only; self-hides otherwise) */}
            <AccessRequestsCard />

            {/* Invite by email → Google sign-in */}
            <GoogleInvitesCard />

            {/* Connect an existing member's Google account */}
            <LinkMemberGoogleCard />

            {/* Users Table */}
            <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center p-12">
                        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">لا يوجد مستخدمين</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface/50">
                                <tr>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider p-4">
                                        المستخدم
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider p-4">
                                        الدور
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider p-4">
                                        الحالة
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider p-4">
                                        آخر دخول
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider p-4">
                                        إجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredUsers.map((user) => {
                                    const roleConfig = ROLE_CONFIG[user.role];

                                    return (
                                        <motion.tr
                                            key={user.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-surface/50 transition-colors"
                                        >
                                            {/* User Info */}
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-medium">
                                                        {(user.display_name || user.email)[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-foreground">
                                                            {user.display_name || user.email.split("@")[0]}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                            <Mail className="w-3 h-3" />
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td className="p-4">
                                                <select
                                                    value={user.role}
                                                    onChange={(e) =>
                                                        updateUserRole(user.id, e.target.value as UserRole)
                                                    }
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg border text-sm font-medium",
                                                        roleConfig.color
                                                    )}
                                                >
                                                    <option value="admin">مسؤول</option>
                                                    <option value="employee">موظف</option>
                                                    <option value="viewer">مشاهد</option>
                                                </select>
                                            </td>

                                            {/* Status */}
                                            <td className="p-4">
                                                <button
                                                    onClick={() => toggleUserStatus(user.id, user.is_active)}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                        user.is_active
                                                            ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30"
                                                            : "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                                                    )}
                                                >
                                                    {user.is_active ? (
                                                        <>
                                                            <CheckCircle className="w-4 h-4" />
                                                            نشط
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircle className="w-4 h-4" />
                                                            غير نشط
                                                        </>
                                                    )}
                                                </button>
                                            </td>

                                            {/* Last Login */}
                                            <td className="p-4">
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <Clock className="w-4 h-4" />
                                                    {user.last_login_at
                                                        ? formatDate(user.last_login_at)
                                                        : "لم يسجل دخول"}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="p-4">
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setActionMenuUserId(actionMenuUserId === user.id ? null : user.id)}
                                                        className="p-2 rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>

                                                    <AnimatePresence>
                                                        {actionMenuUserId === user.id && (
                                                            <>
                                                                <div className="fixed inset-0 z-40" onClick={() => setActionMenuUserId(null)} />
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                    className="absolute left-0 top-full mt-1 w-48 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                                                                >
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingUser({ id: user.id, name: user.display_name || "" });
                                                                            setEditName(user.display_name || "");
                                                                            setActionMenuUserId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-surface transition-colors"
                                                                    >
                                                                        <Pencil className="w-4 h-4 text-muted-foreground" />
                                                                        تعديل الاسم
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setConfirmDeleteUserId(user.id);
                                                                            setActionMenuUserId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                        تعطيل الحساب
                                                                    </button>
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Name Modal */}
            <AnimatePresence>
                {editingUser && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                        >
                            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                <Pencil className="w-5 h-5 text-primary" />
                                تعديل اسم المستخدم
                            </h3>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="الاسم الجديد"
                                className="w-full h-11 px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
                                autoFocus
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors text-sm"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={() => updateDisplayName(editingUser.id, editName)}
                                    disabled={!editName.trim()}
                                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover transition-colors text-sm disabled:opacity-50"
                                >
                                    حفظ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Confirm Deactivate Modal */}
            <AnimatePresence>
                {confirmDeleteUserId && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                        >
                            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-6 h-6 text-rose-500" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground text-center mb-2">تعطيل الحساب</h3>
                            <p className="text-sm text-muted-foreground text-center mb-6">
                                هل أنت متأكد من تعطيل هذا الحساب؟ لن يتمكن المستخدم من تسجيل الدخول.
                            </p>
                            <div className="flex justify-center gap-3">
                                <button
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors text-sm"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={() => deactivateUser(confirmDeleteUserId)}
                                    className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors text-sm"
                                >
                                    تعطيل
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Invite Modal */}
            {showInviteModal && (
                <InviteUserModal
                    onClose={() => setShowInviteModal(false)}
                    onUserCreated={() => {
                        setShowInviteModal(false);
                        fetchUsers();
                    }}
                />
            )}
        </div>
    );
}
