"use client";

import { safeRedirectPath } from "@scheniders/shared/safe-redirect-path";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowBigUpDash, CheckCircle2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { AuthCardHeading, AuthCardShell } from "@/components/auth/auth-card-shell";
import { AuthHero } from "@/components/auth/auth-hero";
import { GoogleMark } from "@/components/auth/google-mark";
import { emailProblem, loginErrorKey } from "@/lib/login-errors";
import { TRIAL_DAYS } from "@/lib/trial";

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

/**
 * Where to go after signing in. Read from the address bar when it is needed,
 * not through useSearchParams: that hook kept the whole form out of the server
 * HTML (behind Suspense), so the login card stayed blank until all JS had run.
 */
function readReturnTo(): string {
    return safeRedirectPath(new URLSearchParams(window.location.search).get("returnTo"));
}

type LoginMethod = "email" | "google";
const LAST_METHOD_KEY = "fermi:last-login-method";

/** The way this browser last signed in, to point a returning owner at the same door. */
function readLastMethod(): LoginMethod | null {
    try {
        const value = window.localStorage.getItem(LAST_METHOD_KEY);
        return value === "email" || value === "google" ? value : null;
    } catch {
        // Storage is blocked (private mode, strict settings): the hint is simply not shown.
        return null;
    }
}

function rememberMethod(method: LoginMethod) {
    try {
        window.localStorage.setItem(LAST_METHOD_KEY, method);
    } catch {
        // Storage is blocked: signing in must not fail over a cosmetic hint.
    }
}

const FIELD_CLASS =
    "w-full h-12 pl-11 rounded-2xl bg-[#FAF8F3] border text-[15px] text-[#1E1E1E] placeholder:text-[#B5AFA4] focus:bg-white focus:outline-none focus:ring-4 transition";
const FIELD_OK = "border-[#ECE8DD] focus:border-[#1E1E1E] focus:ring-[#EFFF00]/40";
const FIELD_BAD = "border-[#E5243B] focus:border-[#E5243B] focus:ring-[#E5243B]/15";

function FieldError({ id, message }: { id: string; message: string | null }) {
    const dir = useTextDir();
    if (!message) return null;
    return (
        <p id={id} dir={dir} className="mt-1.5 text-left text-[12.5px] text-[#B42318]">
            {message}
        </p>
    );
}

function LastUsedBadge() {
    const { t } = useLanguage();
    return (
        <span className="rounded-full bg-[#EFFF00] px-2 py-0.5 text-[11px] font-semibold leading-none text-[#1E1E1E]">
            {t("login.lastUsed")}
        </span>
    );
}

