"use client";

// «متجرك جاهز»: the basics got done (on the computer) and the phone opens.
// Shown once; "Open the app" is remembered and the app shows from then on.

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { FoundationStatus } from "@/lib/merchant-guide/foundation";
import { BasicsList } from "./basics-list";

/** A few pieces of paper falling once, in the brand's two colours. */
const PIECES = [
    { x: "12%", delay: 0, rotate: 24, ink: false },
    { x: "28%", delay: 0.15, rotate: -40, ink: true },
    { x: "46%", delay: 0.05, rotate: 60, ink: false },
    { x: "63%", delay: 0.25, rotate: -18, ink: true },
    { x: "78%", delay: 0.1, rotate: 35, ink: false },
    { x: "90%", delay: 0.3, rotate: -55, ink: false },
] as const;

export function PhoneReadyScreen({ status, saving, onOpen }: { status: FoundationStatus | null; saving: boolean; onOpen: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const still = useReducedMotion();
    return (
        <div className="relative min-h-dvh overflow-hidden bg-background text-foreground" data-testid="phone-ready-screen">
            {!still && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden>
                    {PIECES.map((piece) => (
                        <motion.span
                            key={piece.x}
                            className={piece.ink ? "absolute top-0 h-3 w-1.5 rounded-sm bg-foreground" : "absolute top-0 h-3 w-1.5 rounded-sm bg-[#EFFF00]"}
                            style={{ left: piece.x }}
                            initial={{ y: -20, opacity: 0, rotate: 0 }}
                            animate={{ y: 220, opacity: [0, 1, 1, 0], rotate: piece.rotate * 4 }}
                            transition={{ duration: 2.2, delay: piece.delay, ease: "easeOut" }}
                        />
                    ))}
                </div>
            )}
            <div className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
                <header dir={dir} className="flex items-center">
                    <Image src="/brand/fermi-wordmark.svg" alt="Fermi" width={84} height={26} unoptimized priority className="dark:invert" />
                </header>
                <div className="mt-10 flex flex-col items-center gap-4 text-center">
                    <motion.span
                        className="grid h-20 w-20 place-items-center rounded-full bg-[#1E1E1E] shadow-[0_0_0_10px_rgba(239,255,0,0.25)]"
                        initial={still ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    >
                        <Check className="h-10 w-10 text-[#EFFF00]" strokeWidth={3} aria-hidden />
                    </motion.span>
                    <h1 dir={dir} className="text-[26px] font-bold leading-snug">{t("computerSetup.ready.title")}</h1>
                    <p dir={dir} className="max-w-xs text-[15px] leading-relaxed text-muted-foreground">{t("computerSetup.ready.body")}</p>
                </div>
                <BasicsList status={status} loadFailed={false} onRetry={onOpen} />
                <button
                    type="button"
                    onClick={onOpen}
                    disabled={saving}
                    data-testid="open-app"
                    className="mt-auto flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-[#EFFF00] text-[15.5px] font-bold text-[#1E1E1E] active:scale-[0.99] disabled:opacity-70 transition"
                >
                    {saving && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                    {t("computerSetup.ready.open")}
                </button>
            </div>
        </div>
    );
}
