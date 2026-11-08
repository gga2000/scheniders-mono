"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

/**
 * Shared frame for the password reset pages (forgot + choose new): brand row,
 * white card with the neon top strip, optional "back to sign in", and the
 * encryption footer. Keeps both screens visually identical.
 */
export function AuthCardShell({ children, showBack = true }: { children: React.ReactNode; showBack?: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
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
                <div className="flex items-center justify-center gap-2.5 mb-7">
                    <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-[9px] shadow-sm" />
                    <span className="text-[17px] font-semibold tracking-tight text-[#1E1E1E]">Scheniders</span>
                </div>

                <div className="bg-white rounded-[28px] border border-[#ECE8DD] shadow-[0_1px_2px_rgba(30,30,30,0.04),0_24px_60px_-24px_rgba(30,30,30,0.18)] overflow-hidden">
                    <div className="h-1.5 bg-[#EFFF00]" />
                    {showBack && (
                        <div className="px-6 sm:px-8 pt-7">
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 text-[13px] text-[#8A847A] hover:text-[#1E1E1E] transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span dir={dir}>{t("pwreset.backToSignIn")}</span>
                            </Link>
                        </div>
                    )}
                    {children}
                    <div className="px-6 sm:px-8 py-4 bg-[#FAF8F3] border-t border-[#ECE8DD] flex items-center justify-center gap-2 text-[12px] text-[#8A847A]">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span dir={dir}>{t("pwreset.brandFooter")}</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

/** Icon tile + title + subtitle; stacks on phones so the title never squeezes beside the icon. */
export function AuthCardHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
    const dir = useTextDir();
    return (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#1E1E1E] text-[#EFFF00] shrink-0">
                {icon}
            </span>
            <div>
                <h1 dir={dir} className="text-left text-[22px] leading-tight font-bold tracking-tight text-[#1E1E1E]">{title}</h1>
                <p dir={dir} className="text-left text-[13px] text-[#8A847A] mt-1">{subtitle}</p>
            </div>
        </div>
    );
}
