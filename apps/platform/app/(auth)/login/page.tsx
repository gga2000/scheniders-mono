"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";

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

    const returnTo = searchParams.get("returnTo") || "/";

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
            const { error: authError } = await signIn(email, password);

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

    const isFormValid = email.length > 0 && password.length >= 6;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md relative z-10"
        >
            {/* Glassmorphic Card */}
            <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
                {/* Header Section */}
                <div className="px-8 pt-10 pb-6 text-center">
                    {/* Logo/Brand */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1E1E1E] to-[#3D3D3D] shadow-lg mb-4"
                    >
                        <Sparkles className="w-8 h-8 text-[#FBE38E]" />
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl font-bold text-[#1E1E1E] mb-1"
                    >
                        {t("login.title")}
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-[#6B6B6B] text-sm"
                    >
                        {t("login.subtitle")}
                    </motion.p>
                </div>

                {/* Form Section */}
                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
                    {/* Status Messages */}
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 p-4 rounded-xl bg-[#FCEEF1] border border-[#F4C7CF]"
                            >
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <p className="text-sm text-[#1E1E1E]">{error}</p>
                            </motion.div>
                        )}
                        {success && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 p-4 rounded-xl bg-[#E8F8E0] border border-[#C0EBA6]"
                            >
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <p className="text-sm text-[#1E1E1E]">{success}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Email Input */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                            {t("login.email")}
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Mail className="w-5 h-5 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                                className="w-full h-12 pl-12 pr-4 rounded-xl bg-white/80 border-2 border-transparent 
                                         text-[#1E1E1E] placeholder:text-[#9A9A9A]
                                         focus:border-[#FBE38E] focus:bg-white focus:outline-none
                                         transition-all duration-200"
                            />
                        </div>
                    </motion.div>

                    {/* Password Input */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                            {t("login.password")}
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Lock className="w-5 h-5 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                                minLength={6}
                                className="w-full h-12 pl-12 pr-12 rounded-xl bg-white/80 border-2 border-transparent 
                                         text-[#1E1E1E] placeholder:text-[#9A9A9A]
                                         focus:border-[#FBE38E] focus:bg-white focus:outline-none
                                         transition-all duration-200"
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

                    {/* Submit Button */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <button
                            type="submit"
                            disabled={isLoading || !isFormValid}
                            className={`group relative w-full h-12 rounded-xl font-semibold text-white overflow-hidden
                                     bg-gradient-to-r from-[#1E1E1E] to-[#3D3D3D]
                                     hover:from-[#2D2D2D] hover:to-[#4D4D4D]
                                     shadow-lg transition-all duration-200 ${
                                         isLoading || success
                                             ? "cursor-default"
                                             : isFormValid
                                                 ? "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                                                 : "opacity-50 cursor-not-allowed"
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
                        className="w-full h-12 rounded-xl font-semibold text-[#1E1E1E] bg-white border-2 border-[#E8E4DC] hover:bg-[#FAF8F4] hover:border-[#DAD4CC] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all duration-200"
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

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="px-8 py-6 bg-[#F5F0E8]/50 border-t border-[#E8E4DC]/50 text-center"
                >
                    <p className="text-sm text-[#6B6B6B]">
                        Protected by Schenider Security
                    </p>
                </motion.div>
            </div>
        </motion.div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background Elements - Static for optimization */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Floating gradient orbs */}
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-30"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-yellow) 0%, transparent 70%)",
                        top: "-200px",
                        right: "-200px",
                    }}
                    animate={{
                        scale: [1, 1.1, 1],
                        x: [0, 30, 0],
                        y: [0, -20, 0],
                    }}
                    transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
                <motion.div
                    className="absolute w-[500px] h-[500px] rounded-full opacity-25"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-green) 0%, transparent 70%)",
                        bottom: "-150px",
                        left: "-150px",
                    }}
                    animate={{
                        scale: [1, 1.15, 1],
                        x: [0, -20, 0],
                        y: [0, 30, 0],
                    }}
                    transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
                <motion.div
                    className="absolute w-[400px] h-[400px] rounded-full opacity-20"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-mint) 0%, transparent 70%)",
                        top: "50%",
                        left: "10%",
                    }}
                    animate={{
                        scale: [1, 1.2, 1],
                        y: [0, -40, 0],
                    }}
                    transition={{
                        duration: 12,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />

                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(30,30,30,1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(30,30,30,1) 1px, transparent 1px)
                        `,
                        backgroundSize: "60px 60px",
                    }}
                />
            </div>

            <Suspense fallback={
                <div className="relative z-10 p-8 bg-white/50 backdrop-blur-xl rounded-3xl shadow-xl flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#1E1E1E]" />
                </div>
            }>
                <LoginForm />
            </Suspense>
        </div>
    );
}
