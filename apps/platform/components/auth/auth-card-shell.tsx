"use client";

import { balooArabic } from "@/app/fonts/baloo";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

/**
 * Shared frame for every auth page (login, sign-up, forgot, choose new): brand row,
 * white card, optional "back to sign in", and the
 * encryption footer. Keeps the auth screens visually identical.
 *
 * `aside` adds a brand panel beside the card on wide screens, pinned while the
 * form scrolls. On phones it is a short band above the card, or nothing at all
 * with `asideOnPhones={false}` (sign-in: the form comes first).
 *
 * `bare` drops the white card and its footer: the page draws its own form
 * straight on the cream (sign-in).
 */
export function AuthCardShell({
    children,
    showBack = true,
    aside,
    asideOnPhones = true,
    bare = false,
}: {
    children: React.ReactNode;
    showBack?: boolean;
    aside?: React.ReactNode;
    asideOnPhones?: boolean;
    bare?: boolean;
}) {
    if (!aside) return <AuthCardFrame showBack={showBack} bare={bare}>{children}</AuthCardFrame>;
    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className={asideOnPhones ? "lg:sticky lg:top-0 lg:h-screen" : "hidden lg:sticky lg:top-0 lg:block lg:h-screen"}>{aside}</div>
            <AuthCardFrame showBack={showBack} wordmark={asideOnPhones ? "never" : "phones"} besideAside bare={bare}>
                {children}
            </AuthCardFrame>
        </div>
    );
}

function AuthCardFrame({
    children,
    showBack,
    besideAside = false,
    wordmark = "always",
    bare = false,
}: {
    children: React.ReactNode;
    showBack: boolean;
    besideAside?: boolean;
    bare?: boolean;
    /** The brand panel already shows the wordmark wherever the panel itself is on screen. */
    wordmark?: "always" | "phones" | "never";
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <div
            className={
                besideAside
                    ? `${balooArabic.variable} flex lg:items-center justify-center px-4 py-6 lg:py-12 relative overflow-hidden lg:min-h-screen ${wordmark === "phones" ? "min-h-screen items-center" : "items-start"}`
                    : `${balooArabic.variable} min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden`
            }
        >
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
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

            {/* No entry fade: it started at opacity 0 in the server HTML, so the
                card stayed invisible until all JS had run (6 s on a slow phone). */}
            <div className={`w-full relative z-10 ${bare ? "max-w-[400px]" : "max-w-[440px]"}`}>
                {wordmark !== "never" && (
                    <div className={`flex items-center mb-7 ${bare ? "mb-10" : "justify-center"} ${wordmark === "phones" ? "lg:hidden" : ""}`}>
                        <Image src="/brand/fermi-wordmark.svg" alt="Fermi" width={92} height={28} unoptimized priority />
                    </div>
                )}

                {bare ? (
                    children
                ) : (

                <div className="bg-white rounded-[28px] border border-[#ECE8DD] shadow-[0_1px_2px_rgba(30,30,30,0.04),0_24px_60px_-24px_rgba(30,30,30,0.18)] overflow-hidden">
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
                )}
            </div>
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
                <h1 dir={dir} className="text-left font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[24px] leading-snug font-bold tracking-tight text-[#1E1E1E]">{title}</h1>
                <p dir={dir} className="text-left text-[13px] text-[#8A847A] mt-1">{subtitle}</p>
            </div>
        </div>
    );
}
