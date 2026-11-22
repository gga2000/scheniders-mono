"use client";

import Image from "next/image";
import { BellRing, CopyX, ShieldCheck } from "lucide-react";
import { balooArabic } from "@/app/fonts/baloo";
import { AnimatedShaderHero } from "@/components/ui/animated-shader-hero";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { TRIAL_DAYS } from "@/lib/trial";
import { cn } from "@/lib/utils";

/**
 * The sign-up page's brand panel: Fermi's promise in lime light on ink. On
 * phones it shrinks to a short band (logo, trial pill, one-line promise) so
 * the form, often already filled from usefermi.com, stays near the top.
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
            className={cn(balooArabic.variable, "h-full lg:min-h-screen")}
            headlineClassName="font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[26px] sm:text-[40px] lg:text-[68px] lg:leading-[1.22] xl:text-[80px]"
            badge={
                <div className="flex items-center justify-between gap-3">
                    {/* The wordmark file is ink; inverted it reads as cream on the dark panel. */}
                    <Image src="/brand/fermi-wordmark.svg" alt="Fermi" width={92} height={28} unoptimized priority className="invert" />
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-medium text-[#F4EFE9]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#EFFF00]" aria-hidden />
                        {t("signup.hero.badge", { count: TRIAL_DAYS })}
                    </span>
                </div>
            }
            lines={[t("signup.hero.line1"), t("signup.hero.line2"), t("signup.hero.line3")]}
            subtitle={t("signup.hero.subtitle")}
            subtitleClassName="hidden sm:block"
        >
            <ul className="hidden max-w-md flex-col border-t border-white/10 lg:flex">
                {points.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-3.5 border-b border-white/10 py-3.5 text-[15px] text-[#F4EFE9]">
                        <Icon className="h-[18px] w-[18px] shrink-0 text-[#EFFF00]" aria-hidden />
                        {text}
                    </li>
                ))}
            </ul>
        </AnimatedShaderHero>
    );
}
