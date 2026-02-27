"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HardDriveDownload, X, ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";

export function BackupPrompt() {
    const [isVisible, setIsVisible] = useState(false);
    const router = useRouter();
    const { t } = useLanguage();

    useEffect(() => {
        // Wait a few seconds before showing so it doesn't interrupt initial page load
        const timer = setTimeout(() => {
            const today = new Date();

            // Simple check: Is it the 1st of the month?
            if (today.getDate() === 1) {
                // Check session storage so it doesn't re-appear on every click during the 1st
                const dismissedToday = sessionStorage.getItem("backupPromptDismissed");
                if (dismissedToday !== today.toDateString()) {
                    setIsVisible(true);
                }
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        // Note that they closed it today so it doesn't annoy them for the rest of their session
        sessionStorage.setItem("backupPromptDismissed", new Date().toDateString());
    };

    const handleGoToVault = () => {
        setIsVisible(false);
        sessionStorage.setItem("backupPromptDismissed", new Date().toDateString());
        router.push("/vault");
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, x: 200, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 200, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="fixed top-24 right-6 z-50 w-full max-w-sm"
                >
                    <div className="bg-[#1E1E1E] border border-teal-500/20 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
                        {/* Glow effect */}
                        <div className="absolute top-0 right-0 p-16 bg-teal-500/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>

                        <button
                            onClick={handleDismiss}
                            className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex gap-4">
                            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex flex-shrink-0 items-center justify-center relative">
                                <HardDriveDownload className="w-6 h-6 text-teal-400" />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black rounded-full border border-teal-500/20 flex items-center justify-center">
                                    <ShieldCheck className="w-3 h-3 text-teal-400" />
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <h3 className="text-white font-semibold text-base mb-1">Monthly Local Backup</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                                    It is the 1st of the month! Please download a raw CSV copy of your entire database directly to your computer.
                                </p>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleGoToVault}
                                        className="flex-1 py-2 px-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-teal-950 font-medium text-sm rounded-lg hover:from-teal-400 hover:to-emerald-400 transition-all flex items-center justify-center gap-2"
                                    >
                                        Go to Data Vault
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
