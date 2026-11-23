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
    ArrowRight,
    CheckCircle2,
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
    type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { normalizeIraqiMobile, resolveI18n } from "@scheniders/shared";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { BUSINESS_TYPES, isBusinessTypeId, type BusinessTypeId } from "@/lib/business-types";
import { supabase } from "@/lib/supabase";
import { AuthCaptcha, useAuthCaptcha } from "@/components/auth/auth-captcha";
import { SignupPhoneCheck, useSignupPhoneCodeSwitch } from "@/components/auth/signup-phone-check";
import { StoreAddressField, storeAddressSendable, useStoreAddress } from "@/components/auth/store-address-field";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { FermiSignupPixel } from "@/components/auth/fermi-signup-pixel";
import { AuthHero } from "@/components/auth/auth-hero";
import { trackSignupComplete } from "@/lib/fermi-pixel";
import { TRIAL_DAYS } from "@/lib/trial";

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

/** `?sells=clothing,perfume` from a marketing page ticks those answers first. */
function sellsFromLink(raw: string | null): BusinessTypeId[] {
    const ids = (raw ?? "").split(",").map((id) => id.trim());
    return [...new Set(ids.filter(isBusinessTypeId))];
}

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

function SignupForm() {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    // usefermi.com's sign-up sheet hands over what the owner already typed there
    // (?name=, ?phone=, ?slug=, ?sells=), so they are not asked twice.
    const [businessName, setBusinessName] = useState(() => (searchParams.get("name") ?? "").trim().slice(0, 120));
    const [contactPhone, setContactPhone] = useState(() => normalizeIraqiMobile(searchParams.get("phone")) ?? "");
    const [city, setCity] = useState("");
    // «شنو تبيع؟», in the order ticked: the first picks the store's content pack.
    const [sells, setSells] = useState<BusinessTypeId[]>(() => sellsFromLink(searchParams.get("sells")));
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    /** The address the confirm link went to; the form is replaced by "check your email". */
    const [sentTo, setSentTo] = useState<string | null>(null);
    const captcha = useAuthCaptcha();
    // While the console's switch is on, the owner proves their WhatsApp number with a code (B11).
    const phoneCode = useSignupPhoneCodeSwitch();
    const [phoneProof, setPhoneProof] = useState<string | null>(null);
    // The store's address, offered from its name and the merchant's to change (B11).
    const storeAddress = useStoreAddress(businessName, searchParams.get("slug"));

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

    const toggleSells = (id: BusinessTypeId) =>
        setSells((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const isFormValid =
        sells.length > 0 &&
        email.length > 0 &&
        password.length >= 8 &&
        businessName.trim().length > 0 &&
        storeAddressSendable(storeAddress.state) &&
        (phoneCode.on !== true || phoneProof !== null);

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
                if (data.code === "slug_taken") {
                    // Shown at the address field, with a free one to take.
                    storeAddress.markTaken(storeAddress.slug, typeof data.suggestion === "string" ? data.suggestion : null);
                    setIsLoading(false);
                    return;
                }
                if (data.code === "phone_unverified") {
                    // The proof ran out or the switch was turned on while the page was open.
                    setPhoneProof(null);
                    phoneCode.markOn();
                    setError(t("signup.code.again"));
                    setIsLoading(false);
                    return;
                }
                setError(
                    data.code === "captcha_failed"
                        ? t("signup.captchaRejected")
                        : data.code === "slug_invalid"
                          ? t("signup.addressInvalid")
                          : data.error || "Something went wrong. Please try again.",
                );
                setIsLoading(false);
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
            if (!sent) setError(t("signup.confirmSendFailed"));
            setIsLoading(false);
        } catch {
            setError("Network error. Please check your connection and try again.");
            setIsLoading(false);
        }
    };

    const cityField = (
        <div>
            <label className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.city")}</label>
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MapPin className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                </div>
                <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t("signup.cityPlaceholder")}
                    className="w-full h-[52px] pl-10 pr-3 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
                />
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
                    </div>
                ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    {/* Status Messages */}
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#FCEEF1]"
                            >
                                <AlertCircle className="w-[18px] h-[18px] text-[#E5243B] flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{error}</p>
                            </motion.div>
                        )}
                        {success && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#E8F8E0]"
                            >
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <p dir={dir} className="text-left text-sm text-[#1E1E1E]">{success}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <SectionHeader step={1} title={t("signup.section.store")} />

                    {/* What do you sell (B10) */}
                    <motion.fieldset initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
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
                    </motion.fieldset>

                    {/* Business Name */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
                        <label htmlFor="signup-business-name" className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.businessName")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Building2 className="w-[18px] h-[18px] text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                id="signup-business-name"
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder={t("signup.businessNamePlaceholder")}
                                required
                                className="w-full h-[52px] pl-11 pr-4 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
                            />
                        </div>
                    </motion.div>

                    {/* Store address (B11) */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.375 }}>
                        <StoreAddressField address={storeAddress} t={t} dir={dir} />
                    </motion.div>

                    <SectionHeader step={2} title={t("signup.section.account")} />

                    {/* Email */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                        <label className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.email")}</label>
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
                                className="w-full h-[52px] pl-11 pr-4 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
                            />
                        </div>
                    </motion.div>

                    {/* Password */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
                        <label className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.password")}</label>
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
                                className="w-full h-[52px] pl-11 pr-12 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
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
                    {phoneCode.on === true ? (
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="space-y-4">
                            <SignupPhoneCheck
                                phone={contactPhone}
                                onPhoneChange={setContactPhone}
                                proof={phoneProof}
                                onProof={setPhoneProof}
                                captcha={captcha}
                                t={t}
                                dir={dir}
                            />
                            {cityField}
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[13px] font-semibold text-[#1E1E1E] mb-2">{t("signup.phone")}</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                        <Phone className="w-4 h-4 text-[#A8A196] group-focus-within:text-[#1E1E1E] transition-colors" />
                                    </div>
                                    <input
                                        type="tel"
                                        value={contactPhone}
                                        onChange={(e) => setContactPhone(e.target.value)}
                                        placeholder="07XXXXXXXX"
                                        className="w-full h-[52px] pl-10 pr-3 rounded-2xl bg-white border border-[#E2DCCF] text-[15.5px] text-[#1E1E1E] placeholder:text-[#C2BCB0] shadow-[0_1px_2px_rgba(30,30,30,0.04)] hover:border-[#CFC8B9] focus:border-[#1E1E1E] focus:outline-none focus:ring-4 focus:ring-[#EFFF00]/50 transition"
                                    />
                                </div>
                            </div>
                            {cityField}
                        </motion.div>
                    )}

                    <AuthCaptcha captcha={captcha} />

                    {/* Submit */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                        <button
                            type="submit"
                            disabled={isLoading || !isFormValid || !captcha.ready}
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
                    </motion.div>
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

export default function SignupPage() {
    return (
        <AuthCardShell showBack={false} aside={<AuthHero variant="signup" />} bare>
            <FermiSignupPixel />
            <Suspense
                fallback={
                    <div className="py-16 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 animate-spin text-[#1E1E1E]" />
                    </div>
                }
            >
                <SignupForm />
            </Suspense>
        </AuthCardShell>
    );
}
