"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Clock, KeyRound, Loader2, Mail, MailCheck, RotateCcw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { AuthCardHeading, AuthCardShell } from "@/components/auth/auth-card-shell";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";

const RESEND_COOLDOWN_SECONDS = 60;

function ForgotPasswordForm() {
    const { resetPassword } = useAuth();
    const { t } = useLanguage();
    const dir = useTextDir();
    const linkExpired = useSearchParams().get("link") === "expired";

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const captcha = useAuthCaptcha();

    useEffect(() => {
        if (cooldown <= 0) return;
        const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldown]);

    const send = async (address: string) => {
        setError(null);
        setIsLoading(true);
        try {
            const { error: resetError } = await resetPassword(address, captcha.token);
            if (resetError) {
                setError(resetError.message);
                return;
            }
            setSentTo(address);
            setCooldown(RESEND_COOLDOWN_SECONDS);
        } catch {
            setError(t("pwreset.forgot.unexpected"));
        } finally {
            setIsLoading(false);
            captcha.reset();
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void send(email.trim());
    };

    const startOver = () => {
        setSentTo(null);
        setError(null);
        setEmail("");
    };

    return (
        <AuthCardShell>
            <AnimatePresence mode="wait">
                {sentTo === null ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="px-6 sm:px-8 pb-8"
                    >
                        <AuthCardHeading
                            icon={<KeyRound className="w-5 h-5" />}
                            title={t("pwreset.forgot.title")}
                            subtitle={t("pwreset.forgot.subtitle")}
                        />

                        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                            {linkExpired && !error && (
                                <div
                                    role="status"
                                    className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FFF8E1] border border-[#F3E2A9] text-[13px] text-[#1E1E1E]"
                                >
                                    <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#A07800]" />
                                    <span dir={dir} className="text-left">{t("pwreset.forgot.expired")}</span>
                                </div>
                            )}
                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF] text-[13px] text-[#1E1E1E]"
                                >
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                                    <span dir={dir} className="text-left">{error}</span>
                                </div>
                            )}

                            <div>
                                <label htmlFor="reset-email" className="block text-[13px] font-medium text-[#1E1E1E] mb-2">
                                    {t("pwreset.forgot.email")}
                                </label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors pointer-events-none" />
                                    <input
                                        id="reset-email"
                                        type="email"
                                        inputMode="email"
                                        dir="ltr"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        autoFocus
                                        required
                                        className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                                    />
                                </div>
                            </div>

                            <AuthCaptcha captcha={captcha} className="empty:hidden" />

                            <button
                                type="submit"
                                disabled={isLoading || !email.trim() || !captcha.ready}
                                className="w-full h-12 rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t("pwreset.forgot.sending")}
                                    </>
                                ) : (
                                    t("pwreset.forgot.submit")
                                )}
                            </button>
                        </form>
                    </motion.div>
                ) : (
                    <motion.div
                        key="sent"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-6 sm:px-8 pb-8"
                    >
                        <AuthCardHeading
                            icon={<MailCheck className="w-5 h-5" />}
                            title={t("pwreset.sent.title")}
                            subtitle={t("pwreset.sent.body")}
                        />
                        <p
                            role="status"
                            className="mt-5 px-4 py-3 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[14px] font-medium text-[#1E1E1E] break-all"
                            dir="ltr"
                        >
                            {sentTo}
                        </p>

                        <ul className="mt-5 space-y-2.5 text-[13px] text-[#5F5A52]">
                            <li className="flex items-start gap-2.5">
                                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-[#8A847A]" />
                                <span dir={dir} className="text-left">{t("pwreset.sent.tipSpam")}</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#8A847A]" />
                                <span dir={dir} className="text-left">{t("pwreset.sent.tipOnce")}</span>
                            </li>
                        </ul>

                        {error && (
                            <div
                                role="alert"
                                className="mt-5 flex items-start gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF] text-[13px] text-[#1E1E1E]"
                            >
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                                <span dir={dir} className="text-left">{error}</span>
                            </div>
                        )}

                        <AuthCaptcha captcha={captcha} className="mt-5 empty:hidden" />

                        <div className="mt-6 grid gap-2.5">
                            <button
                                type="button"
                                onClick={() => void send(sentTo)}
                                disabled={isLoading || cooldown > 0 || !captcha.ready}
                                className="h-11 px-3 rounded-2xl font-semibold text-[14px] text-white bg-[#1E1E1E] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                {cooldown > 0 ? t("pwreset.sent.resendIn", { s: cooldown }) : t("pwreset.sent.resend")}
                            </button>
                            <button
                                type="button"
                                onClick={startOver}
                                className="h-11 px-3 rounded-2xl font-medium text-[14px] text-[#1E1E1E] bg-[#F3F0E8] hover:bg-[#ECE8DD] transition-colors"
                            >
                                {t("pwreset.sent.other")}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AuthCardShell>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ForgotPasswordForm />
        </Suspense>
    );
}
