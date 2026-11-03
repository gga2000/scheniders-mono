"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Clock, RefreshCw, Shield, Loader2, User, Camera, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { UserRole, PERMISSION_CATEGORIES } from "@/lib/permissions";
import { activityLogger, ActivityLogEntry } from "@/lib/activity-logger";
import { toast } from "@/hooks/use-toast";
import { toggleUserOverrideAction } from "@/app/actions/permissions";
import {
    AVATAR_MAX_BYTES,
    AVATAR_TYPES,
    UserPermissionOverride,
    UserProfile,
    errorMessage,
    formatActivityDescription,
    formatRelativeTime,
} from "./team-shared";

interface EditUserModalProps {
    user: UserProfile;
    onClose: () => void;
    onUpdate: () => void;
}

export function EditUserModal({ user, onClose, onUpdate }: EditUserModalProps) {
    const { user: currentUser, refreshProfile, tenantId } = useAuth();
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<"profile" | "permissions" | "activity">("profile");
    const [displayName, setDisplayName] = useState(user.display_name || "");
    const [role, setRole] = useState<UserRole>(user.role);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const canRemove = currentUser?.id !== user.id;

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
            const { data, error } = await activityLogger.getActivityLogs({
                tenantId: tenantId ?? undefined,
                userId: user.id,
                limit: 20
            });
            if (error) throw new Error(error);
            setLogs(data);
        } catch (err) {
            console.error("Error fetching logs:", err);
            toast.error(t("team.edit.memberFeedFail"));
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

            // 2. Fetch the user's overrides in this tenant (overrides are per tenant)
            if (tenantId) {
                const { data: overrideData } = await supabase
                    .from('user_permissions')
                    .select('permission, is_granted')
                    .eq('tenant_id', tenantId)
                    .eq('user_id', user.id);
                setOverrides(overrideData || []);
            } else {
                setOverrides([]);
            }
        } catch (err) {
            console.error("Error fetching permissions:", err);
        } finally {
            setLoadingPerms(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        const file = input.files?.[0];
        // Let the same file be picked again after an error.
        input.value = "";
        if (!file) return;

        if (!tenantId) {
            toast.error(t("team.err.noStore"));
            return;
        }
        const ext = AVATAR_TYPES[file.type];
        if (!ext) {
            toast.error(t("team.edit.photoType"));
            return;
        }
        if (file.size > AVATAR_MAX_BYTES) {
            toast.error(t("team.edit.photoSize"));
            return;
        }

        setUploading(true);
        try {
            // <store>/<member>/<file>: storage rules only let a member write
            // their own folder, or a store admin write a member's, in a store
            // both belong to.
            const filePath = `${tenantId}/${user.id}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from("avatars")
                .upload(filePath, file, { contentType: file.type, cacheControl: "31536000" });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
            setAvatarUrl(publicUrl);
        } catch (error) {
            console.error("Error uploading avatar:", error);
            toast.error(errorMessage(error, t("team.edit.photoFail")));
        } finally {
            setUploading(false);
        }
    };

    const saveProfile = async () => {
        if (!tenantId) {
            toast.error(t("team.err.noStore"));
            return;
        }
        setSaving(true);
        try {
            // Definer function: a store admin may edit a member's name and
            // photo (the profile row is not writable through RLS); it checks
            // the caller administers this member.
            const { error } = await supabase.rpc("update_team_member_profile", {
                p_tenant_id: tenantId,
                p_user_id: user.id,
                p_display_name: displayName,
                p_avatar_url: avatarUrl,
            });
            if (error) throw error;

            // The role is per store: it lives on this tenant's membership row.
            // RLS lets only a tenant admin change it, and never their own.
            if (role !== user.role) {
                const { error: roleError } = await supabase
                    .from("tenant_members")
                    .update({ role })
                    .eq("tenant_id", tenantId)
                    .eq("user_id", user.id);
                if (roleError) throw roleError;
            }

            await activityLogger.log({
                action: "settings.update",
                entityType: "user",
                entityId: user.id,
                details: {
                    updated_user: displayName || user.email,
                    changes: { role, display_name: displayName, avatar: !!avatarUrl }
                }
            }, tenantId);

            onUpdate();

            // If updating self, refresh auth profile
            if (currentUser && currentUser.id === user.id) {
                await refreshProfile();
            }

            toast.success(t("team.edit.saved"));
            onClose();
        } catch (err) {
            console.error("Error updating profile:", err);
            toast.error(errorMessage(err, t("team.edit.saveFail")));
        } finally {
            setSaving(false);
        }
    };

    const removeMember = async () => {
        if (!tenantId) return;
        setRemoving(true);
        try {
            const { error } = await supabase.rpc("remove_team_member", {
                p_tenant_id: tenantId,
                p_user_id: user.id,
            });
            if (error) throw error;
            await activityLogger.log({
                action: "settings.update",
                entityType: "user",
                entityId: user.id,
                details: { updated_user: displayName || user.email, changes: { removed: true } }
            }, tenantId);
            toast.success(t("team.edit.removed", { name: displayName || user.email }));
            onUpdate();
            onClose();
        } catch (err) {
            console.error("Error removing member:", err);
            toast.error(errorMessage(err, t("team.edit.removeFail")));
            setConfirmRemove(false);
        } finally {
            setRemoving(false);
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
            const { data: { session } } = await supabase.auth.getSession();
            const { success, error } = await toggleUserOverrideAction(
                user.id,
                permission,
                existing ? null : newValue,
                session?.access_token ?? "",
            );
            
            if (!success) {
                toast.error(error || t("team.edit.overrideFail"));
                // Rollback optimistic update
                if (existing) {
                    setOverrides(prev => [...prev, existing]);
                } else {
                    setOverrides(prev => prev.filter(o => o.permission !== permission));
                }
            }
        } catch (err) {
            console.error("Error toggling override:", err);
            toast.error(t("team.err.server"));
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
                        {t("team.edit.tabProfile")}
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
                        {t("team.edit.tabPermissions")}
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
                        {t("team.edit.tabActivity")}
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
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        onChange={handleAvatarUpload}
                                    />
                                </div>
                                <div>
                                    <h3 className="font-medium">{t("team.edit.photo")}</h3>
                                    <p className="text-sm text-muted-foreground">{t("team.edit.photoHint")}</p>
                                </div>
                            </div>

                            {/* Name */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t("team.edit.name")}</label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full h-11 px-4 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder={t("team.edit.namePlaceholder")}
                                />
                            </div>

                            {/* Role */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t("team.edit.role")}</label>
                                <select
                                    value={role}
                                    disabled={currentUser?.id === user.id}
                                    onChange={(e) => setRole(e.target.value as UserRole)}
                                    className="w-full h-11 px-4 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                                >
                                    <option value="employee">{t("team.role.employee")}</option>
                                    <option value="viewer">{t("team.role.viewer")}</option>
                                    <option value="admin">{t("team.role.admin")}</option>
                                </select>
                            </div>

                            <button
                                onClick={saveProfile}
                                disabled={saving}
                                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {t("team.edit.save")}
                            </button>

                            {canRemove && (
                                <div className="border-t border-border pt-5">
                                    {confirmRemove ? (
                                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
                                            <p className="text-sm">
                                                {t("team.edit.removeConfirm", { name: displayName || user.email })}
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={removeMember}
                                                    disabled={removing}
                                                    className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {removing && <Loader2 className="w-4 h-4 animate-spin" />}
                                                    {t("team.edit.removeYes")}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmRemove(false)}
                                                    disabled={removing}
                                                    className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
                                                >
                                                    {t("team.edit.cancel")}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmRemove(true)}
                                            className="text-sm font-medium text-rose-600 hover:text-rose-700"
                                        >
                                            {t("team.edit.remove")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : activeTab === "permissions" ? (
                        <div className="space-y-4">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
                                <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-medium text-blue-700 dark:text-blue-300">{t("team.edit.overridesTitle")}</p>
                                    <p className="text-blue-600/80 dark:text-blue-400/80">
                                        {t("team.edit.overridesBody")}
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
                                                                        {status === 'inherited' ? t("team.edit.inherited") : status === 'override_granted' ? t("team.edit.granted") : t("team.edit.revoked")}
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
                                    {t("team.edit.recent")}
                                </h3>
                                <button
                                    onClick={fetchActivityLogs}
                                    className="p-1 hover:bg-muted rounded-full"
                                    title={t("team.edit.refreshLogs")}
                                >
                                    <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loadingLogs && "animate-spin")} />
                                </button>
                            </div>

                            {loadingLogs ? (
                                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">{t("team.feed.empty")}</div>
                            ) : (
                                <div className="space-y-3">
                                    {logs.map((log) => {
                                        const { icon, title, description } = formatActivityDescription(log, t);
                                        return (
                                            <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                                <div className="p-2 rounded-lg bg-background border border-border shrink-0">
                                                    {icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="font-medium text-sm text-foreground truncate">{title}</p>
                                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                                            {formatRelativeTime(log.created_at, t)}
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
