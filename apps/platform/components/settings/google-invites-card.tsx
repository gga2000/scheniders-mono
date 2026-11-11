"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Mail, UserPlus, Trash2, Clock } from "lucide-react";

interface Invite {
    id: string;
    email: string;
    role: string;
    display_name: string | null;
    status: string;
    created_at: string;
}

const ROLES = ["employee", "viewer", "admin"] as const;

/**
 * Admin card: invite a teammate by email. The server records a pending invite
 * and emails a join link; opening it, or "Continue with Google" on that email,
 * adds them to this store.
 */
export function GoogleInvitesCard({ onMembersChanged }: { onMembersChanged?: () => void }) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<string>("employee");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!tenantId) return;
        const { data } = await supabase
            .from("team_invites")
            .select("id, email, role, display_name, status, created_at")
            .eq("tenant_id", tenantId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });
        setInvites((data as Invite[]) ?? []);
    }, [tenantId]);

    useEffect(() => { load(); }, [load]);

    const authHeader = async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await fetch("/api/team/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(await authHeader()) },
                body: JSON.stringify({ email, role }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(t("team.invite.failed"), json.error || t("team.invite.tryAgain"));
            } else if (json.reactivated) {
                toast.success(t("team.invite.restored"), t("team.invite.restoredDesc", { email, role: t(`team.role.${role}`) }));
                setEmail("");
                onMembersChanged?.();
            } else {
                toast.success(t("team.invite.created"), t("team.invite.createdDesc", { email }));
                setEmail("");
                load();
            }
        } finally {
            setBusy(false);
        }
    };

    const handleRevoke = async (id: string) => {
        const res = await fetch(`/api/team/invite?id=${id}`, { method: "DELETE", headers: await authHeader() });
        if (res.ok) { toast.success(t("team.invite.revoked")); load(); }
        else toast.error(t("team.invite.revokeFailed"));
    };

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
            <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[var(--pastel-mint)] flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-teal-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("team.invite.cardTitle")}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
                {t("team.invite.cardDesc")}
            </p>

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2.5 mb-5">
                <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="teammate@gmail.com"
                        className="h-10 w-full rounded-xl border border-(--card-border) bg-background pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent"
                    />
                </div>
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-10 rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent capitalize"
                >
                    {ROLES.map((r) => <option key={r} value={r} className="capitalize">{t(`team.role.${r}`)}</option>)}
                </select>
                <button
                    type="submit"
                    disabled={busy || !email}
                    className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                    {busy ? t("team.invite.sending") : t("team.invite.send")}
                </button>
            </form>

            {invites.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("team.invite.pending")}</p>
                    {invites.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between rounded-xl border border-(--card-border) bg-background px-4 py-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                <span className="text-sm text-foreground truncate">{inv.email}</span>
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-(--pastel-blue) text-blue-800 shrink-0">{t(`team.role.${inv.role}`)}</span>
                            </div>
                            <button
                                onClick={() => handleRevoke(inv.id)}
                                className="text-muted-foreground hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 shrink-0"
                                title={t("team.invite.revoke")}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