function LoginForm() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const { signIn, signInWithGoogle, user, isLoading: authLoading } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [lastMethod, setLastMethod] = useState<LoginMethod | null>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const captcha = useAuthCaptcha();

    // Redirect if already logged in
    useEffect(() => {
        if (user && !authLoading) {
            router.push(readReturnTo());
        }
    }, [user, authLoading, router]);

    // Things only the browser knows: a finished password reset, the last way in.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("reset") === "success") {
            setNotice(t("login.resetDone"));
        }
        setLastMethod(readLastMethod());
    }, [t]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNotice(null);

        const emailIssue = emailProblem(email);
        const passwordIssue = password.length === 0 ? "login.error.passwordRequired" : null;
        setEmailError(emailIssue ? t(emailIssue) : null);
        setPasswordError(passwordIssue ? t(passwordIssue) : null);
        if (emailIssue) {
            emailRef.current?.focus();
            return;
        }
        if (passwordIssue) {
            passwordRef.current?.focus();
            return;
        }

        setIsLoading(true);
        try {
            // The check usually finishes before the owner has typed; if not, wait for it here
            // instead of leaving the button greyed out with no explanation.
            const captchaToken = captcha.enabled ? (captcha.token ?? (await captcha.fresh())) : undefined;
            if (captcha.enabled && !captchaToken) {
                setError(t("login.error.captcha"));
                setIsLoading(false);
                return;
            }
            const { error: authError } = await signIn(email.trim(), password, captchaToken);
            captcha.reset();

            if (authError) {
                const key = loginErrorKey(authError);
                setError(t(key));
                setIsLoading(false);
                if (key === "login.error.invalid") passwordRef.current?.select();
                return;
            }

            rememberMethod("email");
            setSignedIn(true);
            router.push(readReturnTo());
        } catch {
            // signIn threw before Supabase could answer (network down, client crash): same advice either way.
            captcha.reset();
            setError(t("login.error.unexpected"));
            setIsLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError(null);
        setIsLoading(true);
        rememberMethod("google");
        // signInWithOAuth redirects the browser to Google on success; an error
        // means the redirect never started (e.g. the provider isn't enabled yet).
        const { error: oauthError } = await signInWithGoogle(readReturnTo());
        if (oauthError) {
            setError(t(loginErrorKey(oauthError)));
            setIsLoading(false);
        }
    };

    const busy = isLoading || signedIn;

    return (
        <div className="px-6 sm:px-8 pt-3 pb-7">
            <AuthCardHeading icon={<LogIn className="w-5 h-5" />} title={t("login.title")} subtitle={t("login.subtitle")} />

            {/* No entry animation on the fields: they would start invisible in the
                server HTML and stay so until all JS had run (see AuthCardShell). */}
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div
                            role="alert"
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]"
                        >
                            <AlertCircle className="w-5 h-5 text-[#E5243B] flex-shrink-0" />
                            <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                        </motion.div>
                    )}
                    {notice && (
                        <motion.div
                            role="status"
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#E8F8E0] border border-[#C0EBA6]"
                        >
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{notice}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <label htmlFor="login-email" className="block text-[13px] font-medium text-[#1E1E1E]">
                            {t("login.email")}
                        </label>
                        {lastMethod === "email" && <LastUsedBadge />}
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <Mail className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                        </div>
                        <input
                            ref={emailRef}
                            id="login-email"
                            type="email"
                            inputMode="email"
                            dir="ltr"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailError(null);
                            }}
                            placeholder="you@example.com"
                            autoComplete="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={emailError !== null}
                            aria-describedby={emailError ? "login-email-error" : undefined}
                            className={`${FIELD_CLASS} pr-4 ${emailError ? FIELD_BAD : FIELD_OK}`}
                        />
                    </div>
                    <FieldError id="login-email-error" message={emailError} />
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor="login-password" className="block text-[13px] font-medium text-[#1E1E1E]">
                            {t("login.password")}
                        </label>
                        <Link href="/forgot-password" className="text-[13px] text-[#8A847A] hover:text-[#1E1E1E] transition-colors">
                            {t("login.forgot")}
                        </Link>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <Lock className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                        </div>
                        <input
                            ref={passwordRef}
                            id="login-password"
                            type={showPassword ? "text" : "password"}
                            dir="ltr"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                            }}
                            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                            onBlur={() => setCapsLock(false)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            aria-invalid={passwordError !== null}
                            aria-describedby={passwordError ? "login-password-error" : undefined}
                            className={`${FIELD_CLASS} pr-12 ${passwordError ? FIELD_BAD : FIELD_OK}`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
                            aria-pressed={showPassword}
                            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    <FieldError id="login-password-error" message={passwordError} />
                    {capsLock && !passwordError && (
                        <p dir={dir} className="mt-1.5 flex items-center gap-1.5 text-left text-[12.5px] text-[#8A4B00]">
                            <ArrowBigUpDash className="h-4 w-4 flex-shrink-0" aria-hidden />
                            {t("login.capsLock")}
                        </p>
                    )}
                </div>

                <AuthCaptcha captcha={captcha} />

                <button
                    type="submit"
                    disabled={busy}
                    className="group relative w-full h-12 rounded-2xl font-semibold text-[15px] text-white overflow-hidden bg-[#1E1E1E] hover:bg-black active:scale-[0.99] disabled:cursor-default transition"
                >
                    {/* Success: wash the button to green */}
                    <AnimatePresence>
                        {signedIn && (
                            <motion.span
                                key="success-bg"
                                aria-hidden
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 bg-[#3E9B5F]"
                            />
                        )}
                    </AnimatePresence>

                    {/* Loading: light sweeps across the button to signal progress */}
                    {isLoading && !signedIn && (
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
                            {signedIn ? (
                                <motion.span
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                                    className="flex items-center gap-2"
                                >
                                    <SuccessCheck />
                                    <span>{t("login.welcome")}</span>
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

                <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-[#E8E4DC]" />
                    <span className="text-xs text-[#9A9A9A]">{t("login.or")}</span>
                    <div className="h-px flex-1 bg-[#E8E4DC]" />
                </div>

                <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={busy}
                    className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[#1E1E1E] bg-white border border-[#ECE8DD] hover:bg-[#FAF8F3] hover:border-[#D6D0C2] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all duration-200"
                >
                    <GoogleMark />
                    <span>{t("login.google")}</span>
                    {lastMethod === "google" && <LastUsedBadge />}
                </button>

                <p dir={dir} className="pt-1 text-center text-[13.5px] text-[#8A847A]">
                    {t("login.noAccount")}{" "}
                    <Link href="/signup" className="font-semibold text-[#1E1E1E] underline decoration-[#EFFF00] decoration-2 underline-offset-4 hover:decoration-[#1E1E1E]">
                        {t("login.signUp", { count: TRIAL_DAYS })}
                    </Link>
                </p>
            </form>
        </div>
    );
}

export default function LoginPage() {
    return (
        <AuthCardShell showBack={false} aside={<AuthHero variant="login" />} asideOnPhones={false}>
            <LoginForm />
        </AuthCardShell>
    );
}
