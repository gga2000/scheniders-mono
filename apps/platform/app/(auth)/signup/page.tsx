"use client";

import { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    Eye,
    EyeOff,
    Mail,
    Lock,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Sparkles,
    Building2,
    Phone,
    MapPin,
} from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";

/** Every signup starts on the trial with this plan — chosen later in-app (S3-02a). */
const DEFAULT_PLAN = "growth";

function SignupForm() {
    const { t } = useLanguage();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [city, setCity] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

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
                    plan: DEFAULT_PLAN,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Something went wrong. Please try again.");
                setIsLoading(false);
                return;
            }

            setSuccess(data.message || t("signup.success"));
            // UX2-18: if this browser still holds a session for a DIFFERENT
            // account, it must be cleared before signing in as the new one.
            try {
                await supabase.auth.signOut();
            } catch {
                /* no session to clear */
            }
            // S3-02: the account is auto-confirmed server-side, so sign the
            // merchant straight in and land them on the store builder — no
            // silent bounce through an empty /login form.
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (signInError) {
                // Extremely unlikely (account was just created) — fall back to
                // the login screen rather than stranding them here.
                router.push("/login");
                return;
            }
            router.push("/store");
        } catch {
            setError("Network error. Please check your connection and try again.");
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md relative z-10"
        >
            <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
                {/* Header */}
                <div className="px-8 pt-10 pb-6 text-center">
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
                        {t("signup.title")}
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-[#6B6B6B] text-sm"
                    >
                        {t("signup.subtitle")}
                    </motion.p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
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

                    {/* Business Name */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
                        <label className="block text-sm font-medium text-[#1E1E1E] mb-1.5">{t("signup.businessName")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Building2 className="w-5 h-5 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder={t("signup.businessNamePlaceholder")}
                                required
                                className="w-full h-12 pl-12 pr-4 rounded-xl bg-white/80 border-2 border-transparent text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:border-[#FBE38E] focus:bg-white focus:outline-none transition-all duration-200"
                            />
                        </div>
                    </motion.div>

                    {/* Email */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                        <label className="block text-sm font-medium text-[#1E1E1E] mb-1.5">{t("signup.email")}</label>
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
                                className="w-full h-12 pl-12 pr-4 rounded-xl bg-white/80 border-2 border-transparent text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:border-[#FBE38E] focus:bg-white focus:outline-none transition-all duration-200"
                            />
                        </div>
                    </motion.div>

                    {/* Password */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
                        <label className="block text-sm font-medium text-[#1E1E1E] mb-1.5">{t("signup.password")}</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Lock className="w-5 h-5 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t("signup.passwordPlaceholder")}
                                autoComplete="new-password"
                                required
                                minLength={8}
                                className="w-full h-12 pl-12 pr-12 rounded-xl bg-white/80 border-2 border-transparent text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:border-[#FBE38E] focus:bg-white focus:outline-none transition-all duration-200"
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
                            <label className="block text-sm font-medium text-[#1E1E1E] mb-1.5">{t("signup.phone")}</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <Phone className="w-4 h-4 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                                </div>
                                <input
                                    type="tel"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    placeholder="07XXXXXXXX"
                                    className="w-full h-12 pl-10 pr-3 rounded-xl bg-white/80 border-2 border-transparent text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:border-[#FBE38E] focus:bg-white focus:outline-none transition-all duration-200 text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#1E1E1E] mb-1.5">{t("signup.city")}</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <MapPin className="w-4 h-4 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder={t("signup.cityPlaceholder")}
                                    className="w-full h-12 pl-10 pr-3 rounded-xl bg-white/80 border-2 border-transparent text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:border-[#FBE38E] focus:bg-white focus:outline-none transition-all duration-200 text-sm"
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Plan Selection */}
                    {/* S3-02a: no plan matrix at signup — everyone starts on
                        the free trial (default plan) and picks a paid plan
                        later from the in-app billing banner. */}

                    {/* Submit */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                        <button
                            type="submit"
                            disabled={isLoading || !isFormValid}
                            className="w-full h-12 rounded-xl font-semibold text-white bg-gradient-to-r from-[#1E1E1E] to-[#3D3D3D] hover:from-[#2D2D2D] hover:to-[#4D4D4D] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="px-8 py-5 bg-[#F5F0E8]/50 border-t border-[#E8E4DC]/50 text-center"
                >
                    <p className="text-sm text-[#6B6B6B]">
                        {t("signup.haveAccount")}{" "}
                        <Link href="/login" className="text-[#1E1E1E] font-medium hover:underline">
                            {t("signup.signIn")}
                        </Link>
                    </p>
                </motion.div>
            </div>
        </motion.div>
    );
}

export default function SignupPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-30"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-yellow) 0%, transparent 70%)",
                        top: "-200px",
                        right: "-200px",
                    }}
                    animate={{ scale: [1, 1.1, 1], x: [0, 30, 0], y: [0, -20, 0] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute w-[500px] h-[500px] rounded-full opacity-25"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-green) 0%, transparent 70%)",
                        bottom: "-150px",
                        left: "-150px",
                    }}
                    animate={{ scale: [1, 1.15, 1], x: [0, -20, 0], y: [0, 30, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(30,30,30,1) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,1) 1px, transparent 1px)`,
                        backgroundSize: "60px 60px",
                    }}
                />
            </div>

            <Suspense
                fallback={
                    <div className="relative z-10 p-8 bg-white/50 backdrop-blur-xl rounded-3xl shadow-xl flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-[#1E1E1E]" />
                    </div>
                }
            >
                <SignupForm />
            </Suspense>
        </div>
    );
}
