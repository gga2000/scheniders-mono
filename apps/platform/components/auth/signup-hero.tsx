"use client";

import Image from "next/image";
import { BellRing, CopyX, ShieldCheck } from "lucide-react";
import { balooArabic } from "@/app/fonts/baloo";
import { AnimatedShaderHero } from "@/components/ui/animated-shader-hero";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { TRIAL_DAYS } from "@/lib/trial";
import { cn } from "@/lib/utils";

/**
 * The sign-up page's brand panel: Fermi's promise over the light shader. On
 * phones it shrinks to a short band (headline only) so the form, often
 * already filled from usefermi.com, stays near the top.
 */
export function SignupHero() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const points = [
        { icon: BellRing, text: t("signup.hero.point1") },
        { icon: ShieldCheck, text: t("signup.hero.point2") },
        { icon: CopyX, text: t("signup.hero.point3") },
    ];
    return (
        <AnimatedShaderHero
            dir={dir}
            className={cn(balooArabic.variable, "h-full min-h-[190px] lg:min-h-screen")}
            headlineClassName="font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[28px] sm:text-[44px] lg:text-[64px] xl:text-[72px]"
            badge={
                <div className="flex items-center gap-3">
                    <Image src="/brand/fermi-wordmark.svg" alt="Fermi" width={79} height={24} unoptimized priority className="hidden lg:block" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1E1E1E]/10 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-[#1E1E1E] backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#3BB273]" aria-hidden />
                        {t("signup.hero.badge", { count: TRIAL_DAYS })}
                    </span>
                </div>
            }
            lines={[t("signup.hero.line1"), t("signup.hero.line2"), t("signup.hero.line3")]}
            subtitle={t("signup.hero.subtitle")}
            subtitleClassName="hidden sm:block"
        >
            <ul className="hidden lg:flex flex-col gap-2.5 max-w-md">
                {points.map(({ icon: Icon, text }) => (
                    <li
                        key={text}
                        className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/65 px-4 py-3 text-[14px] font-medium text-[#1E1E1E] shadow-[0_10px_30px_-18px_rgba(30,30,30,0.35)] backdrop-blur-md"
                    >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1E1E1E] text-[#E5F23A]">
                            <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        {text}
                    </li>
                ))}
            </ul>
        </AnimatedShaderHero>
    );
}
