"use client";

import { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Eye,
    EyeOff,
    Mail,
    Lock,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Store,
    Building2,
    Phone,
    MapPin,
} from "lucide-react";
import Link from "next/link";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { AuthCardHeading, AuthCardShell } from "@/components/auth/auth-card-shell";

function SignupForm() {
    const { t } = useLanguage();
    const dir = useTextDir();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [city, setCity] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    /** The address the confirm link went to; the form is replaced by "check your email". */
    const [sentTo, setSentTo] = useState<string | null>(null);
    const captcha = useAuthCaptcha();

    /**
     * The account is created unconfirmed, so it cannot sign in until its owner
     * opens the link Supabase mails. The sign-up call spent the first CAPTCHA
     * token; Supabase checks its own.
     */
    const sendConfirmMail = async (address: string): Promise<boolean> => {
        const captchaToken = await captcha.fresh();
        const { error: resendError } = await supabase.auth.resend({
            type: "signup",
            email: address,
            options: { captchaToken, emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/store` },
        });
        captcha.reset();
        return !resendError;
    };

    const handleResend = async () => {
        if (!sentTo) return;
        setError(null);
        setSuccess(null);
        setIsLoading(true);
        const sent = await sendConfirmMail(sentTo);
        setIsLoading(false);
        if (sent) setSuccess(t("signup.confirmResent"));
        else setError(t("signup.confirmSendFailed"));
    };

    const isFormValid =
        email.length > 0 &&
        password.length >= 8 &&
        businessName.trim().length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                    business_name: businessName.trim(),
                    contact_phone: contactPhone.trim() || undefined,
                    city: city.trim() || undefined,
                    captcha_token: captcha.token,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // The server spent this token whatever the outcome.
                captcha.reset();
                setError(
                    data.code === "captcha_failed"
                        ? t("signup.captchaRejected")
                        : data.error || "Something went wrong. Please try again.",
                );
                setIsLoading(false);
                return;
            }

            // UX2-18: if this browser still holds a session for a DIFFERENT
            // account, it must be cleared before signing in as the new one.
            // supabase-js reports a missing session as success, so an error
            // here means an old session really is still attached: stop and
            // say so rather than signing in on top of another tenant.
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
                setError(t("signup.signOutFailed"));
                setIsLoading(false);
                return;
            }
            const address = email.trim();
            const sent = await sendConfirmMail(address);
            setSentTo(address);
            if (!sent) setError(t("signup.confirmSendFailed"));
            setIsLoading(false);
        } catch {
            setError("Network error. Please check your connection and try again.");
            setIsLoading(false);
        }
    };

    return (
        <div className="px-6 sm:px-8 pt-3 pb-8">
            <AuthCardHeading icon={<Store className="w-5 h-5" />} title={t("signup.title")} subtitle={t("signup.subtitle")} />

                {sentTo ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD]">
                            <Mail className="w-5 h-5 mt-0.5 text-[#1E1E1E] flex-shrink-0" />
                            <div dir={dir} className="text-left">
                                <p className="text-sm font-semibold text-[#1E1E1E]">{t("signup.checkEmailTitle")}</p>
                                <p className="mt-1 text-sm text-[#5F5A52]">
                                    {t("signup.checkEmailBody")} <span dir="ltr" className="font-medium text-[#1E1E1E]">{sentTo}</span>
                                </p>
                            </div>
                        </div>
                        {error && (
                            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#E8F8E0] border border-[#C0EBA6]">
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{success}</p>
                            </div>
                        )}
                        <AuthCaptcha captcha={captcha} />
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isLoading}
                            className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[#1E1E1E] bg-white border border-[#ECE8DD] hover:border-[#1E1E1E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t("signup.confirmSending")}
                                </span>
                            ) : (
                                t("signup.confirmResend")
                            )}
                        </button>
                    </div>
                ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    {/* Status Messages */}
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]"
                            >
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                            </motion.div>
                        )}
                        {success && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#E8F8E0] border border-[#C0EBA6]"
                            >
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{success}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Business Name */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
                        <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">{t("signup.businessName")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Building2 className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder={t("signup.businessNamePlaceholder")}
                                required
                                className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                            />
                        </div>
                    </motion.div>

                    {/* Email */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                        <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">{t("signup.email")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Mail className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                                className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                            />
                        </div>
                    </motion.div>

                    {/* Password */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
                        <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">{t("signup.password")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Lock className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t("signup.passwordPlaceholder")}
                                autoComplete="new-password"
                                required
                                minLength={8}
                                className="w-full h-12 pl-11 pr-12 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </motion.div>

                    {/* Phone + City row */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">{t("signup.phone")}</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <Phone className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                                </div>
                                <input
                                    type="tel"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    placeholder="07XXXXXXXX"
                                    className="w-full h-12 pl-10 pr-3 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">{t("signup.city")}</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <MapPin className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder={t("signup.cityPlaceholder")}
                                    className="w-full h-12 pl-10 pr-3 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                                />
                            </div>
                        </div>
                    </motion.div>

                    <AuthCaptcha captcha={captcha} />

                    {/* Submit */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                        <button
                            type="submit"
                            disabled={isLoading || !isFormValid || !captcha.ready}
                            className="w-full h-12 rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t("signup.submitting")}
                                </span>
                            ) : (
                                t("signup.submit")
                            )}
                        </button>
                    </motion.div>
                </form>
                )}

            <p className="mt-5 text-center text-[13px] text-[#8A847A]">
                <span dir={dir}>{t("signup.haveAccount")}</span>{" "}
                <Link href="/login" className="text-[#1E1E1E] font-medium hover:underline">
                    {t("signup.signIn")}
                </Link>
            </p>
        </div>
    );
}

export default function SignupPage() {
    return (
        <AuthCardShell showBack={false}>
            <Suspense
                fallback={
                    <div className="px-6 sm:px-8 py-16 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 animate-spin text-[#1E1E1E]" />
                    </div>
                }
            >
                <SignupForm />
            </Suspense>
        </AuthCardShell>
    );
}
