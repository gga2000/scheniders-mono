"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
    const { updatePassword, user } = useAuth();
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    // Password strength calculation
    const getPasswordStrength = (pwd: string) => {
        let score = 0;
        if (pwd.length >= 8) score++;
        if (pwd.length >= 12) score++;
        if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
        if (/\d/.test(pwd)) score++;
        if (/[^a-zA-Z0-9]/.test(pwd)) score++;
        return score;
    };

    const passwordStrength = getPasswordStrength(password);
    const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
    const strengthColors = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#16A34A"];

    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
    const isFormValid = password.length >= 6 && passwordsMatch;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!passwordsMatch) {
            setError("Passwords do not match");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
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

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push("/login?reset=success");
            }, 2000);
        } catch {
            setError("An unexpected error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    // Check if user is authenticated (came from reset link)
    useEffect(() => {
        // Give some time for auth to initialize
        const checkAuth = setTimeout(() => {
            if (!user) {
                // User might not have a session, redirect to forgot password
                router.push("/forgot-password");
            }
        }, 2000);

        return () => clearTimeout(checkAuth);
    }, [user, router]);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-30"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-purple) 0%, transparent 70%)",
                        top: "-200px",
                        right: "-200px",
                    }}
                    animate={{
                        scale: [1, 1.1, 1],
                        x: [0, 30, 0],
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute w-[500px] h-[500px] rounded-full opacity-25"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-yellow) 0%, transparent 70%)",
                        bottom: "-150px",
                        left: "-150px",
                    }}
                    animate={{
                        scale: [1, 1.15, 1],
                        y: [0, 30, 0],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            {/* Card */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-md relative z-10"
            >
                <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
                    {/* Back Button */}
                    <div className="px-8 pt-6">
                        <Link
                            href="/login"
                            className="inline-flex items-center gap-2 text-[#6B6B6B] hover:text-[#1E1E1E] transition-colors text-sm"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to sign in
                        </Link>
                    </div>

                    <AnimatePresence mode="wait">
                        {!isSuccess ? (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {/* Header */}
                                <div className="px-8 pt-4 pb-6 text-center">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring" }}
                                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E4C1F9] to-[#F5E8FC] shadow-lg mb-4"
                                    >
                                        <ShieldCheck className="w-8 h-8 text-[#1E1E1E]" />
                                    </motion.div>

                                    <h1 className="text-2xl font-bold text-[#1E1E1E] mb-1">
                                        Set New Password
                                    </h1>
                                    <p className="text-[#6B6B6B] text-sm">
                                        Create a strong password for your account
                                    </p>
                                </div>

                                {/* Form */}
                                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center gap-3 p-4 rounded-xl bg-[#FCEEF1] border border-[#F4C7CF]"
                                        >
                                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                            <p className="text-sm text-[#1E1E1E]">{error}</p>
                                        </motion.div>
                                    )}

                                    {/* New Password */}
                                    <div>
                                        <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                                            New Password
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
                                                required
                                                minLength={6}
                                                className="w-full h-12 pl-12 pr-12 rounded-xl bg-white/80 border-2 border-transparent 
                                                         text-[#1E1E1E] placeholder:text-[#9A9A9A]
                                                         focus:border-[#E4C1F9] focus:bg-white focus:outline-none
                                                         transition-all duration-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>

                                        {/* Password Strength Indicator */}
                                        {password && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                className="mt-3"
                                            >
                                                <div className="flex gap-1 mb-1">
                                                    {[1, 2, 3, 4, 5].map((level) => (
                                                        <div
                                                            key={level}
                                                            className="h-1 flex-1 rounded-full transition-colors duration-300"
                                                            style={{
                                                                backgroundColor: level <= passwordStrength
                                                                    ? strengthColors[passwordStrength - 1]
                                                                    : "#E8E4DC"
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-xs" style={{ color: strengthColors[passwordStrength - 1] || "#9A9A9A" }}>
                                                    {passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : "Enter password"}
                                                </p>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* Confirm Password */}
                                    <div>
                                        <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                                            Confirm Password
                                        </label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                                <Lock className="w-5 h-5 text-[#9A9A9A] group-focus-within:text-[#1E1E1E] transition-colors" />
                                            </div>
                                            <input
                                                type={showConfirmPassword ? "text" : "password"}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                required
                                                className="w-full h-12 pl-12 pr-12 rounded-xl bg-white/80 border-2 border-transparent 
                                                         text-[#1E1E1E] placeholder:text-[#9A9A9A]
                                                         focus:border-[#E4C1F9] focus:bg-white focus:outline-none
                                                         transition-all duration-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#9A9A9A] hover:text-[#1E1E1E] transition-colors"
                                            >
                                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>

                                        {/* Match Indicator */}
                                        {confirmPassword && (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className={`text-xs mt-2 ${passwordsMatch ? "text-green-600" : "text-red-500"}`}
                                            >
                                                {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
                                            </motion.p>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !isFormValid}
                                        className="w-full h-12 rounded-xl font-semibold text-white
                                                 bg-gradient-to-r from-[#1E1E1E] to-[#3D3D3D]
                                                 hover:from-[#2D2D2D] hover:to-[#4D4D4D]
                                                 disabled:opacity-50 disabled:cursor-not-allowed
                                                 shadow-lg hover:shadow-xl
                                                 transform hover:scale-[1.02] active:scale-[0.98]
                                                 transition-all duration-200
                                                 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                <span>Updating...</span>
                                            </>
                                        ) : (
                                            <span>Update Password</span>
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="px-8 py-12 text-center"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring" }}
                                    className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#C0EBA6] to-[#E8F8E0] shadow-lg mb-6"
                                >
                                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                                </motion.div>

                                <h2 className="text-2xl font-bold text-[#1E1E1E] mb-2">
                                    Password Updated!
                                </h2>
                                <p className="text-[#6B6B6B] mb-6">
                                    Your password has been changed successfully.<br />
                                    Redirecting to sign in...
                                </p>

                                <div className="flex justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#6B6B6B]" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer */}
                    <div className="px-8 py-6 bg-[#F5F0E8]/50 border-t border-[#E8E4DC]/50 text-center">
                        <p className="text-sm text-[#6B6B6B]">
                            🔒 Your password is securely encrypted
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
