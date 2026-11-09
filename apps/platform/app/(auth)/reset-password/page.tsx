"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Store, Check, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { AuthCardShell, AuthCardHeading } from "@/components/auth/auth-card-shell";

// Must match Supabase Auth > Email: minimum length 8, "Letters and digits".
const MIN_LENGTH = 8;
const strengthColors = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#16A34A"];

function getPasswordStrength(pwd: string) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    return score;
}

/** Same role names the Team page shows, so Arabic readers see Arabic. */
const ROLE_KEYS: Record<string, string> = {
    owner: "team.roster.role.owner",
    admin: "team.roster.role.admin",
    employee: "team.roster.role.employee",
    viewer: "team.roster.role.viewer",
    super_admin: "pwreset.role.superAdmin",
};

function roleLabel(role: string | null, t: (key: string) => string): string | null {
    if (!role) return null;
    const key = ROLE_KEYS[role];
    if (key) return t(key);
    return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The store this account works in, so the person knows which login they are fixing. */
function useStoreName(tenantId: string | null) {
    return useQuery<string | null>({
        queryKey: ["reset-password-store-name", tenantId],
        enabled: !!tenantId,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("business_name")
                .eq("id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            return data?.business_name ?? null;
        },
    });
}

function PasswordField({
    label,
    value,
    onChange,
    autoFocus,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    autoFocus?: boolean;
}) {
    const { t } = useLanguage();
    const [show, setShow] = useState(false);
    return (
        <label className="block">
            <span className="block text-[13px] font-medium text-[#3B3833] mb-2">{label}</span>
            <span className="relative group block">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A8A29E] group-focus-within:text-[#1E1E1E] transition-colors pointer-events-none" />
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoFocus={autoFocus}
                    autoComplete="new-password"
                    required
                    className="w-full h-[52px] pl-11 pr-12 rounded-2xl bg-[#FAF8F3] border border-[#E7E2D6]
                               text-[15px] text-[#1E1E1E] tracking-wide placeholder:text-[#B5AFA4]
                               focus:bg-white focus:border-[#1E1E1E] focus:ring-4 focus:ring-[#EFFF00]/40 focus:outline-none
                               transition-all duration-200"
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? t("pwreset.new.hide") : t("pwreset.new.show")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#A8A29E] hover:text-[#1E1E1E] hover:bg-[#F1EDE4] transition-colors"
                >
                    {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
            </span>
        </label>
    );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    const dir = useTextDir();
    return (
        <li className={`flex items-center gap-2 text-[13px] transition-colors ${ok ? "text-[#15803D]" : "text-[#8A847A]"}`}>
            <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors ${ok ? "bg-[#22C55E] text-white" : "bg-[#ECE8DD] text-transparent"}`}
            >
                <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            <span dir={dir}>{children}</span>
        </li>
    );
}

export default function ResetPasswordPage() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { updatePassword, user, profile, role, tenantId, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { data: storeName } = useStoreName(tenantId);

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const passwordStrength = getPasswordStrength(password);
    const longEnough = password.length >= MIN_LENGTH;
    const hasLettersAndDigits = /[a-zA-Z]/.test(password) && /\d/.test(password);
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
    const isFormValid = longEnough && hasLettersAndDigits && passwordsMatch;

    const email = user?.email ?? profile?.email ?? null;
    const displayName = profile?.display_name?.trim() || null;
    const initial = (displayName ?? email ?? "?").charAt(0).toUpperCase();
    const roleText = roleLabel(role, t);

    // The email link signs the person in before landing here. Once the auth
    // client has settled with no session, the link was not used or expired.
    useEffect(() => {
        if (!authLoading && !user && !isSuccess) router.replace("/forgot-password?link=expired");
    }, [authLoading, user, isSuccess, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!passwordsMatch) {
            setError(t("pwreset.new.mismatch"));
            return;
        }
        if (!longEnough) {
            setError(t("pwreset.new.tooShort", { n: MIN_LENGTH }));
            return;
        }
        if (!hasLettersAndDigits) {
            setError(t("pwreset.new.needMix"));
            return;
        }

        setIsLoading(true);
        try {
            const { error: updateError } = await updatePassword(password);
            if (updateError) {
                setError(updateError.message);
                setIsLoading(false);
                return;
            }
            setIsSuccess(true);
            // The reset link already signed them in, so go straight to work
            // instead of a sign-in page that would bounce them anyway.
            setTimeout(() => router.replace("/orders"), 1800);
        } catch {
            setError(t("pwreset.forgot.unexpected"));
            setIsLoading(false);
        }
    };

    return (
        <AuthCardShell showBack={!isSuccess}>
            <AnimatePresence mode="wait">
                {!isSuccess ? (
                    <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="px-6 sm:px-8">
                            <AuthCardHeading
                                icon={<KeyRound className="w-5 h-5" />}
                                title={t("pwreset.new.title")}
                                subtitle={t("pwreset.new.subtitle")}
                            />
                        </div>

                        <div className="mx-6 sm:mx-8 mt-6 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A8A29E] mb-3">
                                {t("pwreset.new.for")}
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#1E1E1E] text-white text-[15px] font-semibold">
                                    {user ? initial : <Loader2 className="w-4 h-4 animate-spin" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    {displayName && (
                                        <p className="text-[14px] font-semibold text-[#1E1E1E] truncate">{displayName}</p>
                                    )}
                                    <p
                                        dir="ltr"
                                        className={`break-all ${displayName ? "text-[13px] text-[#6B6760]" : "text-[14px] font-semibold text-[#1E1E1E]"}`}
                                    >
                                        {email ?? t("pwreset.new.checking")}
                                    </p>
                                </div>
                                {roleText && (
                                    <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-white border border-[#E7E2D6] text-[#3B3833]">
                                        {roleText}
                                    </span>
                                )}
                            </div>
                            {storeName && (
                                <div className="mt-3 pt-3 border-t border-[#ECE8DD] flex items-center gap-2 text-[13px]">
                                    <Store className="w-4 h-4 text-[#8A847A] shrink-0" />
                                    <span className="text-[#8A847A]">{t("pwreset.new.store")}</span>
                                    <span className="font-semibold text-[#1E1E1E] truncate">{storeName}</span>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="px-6 sm:px-8 pt-6 pb-8 space-y-5">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    role="alert"
                                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]"
                                >
                                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                                </motion.div>
                            )}

                            <div>
                                <PasswordField label={t("pwreset.new.password")} value={password} onChange={setPassword} autoFocus />
                                <div className="mt-3 flex items-center gap-3">
                                    <div className="flex gap-1 flex-1" aria-hidden>
                                        {[1, 2, 3, 4, 5].map((level) => (
                                            <div
                                                key={level}
                                                className="h-1.5 flex-1 rounded-full transition-colors duration-300"
                                                style={{
                                                    backgroundColor:
                                                        password && level <= passwordStrength
                                                            ? strengthColors[passwordStrength - 1]
                                                            : "#ECE8DD",
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <span
                                        className="text-[12px] font-medium min-w-16 text-right"
                                        style={{ color: password && passwordStrength > 0 ? strengthColors[passwordStrength - 1] : "#A8A29E" }}
                                    >
                                        {password && passwordStrength > 0
                                            ? t(`pwreset.strength.${passwordStrength}`)
                                            : t("pwreset.new.strength")}
                                    </span>
                                </div>
                            </div>

                            <PasswordField label={t("pwreset.new.confirm")} value={confirmPassword} onChange={setConfirmPassword} />

                            <ul className="space-y-1.5">
                                <Rule ok={longEnough}>{t("pwreset.new.ruleLength", { n: MIN_LENGTH })}</Rule>
                                <Rule ok={hasLettersAndDigits}>{t("pwreset.new.ruleMix")}</Rule>
                                <Rule ok={passwordsMatch}>{t("pwreset.new.ruleMatch")}</Rule>
                            </ul>

                            <button
                                type="submit"
                                disabled={isLoading || !isFormValid}
                                className="w-full h-[52px] rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E]
                                           hover:bg-[#2D2D2D] active:scale-[0.99]
                                           disabled:bg-[#D6D2C8] disabled:cursor-not-allowed
                                           shadow-[0_8px_20px_-10px_rgba(30,30,30,0.6)] disabled:shadow-none
                                           transition-all duration-200 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {t("pwreset.new.saving")}
                                    </>
                                ) : (
                                    t("pwreset.new.submit")
                                )}
                            </button>
                        </form>
                    </motion.div>
                ) : (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-6 sm:px-8 py-14 text-center"
                        role="status"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
                            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1E1E1E] text-[#EFFF00] mb-5"
                        >
                            <CheckCircle2 className="w-8 h-8" />
                        </motion.div>
                        <h2 dir={dir} className="text-[22px] font-bold tracking-tight text-[#1E1E1E] mb-2">{t("pwreset.done.title")}</h2>
                        <p dir={dir} className="text-[14px] text-[#6B6760]">{t("pwreset.done.body", { email: email ?? "" })}</p>
                        <div className="mt-6 inline-flex items-center gap-2 text-[13px] text-[#8A847A]">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span dir={dir}>{t("pwreset.done.opening")}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AuthCardShell>
    );
}
