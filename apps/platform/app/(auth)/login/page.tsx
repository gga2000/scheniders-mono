"use client";

import { safeRedirectPath } from "@scheniders/shared/safe-redirect-path";
import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle, CheckCircle2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { AuthCardHeading, AuthCardShell } from "@/components/auth/auth-card-shell";

/** Smooth two-tone ring spinner — replaces the default Loader2 for a more premium feel. */
function ButtonSpinner() {
    return (
        <motion.svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </motion.svg>
    );
}

/** Checkmark that draws itself in on success. */
function SuccessCheck() {
    return (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden>
            <motion.path
                d="M20 6 9 17l-5-5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
            />
        </svg>
    );
}

function LoginForm() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { signIn, signInWithGoogle, user, isLoading: authLoading } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const captcha = useAuthCaptcha();

    const returnTo = safeRedirectPath(searchParams.get("returnTo"));

    // Redirect if already logged in
    useEffect(() => {
        if (user && !authLoading) {
            router.push(returnTo);
        }
    }, [user, authLoading, router, returnTo]);

    // Check for password reset success
    useEffect(() => {
        if (searchParams.get("reset") === "success") {
            setSuccess("Password updated successfully! Please sign in with your new password.");
        }
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            const { error: authError } = await signIn(email, password, captcha.token);
            captcha.reset();

            if (authError) {
                if (authError.message.includes("Invalid login credentials")) {
                    setError("Invalid email or password. Please try again.");
                } else {
                    setError(authError.message);
                }
                setIsLoading(false);
                return;
            }

            // Success — redirect
            setSuccess("Welcome back! Redirecting...");
            router.push(returnTo);
        } catch {
            captcha.reset();
            setError("An unexpected error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError(null);
        setIsLoading(true);
        // signInWithOAuth redirects the browser to Google on success; an error
        // means the redirect never started (e.g. the provider isn't enabled yet).
        const { error: oauthError } = await signInWithGoogle(returnTo);
        if (oauthError) {
            setError(oauthError.message);
            setIsLoading(false);
        }
    };

    const isFormValid = email.length > 0 && password.length >= 6 && captcha.ready;

    return (
        <div className="px-6 sm:px-8 pt-3 pb-8">
            <AuthCardHeading icon={<LogIn className="w-5 h-5" />} title={t("login.title")} subtitle={t("login.subtitle")} />

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

                    {/* Email Input */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">
                            {t("login.email")}
                        </label>
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

                    {/* Password Input */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <label className="block text-[13px] font-medium text-[#1E1E1E] mb-2">
                            {t("login.password")}
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Lock className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                                minLength={6}
                                className="w-full h-12 pl-11 pr-12 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/40 transition"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </motion.div>

                    {/* Remember Me & Forgot Password */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex items-center justify-between"
                    >
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-5 h-5 rounded-md border-2 border-[#E8E4DC] bg-white peer-checked:bg-[#1E1E1E] peer-checked:border-[#1E1E1E] transition-all">
                                    {rememberMe && (
                                        <svg className="w-full h-full text-white p-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </div>
                            </div>
                            <span className="text-sm text-[#6B6B6B] group-hover:text-[#1E1E1E] transition-colors">
                                {t("login.rememberMe")}
                            </span>
                        </label>
                        <Link
                            href="/forgot-password"
                            className="text-sm text-[#6B6B6B] hover:text-[#1E1E1E] transition-colors"
                        >
                            {t("login.forgot")}
                        </Link>
                    </motion.div>

                    <AuthCaptcha captcha={captcha} />

                    {/* Submit Button */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <button
                            type="submit"
                            disabled={isLoading || !isFormValid}
                            className={`group relative w-full h-12 rounded-2xl font-semibold text-[15px] text-white overflow-hidden bg-[#1E1E1E] hover:bg-black transition-colors ${
                                isLoading || success ? "cursor-default" : isFormValid ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                            }`}
                        >
                            {/* Success: wash the button to green */}
                            <AnimatePresence>
                                {success && (
                                    <motion.span
                                        key="success-bg"
                                        aria-hidden
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.3 }}
                                        className="absolute inset-0 bg-gradient-to-r from-[#3E9B5F] to-[#4FB06E]"
                                    />
                                )}
                            </AnimatePresence>

                            {/* Loading: light sweeps across the button to signal progress */}
                            {isLoading && !success && (
                                <motion.span
                                    aria-hidden
                                    className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                                    initial={{ x: "-150%" }}
                                    animate={{ x: "450%" }}
                                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                                />
                            )}

                            {/* Content morphs between the three states */}
                            <span className="relative flex items-center justify-center gap-2">
                                <AnimatePresence mode="wait" initial={false}>
                                    {success ? (
                                        <motion.span
                                            key="success"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            transition={{ type: "spring", stiffness: 320, damping: 22 }}
                                            className="flex items-center gap-2"
                                        >
                                            <SuccessCheck />
                                            <span>Welcome back</span>
                                        </motion.span>
                                    ) : isLoading ? (
                                        <motion.span
                                            key="loading"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex items-center gap-2"
                                        >
                                            <ButtonSpinner />
                                            <span>{t("login.submitting")}</span>
                                        </motion.span>
                                    ) : (
                                        <motion.span
                                            key="idle"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {t("login.submit")}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </span>
                        </button>
                    </motion.div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-[#E8E4DC]" />
                        <span className="text-xs text-[#9A9A9A]">{t("login.or")}</span>
                        <div className="h-px flex-1 bg-[#E8E4DC]" />
                    </div>

                    {/* Continue with Google */}
                    <button
                        type="button"
                        onClick={handleGoogle}
                        disabled={isLoading}
                        className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[#1E1E1E] bg-white border border-[#ECE8DD] hover:bg-[#FAF8F3] hover:border-[#D6D0C2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all duration-200"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
                            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
                            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z"/>
                        </svg>
                        <span>{t("login.google")}</span>
                    </button>
                </form>
        </div>
    );
}

export default function LoginPage() {
    return (
        <AuthCardShell showBack={false}>
            <Suspense
                fallback={
                    <div className="px-6 sm:px-8 py-16 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 animate-spin text-[#1E1E1E]" />
                    </div>
                }
            >
                <LoginForm />
            </Suspense>
        </AuthCardShell>
    );
}
