"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Lock, Mail, User, UserPlus, Users } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authed-fetch";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { AuthCardHeading, AuthCardShell } from "@/components/auth/auth-card-shell";
import { GoogleMark } from "@/components/auth/google-mark";
import { isInviteRefusal, type InviteRefusal } from "@/lib/team-invites";

type Preview =
    | { state: "loading" }
    | { state: "refused"; reason: InviteRefusal }
    | { state: "ready"; storeName: string; role: string };

const INPUT =
    "w-full h-12 pl-11 pr-4 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition";
const PRIMARY =
    "w-full h-12 rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
const SECONDARY =
    "w-full h-12 rounded-2xl font-semibold text-[15px] text-[#1E1E1E] bg-white border border-[#ECE8DD] hover:bg-[#FAF8F3] hover:border-[#D6D0C2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-colors";

function ErrorLine({ text }: { text: string }) {
    const dir = useTextDir();
    return (
        <div role="alert" className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{text}</p>
        </div>
    );
}

/**
 * /join/<token>: the link a store owner sends on WhatsApp or by email (Fermi
 * A2). Signed in, the person joins with one press. Signed out, they continue
 * with Google or sign in and come back here, or make an account: Supabase
 * emails a confirm link that signs them in and returns them here to join.
 */
function JoinInvite({ token }: { token: string }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const { user, isLoading: authLoading, signInWithGoogle, signOut, refreshProfile } = useAuth();
    const [preview, setPreview] = useState<Preview>({ state: "loading" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [sentTo, setSentTo] = useState<string | null>(null);
    const captcha = useAuthCaptcha();
    const here = `/join/${token}`;

    const loadPreview = useCallback(async () => {
        const res = await fetch(`/api/team/join?token=${encodeURIComponent(token)}`);
        const json = (await res.json().catch(() => ({}))) as { storeName?: string; role?: string; reason?: unknown };
        if (res.ok) setPreview({ state: "ready", storeName: json.storeName ?? "", role: json.role ?? "employee" });
        else setPreview({ state: "refused", reason: isInviteRefusal(json.reason) ? json.reason : "not_found" });
    }, [token]);

    useEffect(() => { void loadPreview(); }, [loadPreview]);

    const join = async () => {
        setError(null);
        setBusy(true);
        try {
            const res = await authedFetch("/api/team/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const json = (await res.json().catch(() => ({}))) as { code?: string; reason?: unknown };
            if (res.ok) {
                // The joined store is now their current one: read it before
                // the app opens.
                await refreshProfile();
                router.replace("/orders");
                return;
            }
            if (isInviteRefusal(json.reason)) setPreview({ state: "refused", reason: json.reason });
            else setError(t(json.code === "team_limit" ? "team.join.full" : "team.join.failed"));
            setBusy(false);
        } catch {
            setError(t("team.join.failed"));
            setBusy(false);
        }
    };

    const google = async () => {
        setError(null);
        setBusy(true);
        const { error: oauthError } = await signInWithGoogle(here);
        if (oauthError) {
            setError(oauthError.message);
            setBusy(false);
        }
    };

    const createAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const address = email.trim().toLowerCase();
        const { data, error: signUpError } = await supabase.auth.signUp({
            email: address,
            password,
            options: {
                captchaToken: captcha.token,
                data: { full_name: name.trim() },
                emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(here)}`,
            },
        });
        captcha.reset();
        setBusy(false);
        if (signUpError) {
            setError(signUpError.message || t("team.join.createFailed"));
            return;
        }
        // Supabase answers an address that already has an account with a user
        // that has no identities, and sends nothing.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
            setError(t("team.join.emailTaken"));
            return;
        }
        // Signed in at once (email confirmation off): the join button shows.
        if (data.session) return;
        setSentTo(address);
    };

    if (preview.state === "loading" || authLoading) {
        return (
            <div className="px-6 sm:px-8 py-14 flex flex-col items-center gap-3 text-[#8A847A]">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p dir={dir} className="text-sm">{t("team.join.loading")}</p>
            </div>
        );
    }

    if (preview.state === "refused") {
        return (
            <div className="px-6 sm:px-8 pt-3 pb-8">
                <AuthCardHeading
                    icon={<AlertCircle className="w-5 h-5" />}
                    title={t("team.join.refusedTitle")}
                    subtitle={t(`team.join.refused.${preview.reason}`)}
                />
                <Link href={user ? "/orders" : "/login"} className={`${SECONDARY} mt-6`}>
                    {t(user ? "team.join.toApp" : "team.join.toLogin")}
                </Link>
            </div>
        );
    }

    const title = preview.storeName
        ? t("team.join.title", { store: preview.storeName })
        : t("team.join.titleNoName");
    const subtitle = t("team.join.subtitle", { role: t(`team.role.${preview.role}`) });

    if (user) {
        return (
            <div className="px-6 sm:px-8 pt-3 pb-8">
                <AuthCardHeading icon={<Users className="w-5 h-5" />} title={title} subtitle={subtitle} />
                <div className="mt-6 space-y-4">
                    <p dir={dir} className="text-left text-sm text-[#5F5A52]">
                        {t("team.join.signedInAs")}{" "}
                        <span dir="ltr" className="font-medium text-[#1E1E1E]">{user.email}</span>
                    </p>
                    {error && <ErrorLine text={error} />}
                    {/* C3: the consent checkbox goes here, and the button waits for it. */}
                    <button type="button" onClick={join} disabled={busy} className={PRIMARY}>
                        {busy ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t("team.join.joining")}
                            </span>
                        ) : (
                            t("team.join.join")
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => { void signOut(); }}
                        disabled={busy}
                        className="w-full text-center text-[13px] text-[#8A847A] hover:text-[#1E1E1E] transition-colors"
                    >
                        {t("team.join.notYou")}
                    </button>
                </div>
            </div>
        );
    }

    if (sentTo) {
        return (
            <div className="px-6 sm:px-8 pt-3 pb-8">
                <AuthCardHeading icon={<Mail className="w-5 h-5" />} title={t("team.join.checkEmail")} subtitle={title} />
                <p dir={dir} className="mt-6 text-left text-sm text-[#5F5A52]">
                    {t("team.join.checkEmailBody", { email: sentTo })}
                </p>
            </div>
        );
    }

    return (
        <div className="px-6 sm:px-8 pt-3 pb-8">
            <AuthCardHeading icon={<UserPlus className="w-5 h-5" />} title={title} subtitle={subtitle} />
            <div className="mt-6 space-y-3">
                {error && <ErrorLine text={error} />}
                <button type="button" onClick={google} disabled={busy} className={SECONDARY}>
                    <GoogleMark />
                    <span>{t("login.google")}</span>
                </button>
                <Link href={`/login?returnTo=${encodeURIComponent(here)}`} className={SECONDARY}>
                    {t("team.join.haveAccount")}
                </Link>
            </div>

            <div className="flex items-center gap-3 py-5">
                <div className="h-px flex-1 bg-[#E8E4DC]" />
                <span className="text-xs text-[#9A9A9A]">{t("team.join.newAccount")}</span>
                <div className="h-px flex-1 bg-[#E8E4DC]" />
            </div>

            <form onSubmit={createAccount} className="space-y-3">
                <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A8A196]" />
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("team.join.name")}
                        aria-label={t("team.join.name")}
                        autoComplete="name"
                        maxLength={80}
                        required
                        className={INPUT}
                    />
                </div>
                <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A8A196]" />
                    <input
                        type="email"
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("team.join.email")}
                        aria-label={t("team.join.email")}
                        autoComplete="email"
                        required
                        className={INPUT}
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A8A196]" />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("team.join.password")}
                        aria-label={t("team.join.password")}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={72}
                        required
                        className={INPUT}
                    />
                </div>
                <AuthCaptcha captcha={captcha} />
                <button
                    type="submit"
                    disabled={busy || !captcha.ready || !name.trim() || !email.trim() || password.length < 8}
                    className={PRIMARY}
                >
                    {busy ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("team.join.creating")}
                        </span>
                    ) : (
                        t("team.join.create")
                    )}
                </button>
            </form>
        </div>
    );
}

export default function JoinPage() {
    const params = useParams<{ token: string }>();
    return (
        <AuthCardShell showBack={false}>
            <JoinInvite token={params.token} />
        </AuthCardShell>
    );
}
