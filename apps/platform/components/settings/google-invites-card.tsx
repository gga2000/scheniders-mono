"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { Mail, Phone, UserPlus, Trash2, Clock, Copy, Check, RotateCw, MessageCircle, Users } from "lucide-react";

interface Invite {
    id: string;
    email: string | null;
    phone: string | null;
    role: string;
    display_name: string | null;
    status: string;
    created_at: string;
    expires_at: string;
}

/** team_seats(tenant): the plan's cap (null = none) and the seats in use. */
interface Seats {
    limit: number | null;
    used: number;
}

/** The link the last invite or resend produced, shown until the next one. */
interface Share {
    who: string;
    link: string;
    whatsappUrl: string | null;
}

type Channel = "phone" | "email";

const ROLES = ["employee", "viewer", "admin"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "0770 123 4567" for 07701234567, so the number reads at a glance. */
function formatPhone(phone: string): string {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
}

/**
 * Admin card: invite a teammate by WhatsApp number or by email (Fermi A2).
 * Every invite is a join link (/join/<token>) that works for 7 days. For a
 * phone the owner sends it on WhatsApp or copies it; an email invite is also
 * emailed. Pending invites can be sent again (new link, old one stops) or
 * cancelled. The plan's seat cap is shown here and enforced by the database.
 */
export function GoogleInvitesCard({
    onMembersChanged,
    memberCount,
}: {
    onMembersChanged?: () => void;
    /** Active members on the page; when it changes the seat count is read again. */
    memberCount?: number;
}) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [seats, setSeats] = useState<Seats | null>(null);
    const [channel, setChannel] = useState<Channel>("phone");
    const [contact, setContact] = useState("");
    const [role, setRole] = useState<string>("employee");
    const [busy, setBusy] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [share, setShare] = useState<Share | null>(null);
    const [copied, setCopied] = useState(false);
    /** When the list was read; days left are counted from it. */
    const [loadedAt, setLoadedAt] = useState(0);

    const load = useCallback(async () => {
        if (!tenantId) return;
        const [{ data }, { data: seatData }] = await Promise.all([
            supabase
                .from("team_invites")
                .select("id, email, phone, role, display_name, status, created_at, expires_at")
                .eq("tenant_id", tenantId)
                .eq("status", "pending")
                .order("created_at", { ascending: false }),
            supabase.rpc("team_seats", { _tenant_id: tenantId }),
        ]);
        setInvites((data as Invite[]) ?? []);
        setSeats((seatData as Seats | null) ?? null);
        setLoadedAt(Date.now());
    }, [tenantId]);

    useEffect(() => { load(); }, [load, memberCount]);

    const full = seats !== null && seats.limit !== null && seats.used >= seats.limit;

    const showShare = (who: string, json: { link?: string; whatsappUrl?: string | null }) => {
        if (!json.link) return;
        setCopied(false);
        setShare({ who, link: json.link, whatsappUrl: json.whatsappUrl ?? null });
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await authedFetch("/api/team/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(channel === "phone" ? { phone: contact, role } : { email: contact, role }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(t("team.invite.failed"), json.error || t("team.invite.tryAgain"));
                if (json.code === "team_limit") load();
            } else if (json.reactivated) {
                toast.success(t("team.invite.restored"), t("team.invite.restoredDesc", { email: contact, role: t(`team.role.${role}`) }));
                setContact("");
                onMembersChanged?.();
            } else {
                const phone = (json.invite as Invite | undefined)?.phone;
                const who = phone ? formatPhone(phone) : contact;
                if (channel === "phone") toast.success(t("team.invite.createdPhone"), t("team.invite.createdPhoneDesc", { phone: who }));
                else toast.success(t("team.invite.created"), t("team.invite.createdDesc", { email: contact }));
                showShare(who, json);
                setContact("");
                load();
            }
        } finally {
            setBusy(false);
        }
    };

    const handleResend = async (invite: Invite) => {
        setBusyId(invite.id);
        try {
            const res = await authedFetch(`/api/team/invite?id=${invite.id}`, { method: "PATCH" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(t("team.invite.failed"), json.error || t("team.invite.tryAgain"));
                return;
            }
            toast.success(t("team.invite.resent"), t("team.invite.resentDesc"));
            showShare(invite.phone ? formatPhone(invite.phone) : invite.email ?? "", json);
            load();
        } finally {
            setBusyId(null);
        }
    };

    const handleRevoke = async (id: string) => {
        setBusyId(id);
        try {
            const res = await authedFetch(`/api/team/invite?id=${id}`, { method: "DELETE" });
            if (res.ok) { toast.success(t("team.invite.revoked")); load(); }
            else toast.error(t("team.invite.revokeFailed"));
        } finally {
            setBusyId(null);
        }
    };

    const copy = async () => {
        if (!share) return;
        try {
            await navigator.clipboard.writeText(share.link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // The browser refused the clipboard (no permission): the link is
            // on screen to copy by hand.
            toast.error(t("team.invite.copyFailed"));
        }
    };

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
            <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pastel-mint)] flex items-center justify-center">
                        <UserPlus className="h-4 w-4 text-teal-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{t("team.invite.cardTitle")}</h3>
                </div>
                {seats && (
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0",
                            full ? "bg-amber-50 text-amber-800" : "bg-(--pastel-mint) text-teal-800",
                        )}
                    >
                        <Users className="w-3.5 h-3.5" />
                        {seats.limit === null
                            ? t("team.invite.seatsNoLimit", { used: seats.used })
                            : t("team.invite.seats", { used: seats.used, limit: seats.limit })}
                    </span>
                )}
            </div>
            <p className="text-sm text-muted-foreground mb-5">{t("team.invite.cardDesc")}</p>

            {full && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-900">{t("team.invite.full")}</p>
                    <Link
                        href="/settings?section=billing"
                        className="h-8 px-3 rounded-lg text-sm font-semibold bg-amber-900 text-white hover:bg-amber-950 transition-colors inline-flex items-center shrink-0"
                    >
                        {t("team.invite.upgrade")}
                    </Link>
                </div>
            )}

            <div role="tablist" className="inline-flex rounded-xl border border-(--card-border) bg-background p-1 mb-3">
                {(["phone", "email"] as const).map((c) => (
                    <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={channel === c}
                        onClick={() => { setChannel(c); setContact(""); }}
                        className={cn(
                            "h-8 px-3.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors",
                            channel === c ? "bg-(--pastel-mint) text-teal-900" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {c === "phone" ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                        {t(c === "phone" ? "team.invite.byPhone" : "team.invite.byEmail")}
                    </button>
                ))}
            </div>

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2.5 mb-5">
                <div className="relative flex-1">
                    {channel === "phone"
                        ? <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        : <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
                    <input
                        type={channel === "phone" ? "tel" : "email"}
                        inputMode={channel === "phone" ? "tel" : "email"}
                        dir="ltr"
                        required
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder={channel === "phone" ? "0770 123 4567" : "teammate@gmail.com"}
                        className="h-10 w-full rounded-xl border border-(--card-border) bg-background pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent"
                    />
                </div>
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    aria-label={t("team.invite.role")}
                    className="h-10 rounded-xl border border-(--card-border) bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-mint) focus:border-transparent capitalize"
                >
                    {ROLES.map((r) => <option key={r} value={r} className="capitalize">{t(`team.role.${r}`)}</option>)}
                </select>
                <button
                    type="submit"
                    disabled={busy || !contact || full}
                    className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                    {busy
                        ? t("team.invite.sending")
                        : t(channel === "phone" ? "team.invite.makeLink" : "team.invite.send")}
                </button>
            </form>

            {share && (
                <div className="mb-5 rounded-xl border border-(--card-border) bg-background p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                        {t("team.invite.linkReady", { who: share.who })}
                    </p>
                    <div className="flex items-center gap-2">
                        <code dir="ltr" className="flex-1 min-w-0 text-xs text-foreground bg-(--card-bg) rounded-lg px-3 py-2 truncate">
                            {share.link}
                        </code>
                        <button
                            type="button"
                            onClick={copy}
                            className="h-9 px-3 rounded-lg border border-(--card-border) bg-background text-sm font-medium text-foreground hover:bg-(--pastel-mint) transition-colors inline-flex items-center gap-1.5 shrink-0"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {t(copied ? "team.invite.copied" : "team.invite.copy")}
                        </button>
                        {share.whatsappUrl && (
                            <a
                                href={share.whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-9 px-3 rounded-lg text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] transition-colors inline-flex items-center gap-1.5 shrink-0"
                            >
                                <MessageCircle className="w-4 h-4" />
                                {t("team.invite.openWhatsapp")}
                            </a>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t("team.invite.linkHint")}</p>
                </div>
            )}

            {invites.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("team.invite.pending")}</p>
                    {invites.map((inv) => {
                        const daysLeft = Math.ceil((new Date(inv.expires_at).getTime() - loadedAt) / DAY_MS);
                        const expired = daysLeft <= 0;
                        return (
                            <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background px-4 py-2.5">
                                <div className="flex items-center gap-3 min-w-0">
                                    {inv.phone
                                        ? <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                                        : <Mail className="w-4 h-4 text-muted-foreground shrink-0" />}
                                    <span dir="ltr" className="text-sm text-foreground truncate">
                                        {inv.phone ? formatPhone(inv.phone) : inv.email}
                                    </span>
                                    {inv.display_name && (
                                        <span className="text-sm text-muted-foreground truncate">{inv.display_name}</span>
                                    )}
                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-(--pastel-blue) text-blue-800 shrink-0">{t(`team.role.${inv.role}`)}</span>
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 text-[11px] font-medium shrink-0",
                                            expired ? "text-rose-600" : "text-amber-600",
                                        )}
                                    >
                                        <Clock className="w-3.5 h-3.5" />
                                        {expired ? t("team.invite.expired") : t("team.invite.daysLeft", { count: daysLeft })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleResend(inv)}
                                        disabled={busyId === inv.id}
                                        className="h-8 px-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-(--pastel-mint) transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" />
                                        {t("team.invite.resend")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRevoke(inv.id)}
                                        disabled={busyId === inv.id}
                                        className="text-muted-foreground hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                                        title={t("team.invite.revoke")}
                                        aria-label={t("team.invite.revoke")}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
