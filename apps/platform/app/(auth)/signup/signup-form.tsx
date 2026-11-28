"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Eye,
    EyeOff,
    Mail,
    Lock,
    Loader2,
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    Building2,
    Phone,
    MapPin,
    Shirt,
    SprayCan,
    Sparkles,
    Smartphone,
    Sofa,
    Car,
    Baby,
    BookOpen,
    Watch,
    UtensilsCrossed,
    Package,
    ShieldCheck,
    Lightbulb,
    type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { governorateLabel, IRAQ_GOVERNORATES, isValidIraqiMobile, resolveI18n, toLatinDigits } from "@scheniders/shared";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { BUSINESS_TYPES, type BusinessTypeId } from "@/lib/business-types";
import type { SignupHandover } from "@/lib/signup-handover";
import { supabase } from "@/lib/supabase";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { SignupPhoneCheck, useSignupPhoneCodeSwitch } from "@/components/auth/signup-phone-check";
import { StoreAddressField, storeAddressSendable, useStoreAddress } from "@/components/auth/store-address-field";
import { PasswordRule } from "@/components/auth/password-rule";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { WeakPasswordNote } from "@/components/auth/weak-password-note";
import {
    PASSWORD_LONG_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    passwordIsWeak,
    passwordLongEnough,
    passwordTips,
    WEAK_PASSWORD_MESSAGE_KEYS,
    weakPasswordReason,
} from "@/lib/password-policy";
import { trackSignupComplete } from "@/lib/fermi-pixel";
import { TRIAL_DAYS } from "@/lib/trial";
import { latinDigitsValue } from "@/lib/latin-digits-input";

const BUSINESS_TYPE_ICONS: Record<string, LucideIcon> = {
    Shirt,
    SprayCan,
    Sparkles,
    Smartphone,
    Sofa,
    Car,
    Baby,
    BookOpen,
    Watch,
    UtensilsCrossed,
    Package,
};

/** A numbered step heading: the store first, then the owner's own account. */
function SectionHeader({ step, title }: { step: number; title: string }) {
    // Laid out like the rest of the form (the app stays LTR), so it lines up with the labels below.
    return (
        <div className="flex items-center gap-3 pt-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EFFF00] text-[13px] font-bold text-[#1E1E1E] tabular-nums">
                {step}
            </span>
            <span className="text-[15px] font-bold text-[#1E1E1E]">{title}</span>
            <span aria-hidden className="h-px flex-1 bg-[#E2DCCF]" />
        </div>
    );
}

/** A field the form can point at: its mistake shows under it and the page scrolls to it. */
type SignupField = "sells" | "businessName" | "storeAddress" | "email" | "password" | "phone";

const FIELD_IDS: Record<SignupField, string> = {
    sells: "signup-sells",
    businessName: "signup-business-name",
    storeAddress: "signup-store-address",
    email: "signup-email",
    password: "signup-password",
    phone: "signup-phone",
};

/** How the page left open after sign-up asks whether the email was confirmed elsewhere. */
const WAIT_FAST_EVERY_MS = 4_000;
const WAIT_SLOW_EVERY_MS = 10_000;
/** Every 4 s for the first 10 minutes, then every 10 s, then not at all after 30 minutes. */
const WAIT_FAST_MS = 10 * 60_000;
const WAIT_GIVE_UP_MS = 30 * 60_000;

function isConfirmedAnswer(body: unknown): boolean {
    if (typeof body !== "object" || body === null || !("data" in body)) return false;
    const { data } = body;
    return typeof data === "object" && data !== null && "confirmed" in data && data.confirmed === true;
}

/** Something, an @, a dot and something: the server checks the rest. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with a field, right under it. */
function FieldError({ id, message, dir }: { id: string; message: string | null; dir: "rtl" | "ltr" }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] font-medium text-[#C81E33]" data-testid={id}>
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span dir={dir} className="text-left">{message}</span>
        </p>
    );
}

