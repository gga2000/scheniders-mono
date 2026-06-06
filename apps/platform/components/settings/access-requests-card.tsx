"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { Inbox, Check, X } from "lucide-react";

interface Req {
    id: string;
    user_id: string;
    email: string;
    name: string | null;
    created_at: string;
}
interface Tenant {
    id: string;
    business_name: string;
}

const ROLES = ["employee", "viewer", "admin"] as const;

/**
 * Super-admin only: queue of blocked sign-ins (authenticated but unprovisioned).
 * Approve → pick a workspace + role → the user is provisioned. Renders nothing
 * for non-super-admins.
 */
export function AccessRequestsCard() {
    const { role } = useAuth();
    const [requests, setRequests] = useState<Req[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [sel, setSel] = useState<Record<string, { tenantId: string; role: string }>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const authHeader = async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    };

    const load = useCallback(async () => {
        if (role !== "super_admin") return;
        const res = await fetch("/api/admin/access-requests", { headers: await authHeader() });
        if (res.ok) {
            const j = await res.json();
            setRequests(j.requests ?? []);
            setTenants(j.tenants ?? []);
        }
    }, [role]);

    useEffect(() => { load(); }, [load]);

    if (role !== "super_admin") return null;

    const setReq = (id: string, patch: Partial<{ tenantId: string; role: string }>) =>
        setSel((s) => {
            const prev = s[id] ?? { tenantId: "", role: "employee" };
            return { ...s, [id]: { ...prev, ...patch } };
        });

    const approve = async (id: string) => {
        const s = sel[id];
        if (!s?.tenantId) { toast.error("Pick a workspace first"); return; }
        setBusyId(id);
        try {
            const res = await fetch("/api/admin/access-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(await authHeader()) },
                body: JSON.stringify({ requestId: id, tenantId: s.tenantId, role: s.role || "employee" }),
            });
            const j = await res.json().catch(() => ({}));
            if (res.ok) { toast.success("Access approved"); load(); }
            else toast.error("Couldn't approve", j.error || "Please try again.");
        } finally { setBusyId(null); }
    };

    const reject = async (id: string) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/access-requests?id=${id}`, { method: "DELETE", headers: await authHeader() });
            if (res.ok) { toast.success("Request rejected"); load(); }
            else toast.error("Couldn't reject request");
        } finally { setBusyId(null); }
    };

    return (
        <div className="glass-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[var(--pastel-pink)] flex items-center justify-center">
                    <Inbox className="h-4 w-4 text-rose-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Access requests</h3>
                {requests.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">{requests.length}</span>
                )}
                <span className="ml-auto text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Super-admin</span>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
                People who signed in (e.g. with Google) but aren&apos;t set up yet. Approve to provision them into a workspace.
            </p>

            {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No pending requests.</p>
            ) : (
                <div className="space-y-2.5">
                    {requests.map((r) => (
                        <div key={r.id} className="rounded-xl border border-(--card-border) bg-background p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{r.name || r.email}</p>
                                {r.name && <p className="text-xs text-muted-foreground truncate">{r.email}</p>}
                            </div>
                            <select
                                value={sel[r.id]?.tenantId ?? ""}
                                onChange={(e) => setReq(r.id, { tenantId: e.target.value })}
                                className="h-9 rounded-lg border border-(--card-border) bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-pink)"
                            >
                                <option value="">Workspace…</option>
                                {tenants.map((t) => <option key={t.id} value={t.id}>{t.business_name}</option>)}
                            </select>
                            <select
                                value={sel[r.id]?.role ?? "employee"}
                                onChange={(e) => setReq(r.id, { role: e.target.value })}
                                className="h-9 rounded-lg border border-(--card-border) bg-background px-2 text-sm text-foreground capitalize focus:outline-none focus:ring-2 focus:ring-(--pastel-pink)"
                            >
                                {ROLES.map((ro) => <option key={ro} value={ro} className="capitalize">{ro}</option>)}
                            </select>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => approve(r.id)}
                                    disabled={busyId === r.id}
                                    className="h-9 px-3 rounded-lg text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                >
                                    <Check className="w-4 h-4" /> Approve
                                </button>
                                <button
                                    onClick={() => reject(r.id)}
                                    disabled={busyId === r.id}
                                    className="h-9 w-9 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 flex items-center justify-center transition-colors"
                                    title="Reject"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
