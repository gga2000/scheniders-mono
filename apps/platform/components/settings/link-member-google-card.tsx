"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { Link2, Copy, Check } from "lucide-react";

interface Member {
    id: string;
    display_name: string | null;
    email: string;
}

/**
 * Admin card (Flow A): connect an EXISTING member's account to their Google.
 * Generates a single-use link the admin sends to the employee; opening it signs
 * them into their own account and runs the Google link — same account, all data
 * preserved, Google becomes an extra sign-in method.
 */
export function LinkMemberGoogleCard() {
    const { tenantId } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [selected, setSelected] = useState("");
    const [claimUrl, setClaimUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        if (!tenantId) return;
        const { data } = await supabase
            .from("user_profiles")
            .select("id, display_name, email")
            .eq("current_tenant_id", tenantId)
            .order("display_name");
        setMembers((data as Member[]) ?? []);
    }, [tenantId]);

    useEffect(() => { load(); }, [load]);

    const generate = async () => {
        if (!selected) return;
        setBusy(true);
        setClaimUrl(null);
        try {
            const { data: s } = await supabase.auth.getSession();
            const res = await fetch("/api/team/link-google/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(s.session?.access_token ? { Authorization: `Bearer ${s.session.access_token}` } : {}),
                },
                body: JSON.stringify({ userId: selected }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) toast.error("Couldn't generate link", json.error || "Please try again.");
            else setClaimUrl(json.claimUrl);
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!claimUrl) return;
        await navigator.clipboard.writeText(claimUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="glass-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[var(--pastel-blue)] flex items-center justify-center">
                    <Link2 className="h-4 w-4 text-blue-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Connect a member&apos;s Google account</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
                For an existing employee — generate a one-time link and send it to them (e.g. on WhatsApp).
                When they open it, Google attaches to their current account, so they can sign in with either.
                Their data stays exactly the same.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
                <select
                    value={selected}
                    onChange={(e) => { setSelected(e.target.value); setClaimUrl(null); }}
                    className="h-10 flex-1 rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-blue) focus:border-transparent"
                >
                    <option value="">Select a member…</option>
                    {members.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.display_name || m.email} {m.display_name ? `· ${m.email}` : ""}
                        </option>
                    ))}
                </select>
                <button
                    onClick={generate}
                    disabled={busy || !selected}
                    className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                >
                    {busy ? "Generating…" : "Generate link"}
                </button>
            </div>

            {claimUrl && (
                <div className="mt-4 rounded-xl border border-(--card-border) bg-background p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                        Send this link to the employee — it&apos;s <span className="font-medium text-foreground">single-use</span> and
                        expires in <span className="font-medium text-foreground">20 minutes</span>:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs text-foreground bg-(--card-bg) rounded-lg px-3 py-2 truncate">{claimUrl}</code>
                        <button
                            onClick={copy}
                            className="h-9 px-3 rounded-lg border border-(--card-border) bg-background text-sm font-medium text-foreground hover:bg-(--pastel-blue) hover:text-blue-800 transition-colors flex items-center gap-1.5 shrink-0"
                        >
                            {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
