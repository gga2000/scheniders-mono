"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck, ArrowLeft, Store, Check, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const MIN_LENGTH = 6;

const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
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

function roleLabel(role: string | null): string | null {
    if (!role) return null;
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
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    autoFocus?: boolean;
    autoComplete: string;
}) {
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
                    autoComplete={autoComplete}
                    required
                    className="w-full h-[52px] pl-11 pr-12 rounded-2xl bg-[#FAF8F3] border border-[#E7E2D6]
                               text-[15px] text-[#1E1E1E] tracking-wide placeholder:text-[#B5AFA4]
                               focus:bg-white focus:border-[#1E1E1E] focus:ring-4 focus:ring-[#EFFF00]/40 focus:outline-none
                               transition-all duration-200"
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#A8A29E] hover:text-[#1E1E1E] hover:bg-[#F1EDE4] transition-colors"
                >
                    {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
            </span>
        </label>
    );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    return (
        <li className={`flex items-center gap-2 text-[13px] transition-colors ${ok ? "text-[#15803D]" : "text-[#8A847A]"}`}>
            <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors ${ok ? "bg-[#22C55E] text-white" : "bg-[#ECE8DD] text-transparent"}`}
            >
                <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            {children}
        </li>
    );
}

export default function ResetPasswordPage() {
    const { updatePassword, user, profile, role, tenantId } = useAuth();
    const router = useRouter();
    const { data: storeName } = useStoreName(tenantId);

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const passwordStrength = getPasswordStrength(password);
    const longEnough = password.length >= MIN_LENGTH;
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
    const isFormValid = longEnough && passwordsMatch;

    const email = user?.email ?? profile?.email ?? null;
    const displayName = profile?.display_name?.trim() || null;
    const initial = (displayName ?? email ?? "?").charAt(0).toUpperCase();
    const roleText = roleLabel(role);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!passwordsMatch) {
            setError("Passwords do not match");
            return;
        }
        if (!longEnough) {
            setError(`Password must be at least ${MIN_LENGTH} characters`);
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
            setTimeout(() => {
                router.push("/login?reset=success");
            }, 2000);
        } catch {
            setError("An unexpected error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    // No session after the auth client settles means the link was not used (or expired).
    useEffect(() => {
        const checkAuth = setTimeout(() => {
            if (!user) router.push("/forgot-password");
        }, 2000);
        return () => clearTimeout(checkAuth);
    }, [user, router]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
            {/* Atmosphere: soft lime glow and a faint dot grid */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
                <div
                    className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[520px] rounded-full opacity-60 blur-3xl"
                    style={{ background: "radial-gradient(closest-side, rgba(239,255,0,0.35), transparent)" }}
                />
                <div
                    className="absolute inset-0 opacity-[0.35]"
                    style={{
                        backgroundImage: "radial-gradient(#D6D0C2 1px, transparent 1px)",
                        backgroundSize: "22px 22px",
                        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
                        WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-[440px] relative z-10"
            >
                {/* Brand */}
                <div className="flex items-center justify-center gap-2.5 mb-7">
                    <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-[9px] shadow-sm" />
                    <span className="text-[17px] font-semibold tracking-tight text-[#1E1E1E]">Scheniders</span>
                </div>

                <div className="bg-white rounded-[28px] border border-[#ECE8DD] shadow-[0_1px_2px_rgba(30,30,30,0.04),0_24px_60px_-24px_rgba(30,30,30,0.18)] overflow-hidden">
                    <div className="h-1.5 bg-[#EFFF00]" />

                    <AnimatePresence mode="wait">
                        {!isSuccess ? (
                            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div className="px-8 pt-7">
                                    <Link
                                        href="/login"
                                        className="inline-flex items-center gap-1.5 text-[13px] text-[#8A847A] hover:text-[#1E1E1E] transition-colors"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Back to sign in
                                    </Link>

                                    <div className="mt-5 flex items-center gap-3">
                                        <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#1E1E1E] text-[#EFFF00]">
                                            <KeyRound className="w-5 h-5" />
                                        </span>
                                        <div>
                                            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-[#1E1E1E]">
                                                Choose a new password
                                            </h1>
                                            <p className="text-[13px] text-[#8A847A] mt-0.5">You will use it the next time you sign in.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Whose account this is */}
                                <div className="mx-8 mt-6 rounded-2xl bg-[#FAF8F3] border border-[#ECE8DD] p-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A8A29E] mb-3">
                                        Resetting the password for
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#1E1E1E] text-white text-[15px] font-semibold">
                                            {user ? initial : <Loader2 className="w-4 h-4 animate-spin" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            {displayName && (
                                                <p className="text-[14px] font-semibold text-[#1E1E1E] truncate">{displayName}</p>
                                            )}
                                            <p className={`truncate ${displayName ? "text-[13px] text-[#6B6760]" : "text-[14px] font-semibold text-[#1E1E1E]"}`}>
                                                {email ?? "Checking your link…"}
                                            </p>
                                        </div>
                                        {roleText && (
                                            <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-white border border-[#E7E2D6] text-[#3B3833]">
                                                {roleText}
                                            </span>
                                        )}
                                    </div>
                                    {storeName && (
                                        <div className="mt-3 pt-3 border-t border-[#ECE8DD] flex items-center gap-2 text-[13px] text-[#3B3833]">
                                            <Store className="w-4 h-4 text-[#8A847A]" />
                                            <span className="text-[#8A847A]">Store</span>
                                            <span className="font-semibold text-[#1E1E1E] truncate">{storeName}</span>
                                        </div>
                                    )}
                                </div>

                                <form onSubmit={handleSubmit} className="px-8 pt-6 pb-8 space-y-5">
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#FCEEF1] border border-[#F4C7CF]"
                                        >
                                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                            <p className="text-sm text-[#1E1E1E]">{error}</p>
                                        </motion.div>
                                    )}

                                    <div>
                                        <PasswordField
                                            label="New password"
                                            value={password}
                                            onChange={setPassword}
                                            autoFocus
                                            autoComplete="new-password"
                                        />
                                        <div className="mt-3 flex items-center gap-3">
                                            <div className="flex gap-1 flex-1">
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
                                                className="text-[12px] font-medium w-16 text-right"
                                                style={{ color: password && passwordStrength > 0 ? strengthColors[passwordStrength - 1] : "#A8A29E" }}
                                            >
                                                {password && passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : "Strength"}
                                            </span>
                                        </div>
                                    </div>

                                    <PasswordField
                                        label="Confirm new password"
                                        value={confirmPassword}
                                        onChange={setConfirmPassword}
                                        autoComplete="new-password"
                                    />

                                    <ul className="space-y-1.5">
                                        <Rule ok={longEnough}>At least {MIN_LENGTH} characters</Rule>
                                        <Rule ok={passwordsMatch}>Both passwords match</Rule>
                                    </ul>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !isFormValid}
                                        className="w-full h-[52px] rounded-2xl font-semibold text-[15px] text-white bg-[#1E1E1E]
                                                   hover:bg-[#2D2D2D] active:scale-[0.99]
                                                   disabled:bg-[#D6D2C8] disabled:text-white disabled:cursor-not-allowed
                                                   shadow-[0_8px_20px_-10px_rgba(30,30,30,0.6)] disabled:shadow-none
                                                   transition-all duration-200 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Saving…
                                            </>
                                        ) : (
                                            "Save new password"
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="px-8 py-14 text-center"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
                                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1E1E1E] text-[#EFFF00] mb-5"
                                >
                                    <CheckCircle2 className="w-8 h-8" />
                                </motion.div>
                                <h2 className="text-[22px] font-bold tracking-tight text-[#1E1E1E] mb-2">Password saved</h2>
                                <p className="text-[14px] text-[#6B6760]">
                                    {email ? <>Sign in to <span className="font-semibold text-[#1E1E1E]">{email}</span> with your new password.</> : "Sign in with your new password."}
                                </p>
                                <div className="mt-6 inline-flex items-center gap-2 text-[13px] text-[#8A847A]">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Taking you to sign in
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="px-8 py-4 bg-[#FAF8F3] border-t border-[#ECE8DD] flex items-center justify-center gap-2 text-[12px] text-[#8A847A]">
                        <ShieldCheck className="w-4 h-4" />
                        Stored encrypted. Only you know it.
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
