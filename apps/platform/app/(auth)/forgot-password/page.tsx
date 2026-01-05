"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";

export default function ForgotPasswordPage() {
    const { resetPassword } = useAuth();
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const { error: resetError } = await resetPassword(email);

            if (resetError) {
                setError(resetError.message);
                setIsLoading(false);
                return;
            }

            setIsSuccess(true);
        } catch {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full opacity-30"
                    style={{
                        background: "radial-gradient(circle, var(--pastel-mint) 0%, transparent 70%)",
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
                        background: "radial-gradient(circle, var(--pastel-purple) 0%, transparent 70%)",
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
                                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#B8E8E0] to-[#E5F6F3] shadow-lg mb-4"
                                    >
                                        <Mail className="w-8 h-8 text-[#1E1E1E]" />
                                    </motion.div>

                                    <h1 className="text-2xl font-bold text-[#1E1E1E] mb-1">
                                        Forgot Password?
                                    </h1>
                                    <p className="text-[#6B6B6B] text-sm">
                                        No worries, we&apos;ll send you reset instructions
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

                                    <div>
                                        <label className="block text-sm font-medium text-[#1E1E1E] mb-2">
                                            Email Address
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
                                                         focus:border-[#B8E8E0] focus:bg-white focus:outline-none
                                                         transition-all duration-200"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !email}
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
                                                <span>Sending...</span>
                                            </>
                                        ) : (
                                            <span>Reset Password</span>
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
                                    Check Your Email
                                </h2>
                                <p className="text-[#6B6B6B] mb-6">
                                    We sent a password reset link to<br />
                                    <span className="font-medium text-[#1E1E1E]">{email}</span>
                                </p>

                                <Link
                                    href="/login"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
                                             bg-[#F5F0E8] text-[#1E1E1E] font-medium
                                             hover:bg-[#E8E4DC] transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Sign In
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer */}
                    <div className="px-8 py-6 bg-[#F5F0E8]/50 border-t border-[#E8E4DC]/50 text-center">
                        <p className="text-sm text-[#6B6B6B]">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            Protected by Schenider Security
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