/**
 * The sign-up form. It opens filled in with what usefermi.com's sign-up sheet
 * already asked (`handover`, read by the page on the server), so the server
 * HTML carries the whole form, ready before the page's code has loaded.
 */
export function SignupForm({ handover }: { handover: SignupHandover }) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [businessName, setBusinessName] = useState(handover.name);
    const [contactPhone, setContactPhone] = useState(handover.phone);
    /** The governorate's Arabic name, the way shops' cities are stored and matched. */
    const [city, setCity] = useState("");
    // «شنو تبيع؟», in the order ticked: the first picks the store's content pack.
    const [sells, setSells] = useState<BusinessTypeId[]>(handover.sells);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    /** A problem with no field of its own (security check, network), shown by the button. */
    const [error, setError] = useState<string | null>(null);
    /** The field that stops the form; `message` is null where the field shows its own reason. */
    const [fieldError, setFieldError] = useState<{ field: SignupField; message: string | null } | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    /** The address the confirm link went to; the form is replaced by "check your email". */
    const [sentTo, setSentTo] = useState<string | null>(null);
    /**
     * Lets this page ask whether the new account's email is confirmed yet: the
     * link is mostly opened on the owner's phone, and this page then carries
     * on here by itself (lib/signup-wait.ts).
     */
    const [waitTicket, setWaitTicket] = useState<{ userId: string; ticket: string } | null>(null);
    /** The email was confirmed on another device: this page signs in and opens the app. */
    const [confirmedElsewhere, setConfirmedElsewhere] = useState(false);
    const captcha = useAuthCaptcha();
    // While the console's switch is on, the owner proves their WhatsApp number with a code (B11).
    const phoneCode = useSignupPhoneCodeSwitch();
    const [phoneProof, setPhoneProof] = useState<string | null>(null);
    // The store's address, offered from its name and the merchant's to change (B11).
    const storeAddress = useStoreAddress(businessName, handover.slug);

    // The form arrives in the page's HTML, so on a slow phone the owner can type
    // (or the browser can autofill) seconds before the page's code runs. React's
    // next render would write the state back over those fields and wipe them, so
    // take what the fields hold into state first. Looked up by id: the fields
    // carry no name, so a submit before the code runs sends nothing anywhere.
    const formRef = useRef<HTMLFormElement>(null);
    useEffect(() => {
        const fields = formRef.current?.elements;
        if (!fields) return;
        const typed = (id: string): string | null => {
            const field = fields.namedItem(id);
            return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : null;
        };
        const early = {
            businessName: typed("signup-business-name"),
            email: typed("signup-email"),
            password: typed("signup-password"),
            phone: typed("signup-phone"),
            city: typed("signup-governorate"),
        };
        if (early.businessName !== null) setBusinessName(early.businessName);
        if (early.email !== null) setEmail(early.email);
        if (early.password !== null) setPassword(early.password);
        if (early.phone !== null) setContactPhone(toLatinDigits(early.phone));
        if (early.city !== null) setCity(early.city);
    }, []);

    // Every new mistake brings its field into view and puts the cursor in it,
    // so one far up the form is never missed below the button.
    useEffect(() => {
        if (!fieldError) return;
        const target = document.getElementById(FIELD_IDS[fieldError.field]);
        if (!target) return;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
        const focusable = target.matches("input, select, button") ? target : target.querySelector<HTMLElement>("input, select, button");
        focusable?.focus({ preventScroll: true });
    }, [fieldError]);

    const errorFor = (field: SignupField) => (fieldError?.field === field ? fieldError.message : null);
    /** Editing the field the mistake is in takes the message away. */
    const clearError = (field: SignupField) => setFieldError((current) => (current?.field === field ? null : current));
    const borderFor = (field: SignupField) =>
        errorFor(field)
            ? "border-[#E5243B] hover:border-[#E5243B] focus:border-[#E5243B]"
            : "border-[#E2DCCF] hover:border-[#CFC8B9] focus:border-[#1E1E1E]";

    const longEnough = passwordLongEnough(password);
    // Accepted all the same (Ali): said so kindly, and asked again in a week.
    const weak = longEnough && passwordIsWeak(password);
    const tips = passwordTips(password);

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

    /**
     * The email is confirmed (on the phone, most often): sign in here with the
     * email and password just typed, through Supabase like any sign-in, and open
     * the app where the confirm link would have.
     */
    const continueHere = useCallback(async () => {
        if (!sentTo) return;
        setError(null);
        setIsLoading(true);
        const captchaToken = await captcha.fresh();
        if (captcha.enabled && !captchaToken) {
            setError(t("signup.wait.captcha"));
            setIsLoading(false);
            return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: sentTo, password, options: { captchaToken } });
        captcha.reset();
        if (signInError) {
            setError(t("signup.wait.signInFailed"));
            setIsLoading(false);
            return;
        }
        // Where the confirm link would have opened the app (sendConfirmMail).
        router.push("/store");
    }, [sentTo, password, captcha, t, router]);

    // While "check your email" is up, ask every few seconds (and as soon as the
    // owner comes back to this tab) whether the link was opened elsewhere.
    useEffect(() => {
        if (!waitTicket || confirmedElsewhere) return;
        let stopped = false;
        let asking = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const started = Date.now();
        const ask = async () => {
            if (stopped || asking) return;
            asking = true;
            clearTimeout(timer);
            const res = await fetch("/api/auth/signup/wait", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: waitTicket.userId, ticket: waitTicket.ticket }),
                // Offline for a moment (the owner is on their phone): the next round asks again.
            }).catch(() => null);
            asking = false;
            if (stopped) return;
            if (res?.ok) {
                const body: unknown = await res.json().catch(() => null);
                if (isConfirmedAnswer(body)) {
                    stopped = true;
                    setConfirmedElsewhere(true);
                    void continueHere();
                    return;
                }
            } else if (res && res.status !== 429) {
                // The ticket is not known or has run out: the owner signs in from the link or the login page.
                stopped = true;
                return;
            }
            const waited = Date.now() - started;
            if (waited > WAIT_GIVE_UP_MS) return;
            timer = setTimeout(ask, waited < WAIT_FAST_MS ? WAIT_FAST_EVERY_MS : WAIT_SLOW_EVERY_MS);
        };
        timer = setTimeout(ask, WAIT_FAST_EVERY_MS);
        const onBack = () => {
            if (document.visibilityState === "visible") void ask();
        };
        document.addEventListener("visibilitychange", onBack);
        window.addEventListener("focus", onBack);
        return () => {
            stopped = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onBack);
            window.removeEventListener("focus", onBack);
        };
    }, [waitTicket, confirmedElsewhere, continueHere]);

    const toggleSells = (id: BusinessTypeId) => {
        clearError("sells");
        setSells((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    /** The first field, top to bottom, that stops the form, and what to tell the owner. */
    const firstMistake = (): { field: SignupField; message: string | null } | null => {
        if (sells.length === 0) return { field: "sells", message: t("signup.err.sells") };
        if (businessName.trim().length === 0) return { field: "businessName", message: t("signup.err.businessName") };
        // The address field says itself why it cannot be used yet.
        if (!storeAddressSendable(storeAddress.state)) return { field: "storeAddress", message: null };
        const typedEmail = email.trim();
        if (typedEmail.length === 0) return { field: "email", message: t("signup.err.emailMissing") };
        if (!EMAIL_SHAPE.test(typedEmail)) return { field: "email", message: t("signup.err.emailInvalid") };
        if (!longEnough) return { field: "password", message: t("signup.err.passwordShort", { n: PASSWORD_MIN_LENGTH }) };
        // Optional, but a number that is there must be an Iraqi mobile: it is the store's WhatsApp.
        if (contactPhone.trim().length > 0 && !isValidIraqiMobile(contactPhone)) {
            return { field: "phone", message: t("signup.err.phoneInvalid") };
        }
        if (phoneCode.on === true && phoneProof === null) return { field: "phone", message: t("signup.code.again") };
        return null;
    };

    /** The server's refusals that belong to one field: the password, or an email already used. */
    const serverFieldError = (data: { code?: unknown; reasons?: unknown; field?: unknown }) => {
        if (data.code === "weak_password") {
            return {
                field: "password" as const,
                message: t(WEAK_PASSWORD_MESSAGE_KEYS[weakPasswordReason(data.reasons)], { n: PASSWORD_MIN_LENGTH }),
            };
        }
        if (data.code === "email_taken") return { field: "email" as const, message: t("signup.err.emailTaken") };
        if (data.code === "invalid") {
            if (data.field === "email") return { field: "email" as const, message: t("signup.err.emailInvalid") };
            if (data.field === "password") {
                return { field: "password" as const, message: t("signup.err.passwordShort", { n: PASSWORD_MIN_LENGTH }) };
            }
            if (data.field === "business_name") return { field: "businessName" as const, message: t("signup.err.businessName") };
            if (data.field === "contact_phone") return { field: "phone" as const, message: t("signup.err.phoneInvalid") };
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const mistake = firstMistake();
        setFieldError(mistake);
        if (mistake) return;
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                    business_name: businessName.trim(),
                    business_types: sells,
                    slug: storeAddress.slug,
                    contact_phone: contactPhone.trim() || undefined,
                    city: city.trim() || undefined,
                    captcha_token: captcha.token,
                    phone_proof: phoneCode.on === true ? (phoneProof ?? undefined) : undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // The server spent this token whatever the outcome.
                captcha.reset();
                setIsLoading(false);
                if (data.code === "slug_taken") {
                    // Shown at the address field, with a free one to take.
                    storeAddress.markTaken(storeAddress.slug, typeof data.suggestion === "string" ? data.suggestion : null);
                    setFieldError({ field: "storeAddress", message: null });
                    return;
                }
                if (data.code === "phone_unverified") {
                    // The proof ran out or the switch was turned on while the page was open.
                    setPhoneProof(null);
                    phoneCode.markOn();
                    setFieldError({ field: "phone", message: t("signup.code.again") });
                    return;
                }
                const onField = serverFieldError(data);
                if (onField) {
                    setFieldError(onField);
                    return;
                }
                setError(
                    data.code === "captcha_failed"
                        ? t("signup.captchaRejected")
                        : data.code === "captcha_unavailable"
                          ? t("signup.err.captchaUnavailable")
                          : data.code === "slug_invalid"
                            ? t("signup.addressInvalid")
                            : res.status === 429
                              ? t("signup.err.tooMany")
                              : t("signup.err.failed"),
                );
                return;
            }

            trackSignupComplete({ email: email.trim(), phone: contactPhone, sells });

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
            if (typeof data.user_id === "string" && typeof data.wait_ticket === "string") {
                setWaitTicket({ userId: data.user_id, ticket: data.wait_ticket });
            }
            if (!sent) setError(t("signup.confirmSendFailed"));
            setIsLoading(false);
        } catch {
            setError(t("signup.err.network"));
            setIsLoading(false);
        }
    };

    // A pick list, not a text box: every shop names its governorate the same way.
    // A native select opens the phone's own picker and works before the page's code loads.
    const cityField = (
        <div>
            <label htmlFor="signup-governorate" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.city")}</label>
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MapPin className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                </div>
                <select
                    id="signup-governorate"
                    data-testid="signup-governorate"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={`w-full h-[52px] appearance-none pl-10 pr-9 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] ${city === "" ? "text-[#C2BCB0]" : "text-[#1E1E1E]"} shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition cursor-pointer`}
                >
                    <option value="" disabled>
                        {t("signup.cityPlaceholder")}
                    </option>
                    {IRAQ_GOVERNORATES.map((g) => (
                        <option key={g.code} value={g.name} className="text-[#1E1E1E]">
                            {governorateLabel(g.name, language)}
                        </option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <ChevronDown className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" aria-hidden />
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <h1 dir={dir} className="text-left font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[34px] sm:text-[40px] font-bold leading-[1.15] tracking-tight text-[#1E1E1E]">
                {t("signup.title")}
            </h1>
            <p dir={dir} className="mt-2 text-left text-[15px] text-[#8A847A]">{t("signup.subtitle", { count: TRIAL_DAYS })}</p>

                {sentTo ? (
                    <div className="mt-8 space-y-4">
                        <div className="flex items-start gap-3 px-4 py-4 rounded-2xl bg-white border border-[#E2DCCF]">
                            <Mail className="w-5 h-5 mt-0.5 text-[#1E1E1E] flex-shrink-0" />
                            <div dir={dir} className="text-left">
                                <p className="text-sm font-semibold text-[#1E1E1E]">{t("signup.checkEmailTitle")}</p>
                                <p className="mt-1 text-sm text-[#5F5A52]">
                                    {t("signup.checkEmailBody")} <span dir="ltr" className="font-medium text-[#1E1E1E]">{sentTo}</span>
                                </p>
                            </div>
                        </div>
                        {waitTicket &&
                            (confirmedElsewhere ? (
                                <div role="status" data-testid="signup-confirmed-elsewhere" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#E8F8E0]">
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 text-green-700 animate-spin flex-shrink-0" />
                                    ) : (
                                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                    )}
                                    <p dir={dir} className="text-left text-sm font-medium text-[#1E1E1E]">{t("signup.wait.confirmed")}</p>
                                </div>
                            ) : (
                                <div role="status" data-testid="signup-waiting" className="flex items-start gap-3 px-4 py-4 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD]">
                                    <Smartphone className="w-5 h-5 mt-0.5 text-[#1E1E1E] flex-shrink-0" aria-hidden />
                                    <div dir={dir} className="text-left">
                                        <p className="text-sm font-semibold text-[#1E1E1E]">{t("signup.wait.phoneTitle")}</p>
                                        <p className="mt-1 text-sm text-[#5F5A52]">{t("signup.wait.phoneBody")}</p>
                                        <p className="mt-2.5 flex items-center gap-2 text-xs text-[#8A847A]">
                                            <span className="relative flex h-2 w-2" aria-hidden>
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-60 motion-reduce:animate-none" />
                                                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22C55E]" />
                                            </span>
                                            {t("signup.wait.watching")}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        {error && (
                            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#FCEEF1]">
                                <AlertCircle className="w-[18px] h-[18px] text-[#E5243B] flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#E8F8E0]">
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{success}</p>
                            </div>
                        )}
                        <AuthCaptcha captcha={captcha} />
                        {confirmedElsewhere ? (
                            // Shown only when signing in here did not go through: try again, or use the login page.
                            error && !isLoading && (
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        onClick={() => void continueHere()}
                                        className="w-full h-[54px] rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E] hover:bg-black transition-colors"
                                    >
                                        {t("signup.wait.continue")}
                                    </button>
                                    <Link href="/login" className="block text-center text-[14px] font-semibold text-[#1E1E1E] underline decoration-[#EFFF00] decoration-[3px] underline-offset-4">
                                        {t("signup.signIn")}
                                    </Link>
                                </div>
                            )
                        ) : (
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isLoading}
                            className="w-full h-[54px] rounded-2xl font-semibold text-[15px] text-[#1E1E1E] bg-white border border-[#E2DCCF] hover:border-[#1E1E1E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                        )}
                    </div>
                ) : (
                <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
                    <SectionHeader step={1} title={t("signup.section.store")} />

                    {/* What do you sell (B10) */}
                    <fieldset id="signup-sells" aria-describedby={errorFor("sells") ? "signup-sells-error" : undefined}>
                        <legend className="block text-[13px] font-semibold text-[#1E1E1E]">{t("signup.sells")}</legend>
                        <p dir={dir} className="mt-1 mb-2.5 text-left text-xs text-[#8A847A]">{t("signup.sellsHint")}</p>
                        <div className="grid grid-cols-2 gap-2">
                            {BUSINESS_TYPES.map((type) => {
                                const Icon = BUSINESS_TYPE_ICONS[type.icon] ?? Package;
                                const picked = sells.includes(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        type="button"
                                        aria-pressed={picked}
                                        data-testid={`signup-sells-${type.id}`}
                                        onClick={() => toggleSells(type.id)}
                                        className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left text-[13.5px] font-medium transition active:scale-[0.98] ${
                                            picked
                                                ? "border-[#1E1E1E] bg-[#1E1E1E] text-white shadow-[0_8px_20px_-12px_rgba(30,30,30,0.55)]"
                                                : "border-[#E2DCCF] bg-white text-[#1E1E1E] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:-translate-y-px hover:border-[#1E1E1E]"
                                        }`}
                                    >
                                        <Icon className={`h-4 w-4 flex-shrink-0 ${picked ? "text-[#EFFF00]" : "text-[#A8A196]"}`} />
                                        <span dir={dir}>{resolveI18n(type.label_i18n, language)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <FieldError id="signup-sells-error" message={errorFor("sells")} dir={dir} />
                    </fieldset>

                    {/* Business Name */}
                    <div>
                        <label htmlFor="signup-business-name" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.businessName")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Building2 className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                id="signup-business-name"
                                type="text"
                                value={businessName}
                                onChange={(e) => {
                                    clearError("businessName");
                                    setBusinessName(e.target.value);
                                }}
                                placeholder={t("signup.businessNamePlaceholder")}
                                required
                                aria-invalid={errorFor("businessName") ? true : undefined}
                                aria-describedby={errorFor("businessName") ? "signup-business-name-error" : undefined}
                                className={`w-full h-[52px] pl-11 pr-4 rounded-2xl bg-white border ${borderFor("businessName")} text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition`}
                            />
                        </div>
                        <FieldError id="signup-business-name-error" message={errorFor("businessName")} dir={dir} />
                    </div>

                    {/* Store address (B11) */}
                    <div>
                        <StoreAddressField address={storeAddress} t={t} dir={dir} />
                    </div>

                    <SectionHeader step={2} title={t("signup.section.account")} />

                    {/* Email */}
                    <div>
                        <label htmlFor="signup-email" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.email")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Mail className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                id="signup-email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    clearError("email");
                                    setEmail(e.target.value);
                                }}
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                                aria-invalid={errorFor("email") ? true : undefined}
                                aria-describedby={errorFor("email") ? "signup-email-error" : undefined}
                                className={`w-full h-[52px] pl-11 pr-4 rounded-2xl bg-white border ${borderFor("email")} text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition`}
                            />
                        </div>
                        <FieldError id="signup-email-error" message={errorFor("email")} dir={dir} />
                    </div>

                    {/* Password */}
                    <div>
                        <label htmlFor="signup-password" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.password")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Lock className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                id="signup-password"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => {
                                    clearError("password");
                                    setPassword(e.target.value);
                                }}
                                placeholder={t("signup.passwordPlaceholder")}
                                autoComplete="new-password"
                                required
                                minLength={PASSWORD_MIN_LENGTH}
                                maxLength={PASSWORD_MAX_LENGTH}
                                aria-invalid={errorFor("password") ? true : undefined}
                                aria-describedby={errorFor("password") ? "signup-password-error signup-password-help" : "signup-password-help"}
                                className={`w-full h-[52px] pl-11 pr-12 rounded-2xl bg-white border ${borderFor("password")} text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <FieldError id="signup-password-error" message={errorFor("password")} dir={dir} />
                        {/* The one rule (length), ticked once met; a weak password is accepted and said so; then what would make it stronger. */}
                        <div id="signup-password-help" className="mt-3 space-y-2">
                            <PasswordStrengthMeter password={password} />
                            <ul className="space-y-1.5">
                                <PasswordRule ok={longEnough}>{t("pwreset.new.ruleLength", { n: PASSWORD_MIN_LENGTH })}</PasswordRule>
                            </ul>
                            {weak && <WeakPasswordNote />}
                            {password.length > 0 && tips.length > 0 && (
                                <p className="flex items-start gap-2 text-[12.5px] text-[#8A847A]" data-testid="signup-password-tips">
                                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8A196]" aria-hidden />
                                    <span dir={dir} className="text-left">
                                        {t("signup.password.tipsLead")}{" "}
                                        {tips
                                            .map((tip) => t(`signup.password.tip.${tip}`, { n: PASSWORD_LONG_LENGTH }))
                                            .join(language === "ar" ? "، " : ", ")}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Phone + City row */}
                    {phoneCode.on === true ? (
                        <div className="space-y-4">
                            <SignupPhoneCheck
                                phone={contactPhone}
                                onPhoneChange={setContactPhone}
                                proof={phoneProof}
                                onProof={setPhoneProof}
                                captcha={captcha}
                                t={t}
                                dir={dir}
                            />
                            <FieldError id="signup-phone-error" message={errorFor("phone")} dir={dir} />
                            {cityField}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="signup-phone" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.phone")}</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                        <Phone className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                                    </div>
                                    <input
                                        id="signup-phone"
                                        type="tel"
                                        dir="ltr"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        value={contactPhone}
                                        onChange={(e) => {
                                            clearError("phone");
                                            setContactPhone(latinDigitsValue(e));
                                        }}
                                        placeholder="07XXXXXXXXX"
                                        aria-invalid={errorFor("phone") ? true : undefined}
                                        aria-describedby={errorFor("phone") ? "signup-phone-error" : undefined}
                                        className={`w-full h-[52px] pl-10 pr-3 rounded-2xl bg-white border ${borderFor("phone")} text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition`}
                                    />
                                </div>
                                <FieldError id="signup-phone-error" message={errorFor("phone")} dir={dir} />
                            </div>
                            {cityField}
                        </div>
                    )}

                    <AuthCaptcha captcha={captcha} />

                    {/* A problem no field owns, where the owner is looking: by the button they pressed. */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                role="alert"
                                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#FCEEF1]"
                                data-testid="signup-error"
                            >
                                <AlertCircle className="w-[18px] h-[18px] text-[#E5243B] flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Submit: always pressable, so a mistake is pointed out instead of the button just staying grey. */}
                    <div>
                        <button
                            type="submit"
                            disabled={isLoading || !captcha.ready}
                            className="group relative w-full h-[54px] overflow-hidden rounded-2xl font-semibold text-[15.5px] text-white bg-[#1E1E1E] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_24px_-12px_rgba(30,30,30,0.55)] hover:bg-black active:scale-[0.99] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t("signup.submitting")}
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    {t("signup.submit")}
                                    {/* Points the way the text reads. */}
                                    <ArrowRight className={`h-[18px] w-[18px] text-[#EFFF00] transition-transform ${dir === "rtl" ? "rotate-180 group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"}`} aria-hidden />
                                </span>
                            )}
                        </button>
                    </div>
                </form>
                )}

            <p dir={dir} className="mt-8 text-center text-[14px] text-[#8A847A]">
                {t("signup.haveAccount")}{" "}
                <Link href="/login" className="font-semibold text-[#1E1E1E] underline decoration-[#EFFF00] decoration-[3px] underline-offset-4 hover:decoration-[#1E1E1E]">
                    {t("signup.signIn")}
                </Link>
            </p>

            <p dir={dir} className="mt-10 flex items-center justify-center gap-1.5 text-[12px] text-[#A8A196]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("pwreset.brandFooter")}
            </p>
        </div>
    );
}
