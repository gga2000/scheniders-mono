"use client";

import { safeRedirectPath } from "@scheniders/shared/safe-redirect-path";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowBigUpDash, ArrowRight, CheckCircle2, Fingerprint, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { AuthHero } from "@/components/auth/auth-hero";
import { GoogleMark } from "@/components/auth/google-mark";
import { LinkUsedNotice } from "@/components/auth/link-used-notice";
import { emailProblem, loginErrorKey } from "@/lib/login-errors";
import { devicePasskeyAvailable, registerPasskey, signInWithPasskey } from "@/lib/passkey-client";
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

/**
 * ?link=used: an email link that no longer works sent the owner here, most
 * often a sign-up link opened again on a second device. Login then says so and
 * does not carry a browser still signed in to some account into that account.
 */
function readLinkUsed(): boolean {
    return new URLSearchParams(window.location.search).get("link") === "used";
}

/** The address does not change while the page is open, so there is nothing to subscribe to. */
function noSubscription(): () => void {
    return () => {};
}

type LoginMethod = "email" | "google" | "passkey";
const LAST_METHOD_KEY = "fermi:last-login-method";

/** The way this browser last signed in, to point a returning owner at the same door. */
function readLastMethod(): LoginMethod | null {
    try {
        const value = window.localStorage.getItem(LAST_METHOD_KEY);
        return value === "email" || value === "google" || value === "passkey" ? value : null;
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

const PASSKEY_OFFERED_KEY = "fermi:passkey-offered";

/** Whether this browser has already been asked to turn fingerprint sign-in on. Asked once, never nagged. */
function passkeyOfferSeen(): boolean {
    try {
        return window.localStorage.getItem(PASSKEY_OFFERED_KEY) !== null;
    } catch {
        // Storage is blocked, so the answer could not be remembered: do not ask on every sign-in.
        return true;
    }
}

function markPasskeyOfferSeen() {
    try {
        window.localStorage.setItem(PASSKEY_OFFERED_KEY, "1");
    } catch {
        // Storage is blocked: passkeyOfferSeen() already answers true there.
    }
}

const FIELD_CLASS =
    "w-full h-[52px] pl-11 rounded-2xl bg-white border text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:outline-none focus:ring-4 transition";
const FIELD_OK = "border-[#E2DCCF] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:ring-[#EFFF00]/50";
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

function LastUsedBadge({ floating = false }: { floating?: boolean }) {
    const { t } = useLanguage();
    return (
        <span
            className={`rounded-full bg-[#EFFF00] px-2 py-1 text-[10.5px] font-semibold leading-none text-[#1E1E1E] ${
                floating ? "absolute -top-2.5 right-3 shadow-[0_2px_6px_rgba(30,30,30,0.12)]" : ""
            }`}
        >
            {t("login.lastUsed")}
        </span>
    );
}

/** A one-tap way in (fingerprint, Google): white tile that lifts on hover. */
function QuickButton({
    onClick,
    disabled,
    lastUsed,
    children,
}: {
    onClick: () => void;
    disabled: boolean;
    lastUsed: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="relative flex h-[54px] items-center justify-center gap-2.5 rounded-2xl border border-[#E2DCCF] bg-white text-[15px] font-semibold text-[#1E1E1E] shadow-[0_1px_2px_rgba(30,30,30,0.05)] transition hover:-translate-y-px hover:border-[#1E1E1E] hover:shadow-[0_8px_20px_-12px_rgba(30,30,30,0.35)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
        >
            {children}
            {lastUsed && <LastUsedBadge floating />}
        </button>
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
    const [passkeyReady, setPasskeyReady] = useState(false);
    const [offeringPasskey, setOfferingPasskey] = useState(false);
    // Set while a password sign-in may end on the passkey offer, so the
    // "already signed in" redirect below does not skip it.
    const holdRedirect = useRef(false);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const captcha = useAuthCaptcha();

    const linkUsed = useSyncExternalStore(noSubscription, readLinkUsed, () => false);

    // Redirect if already logged in, except after a dead email link: there the
    // owner picks between the account this browser holds and another one.
    useEffect(() => {
        if (user && !authLoading && !holdRedirect.current && !readLinkUsed()) {
            router.push(readReturnTo());
        }
    }, [user, authLoading, router]);

    // Things only the browser knows: a finished password reset, the last way in.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("reset") === "success") {
            setNotice(t("login.resetDone"));
        }
        setLastMethod(readLastMethod());
        void devicePasskeyAvailable().then(setPasskeyReady);
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
        const offerPasskey = passkeyReady && !passkeyOfferSeen();
        holdRedirect.current = offerPasskey;
        try {
            // The check usually finishes before the owner has typed; if not, wait for it here
            // instead of leaving the button greyed out with no explanation.
            const captchaToken = captcha.enabled ? (captcha.token ?? (await captcha.fresh())) : undefined;
            if (captcha.enabled && !captchaToken) {
                holdRedirect.current = false;
                setError(t("login.error.captcha"));
                setIsLoading(false);
                return;
            }
            const { error: authError } = await signIn(email.trim(), password, captchaToken);
            captcha.reset();

            if (authError) {
                holdRedirect.current = false;
                const key = loginErrorKey(authError);
                setError(t(key));
                setIsLoading(false);
                if (key === "login.error.invalid") passwordRef.current?.select();
                return;
            }

            rememberMethod("email");
            if (offerPasskey) {
                markPasskeyOfferSeen();
                setIsLoading(false);
                setOfferingPasskey(true);
                return;
            }
            setSignedIn(true);
            router.push(readReturnTo());
        } catch {
            holdRedirect.current = false;
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

    const handlePasskey = async () => {
        setError(null);
        setIsLoading(true);
        const outcome = await signInWithPasskey();
        if (outcome.ok) {
            rememberMethod("passkey");
            setSignedIn(true);
            // The session is in the cookies the server just set: load the app fresh so it is read from there.
            window.location.assign(readReturnTo());
            return;
        }
        setIsLoading(false);
        if (outcome.reason === "too_many") setError(t("login.error.rateLimit"));
        else if (outcome.reason !== "cancelled") setError(t("login.passkeyFailed"));
    };

    const finishOffer = async (turnOn: boolean) => {
        if (turnOn) {
            setIsLoading(true);
            const outcome = await registerPasskey();
            if (outcome.ok || outcome.reason === "exists") rememberMethod("passkey");
        }
        setSignedIn(true);
        router.push(readReturnTo());
    };

    const busy = isLoading || signedIn;

    if (offeringPasskey) {
        return (
            <div className="text-center">
                <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#1E1E1E] text-[#EFFF00]">
                    <Fingerprint className="h-8 w-8" aria-hidden />
                </span>
                <h1 dir={dir} className="mt-5 font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[24px] font-bold leading-snug text-[#1E1E1E]">
                    {t("login.passkeyOffer.title")}
                </h1>
                <p dir={dir} className="mt-2 text-[14px] leading-relaxed text-[#8A847A]">{t("login.passkeyOffer.body")}</p>
                <button
                    type="button"
                    onClick={() => finishOffer(true)}
                    disabled={busy}
                    className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E1E1E] text-[15px] font-semibold text-white hover:bg-black active:scale-[0.99] disabled:opacity-60 transition"
                >
                    {busy ? <ButtonSpinner /> : <Fingerprint className="h-[18px] w-[18px] text-[#EFFF00]" aria-hidden />}
                    <span>{t("login.passkeyOffer.yes")}</span>
                </button>
                <button
                    type="button"
                    onClick={() => finishOffer(false)}
                    disabled={busy}
                    className="mt-2 h-11 w-full rounded-2xl text-[14px] font-medium text-[#8A847A] hover:text-[#1E1E1E] disabled:opacity-60 transition-colors"
                >
                    {t("login.passkeyOffer.later")}
                </button>
            </div>
        );
    }

    return (
        <div>
            <h1 dir={dir} className="text-left font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[34px] sm:text-[40px] font-bold leading-[1.15] tracking-tight text-[#1E1E1E]">
                {t("login.title")}
            </h1>
            <p dir={dir} className="mt-2 text-left text-[15px] text-[#8A847A]">{t("login.subtitle")}</p>

            {linkUsed && <LinkUsedNotice onContinue={() => router.push(readReturnTo())} />}

            <AnimatePresence mode="wait">
                {error && (
                    <motion.div
                        key="error"
                        role="alert"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="mt-6 flex items-start gap-3 rounded-2xl bg-[#FCEEF1] px-4 py-3.5"
                    >
                        <AlertCircle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-[#E5243B]" />
                        <p dir={dir} className="text-left text-[14px] leading-relaxed text-[#1E1E1E]">{error}</p>
                    </motion.div>
                )}
                {notice && (
                    <motion.div
                        key="notice"
                        role="status"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="mt-6 flex items-start gap-3 rounded-2xl bg-[#E8F8E0] px-4 py-3.5"
                    >
                        <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-green-600" />
                        <p dir={dir} className="text-left text-[14px] leading-relaxed text-[#1E1E1E]">{notice}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* One-tap ways in first: a returning owner should not have to type. */}
            <div className={`mt-8 grid gap-3 ${passkeyReady ? "grid-cols-2" : "grid-cols-1"}`}>
                {passkeyReady && (
                    <QuickButton onClick={handlePasskey} disabled={busy} lastUsed={lastMethod === "passkey"}>
                        <Fingerprint className="h-5 w-5" aria-hidden />
                        <span>{t("login.passkeyShort")}</span>
                    </QuickButton>
                )}
                <QuickButton onClick={handleGoogle} disabled={busy} lastUsed={lastMethod === "google"}>
                    <GoogleMark />
                    <span>{t("login.googleShort")}</span>
                </QuickButton>
            </div>

            <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#E2DCCF]" />
                <span dir={dir} className="text-[12.5px] text-[#9A948A]">{t("login.orEmail")}</span>
                <div className="h-px flex-1 bg-[#E2DCCF]" />
            </div>

            {/* No entry animation on the fields: they would start invisible in the
                server HTML and stay so until all JS had run (see AuthCardShell). */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <label htmlFor="login-email" className="block text-[13.5px] font-medium text-[#1E1E1E]">
                            {t("login.email")}
                        </label>
                        {lastMethod === "email" && <LastUsedBadge />}
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <Mail className="w-[18px] h-[18px] text-[#B5AFA4] group-focus-within:text-[#1E1E1E] transition-colors" />
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
                            autoComplete="username webauthn"
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
                        <label htmlFor="login-password" className="block text-[13.5px] font-medium text-[#1E1E1E]">
                            {t("login.password")}
                        </label>
                        <Link href="/forgot-password" className="text-[13px] font-medium text-[#8A847A] hover:text-[#1E1E1E] transition-colors">
                            {t("login.forgot")}
                        </Link>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                            <Lock className="w-[18px] h-[18px] text-[#B5AFA4] group-focus-within:text-[#1E1E1E] transition-colors" />
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
                            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#A8A196] hover:text-[#1E1E1E] transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
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
                    className="group relative mt-1 w-full h-[54px] rounded-2xl font-semibold text-[15.5px] text-white overflow-hidden bg-[#1E1E1E] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_24px_-12px_rgba(30,30,30,0.55)] hover:bg-black active:scale-[0.99] disabled:cursor-default transition"
                >
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

                    {isLoading && !signedIn && (
                        <motion.span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                            initial={{ x: "-150%" }}
                            animate={{ x: "450%" }}
                            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                        />
                    )}

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
                                    className="flex items-center gap-2"
                                >
                                    <span>{t("login.submit")}</span>
                                    {/* Points the way the text reads. */}
                                    <ArrowRight className={`h-[18px] w-[18px] text-[#EFFF00] transition-transform ${dir === "rtl" ? "rotate-180 group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"}`} aria-hidden />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </span>
                </button>
            </form>

            <p dir={dir} className="mt-8 text-center text-[14px] text-[#8A847A]">
                {t("login.noAccount")}{" "}
                <Link href="/signup" className="font-semibold text-[#1E1E1E] underline decoration-[#EFFF00] decoration-[3px] underline-offset-4 hover:decoration-[#1E1E1E]">
                    {t("login.signUp", { count: TRIAL_DAYS })}
                </Link>
            </p>

            <p dir={dir} className="mt-10 flex items-center justify-center gap-1.5 text-[12px] text-[#A8A196]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("pwreset.brandFooter")}
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <AuthCardShell showBack={false} aside={<AuthHero variant="login" />} asideOnPhones={false} bare>
            <LoginForm />
        </AuthCardShell>
    );
}
