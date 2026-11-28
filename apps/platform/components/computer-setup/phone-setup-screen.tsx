"use client";

// =====================================================================
// PhoneSetupScreen: «كمّل تجهيز متجرك على لابتوب أو آيباد»
// =====================================================================
// What a new shop's owner sees on a phone until the basics are done
// (lib/computer-setup-gate.ts). One calm screen: where to go on the computer,
// a button that opens this phone's camera on the computer's code, and the
// basics ticking live as they get done there. Once the computer is open the
// steps make way for "your shop is open on the computer". A merchant with no
// laptop or iPad asks for a call or carries on with the phone.
// =====================================================================

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Copy, Laptop, LogOut, ScanLine, Smartphone, Tablet } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import type { FoundationStatus } from "@/lib/merchant-guide/foundation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SetupHelpOffer } from "@/components/store-onboarding/setup-help-offer";
import { BasicsList } from "./basics-list";
import { PairCodeScanner } from "./pair-code-scanner";

export interface PhoneSetupScreenProps {
    /** The basics read from the shop; null while they load. */
    status: FoundationStatus | null;
    /** The shop could not be read. */
    loadFailed: boolean;
    onRetry: () => void;
    /** The computer is open: a basic is done, or this phone said yes to one. */
    computerOpen: boolean;
    /** "Carry on with the phone" was pressed and is being saved. */
    saving: boolean;
    onUsePhone: () => void;
    onSignOut: () => void;
}

// The page's own address does not change while it is open.
const neverChanges = () => () => {};

export function PhoneSetupScreen({ status, loadFailed, onRetry, computerOpen, saving, onUsePhone, onSignOut }: PhoneSetupScreenProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [scanning, setScanning] = useState(false);
    const [noComputer, setNoComputer] = useState(false);
    const address = useSyncExternalStore(neverChanges, () => window.location.host, () => "");

    const copyAddress = () => {
        navigator.clipboard.writeText(address).then(
            () => toast.success(t("computerSetup.copied")),
            () => toast.error(t("pair.failed")),
        );
    };

    return (
        <div className="min-h-dvh bg-background text-foreground" data-testid="phone-setup-screen">
            <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
                <header dir={dir} className="flex items-center justify-between gap-3">
                    <Image src="/brand/fermi-wordmark.svg" alt="Fermi" width={84} height={26} unoptimized priority className="dark:invert" />
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                        {t("computerSetup.notYou")}
                    </button>
                </header>

                <section className="overflow-hidden rounded-[28px] bg-[#1E1E1E] p-5 text-[#F4EFE9]">
                    <DeviceHop />
                    <h1 dir={dir} className="mt-5 text-left text-[22px] font-bold leading-snug">{t("computerSetup.title")}</h1>
                    <p dir={dir} className="mt-2 text-left text-[14px] leading-relaxed text-[#C9C4B8]">{t("computerSetup.body")}</p>
                </section>

                {computerOpen ? (
                    <section dir={dir} role="status" className="flex items-center gap-3 rounded-2xl border border-border bg-(--card-bg) px-4 py-3.5" data-testid="computer-open">
                        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1E1E1E]">
                            <Laptop className="h-5 w-5 text-[#EFFF00]" aria-hidden />
                            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-[15px] font-semibold">{t("computerSetup.opened.title")}</p>
                            <p className="text-[13px] text-muted-foreground">{t("computerSetup.opened.body")}</p>
                        </div>
                    </section>
                ) : (
                    <>
                        <ol dir={dir} className="grid gap-3 text-left">
                            <Step n={1}>
                                <span>{t("computerSetup.step1")}</span>
                                <span className="mt-1.5 flex items-center gap-2">
                                    <span dir="ltr" className="rounded-lg border border-border bg-(--card-bg) px-2.5 py-1 font-mono text-[13.5px] font-semibold" data-testid="computer-address">
                                        {address}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={copyAddress}
                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                                    >
                                        <Copy className="h-3.5 w-3.5" aria-hidden />
                                        {t("computerSetup.copy")}
                                    </button>
                                </span>
                            </Step>
                            <Step n={2}>{t("computerSetup.step2")}</Step>
                            <Step n={3}>{t("computerSetup.step3")}</Step>
                        </ol>
                        <button
                            type="button"
                            onClick={() => setScanning(true)}
                            data-testid="scan-computer-code"
                            className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-[#1E1E1E] text-[15.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(30,30,30,0.55)] active:scale-[0.99] transition dark:bg-[#EFFF00] dark:text-[#1E1E1E]"
                        >
                            <ScanLine className="h-5 w-5 text-[#EFFF00] dark:text-[#1E1E1E]" aria-hidden />
                            {t("computerSetup.scan")}
                        </button>
                    </>
                )}

                <BasicsList status={status} loadFailed={loadFailed} onRetry={onRetry} />

                <div className="mt-auto pt-2 text-center">
                    <button
                        type="button"
                        onClick={() => setNoComputer(true)}
                        data-testid="no-computer"
                        className="text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                    >
                        {t("computerSetup.noComputer")}
                    </button>
                </div>
            </div>

            {scanning && <PairCodeScanner onClose={() => setScanning(false)} />}

            <BottomSheet
                open={noComputer}
                onOpenChange={setNoComputer}
                title={t("computerSetup.sheet.title")}
                draggable={false}
                initialHeight={0.62}
                testId="no-computer-sheet"
                footer={
                    <button
                        type="button"
                        onClick={onUsePhone}
                        disabled={saving}
                        data-testid="use-phone"
                        className="h-12 w-full rounded-2xl border border-border bg-(--card-bg) text-[15px] font-semibold text-foreground disabled:opacity-60"
                    >
                        {t("computerSetup.sheet.phone")}
                    </button>
                }
            >
                <p dir={dir} className="text-left text-[14px] leading-relaxed text-muted-foreground">{t("computerSetup.sheet.body")}</p>
                <SetupHelpOffer defaultPhone="" />
            </BottomSheet>
        </div>
    );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3 text-[14.5px] leading-relaxed">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1E1E1E] text-[12px] font-bold text-[#EFFF00]" dir="ltr">
                {n}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">{children}</span>
        </li>
    );
}

/** Phone, then laptop and iPad, with a dot travelling between them. */
function DeviceHop() {
    const still = useReducedMotion();
    return (
        <div className="flex items-center justify-center gap-3" aria-hidden>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.07]">
                <Smartphone className="h-7 w-7" />
            </span>
            <span className="relative h-0.5 w-16 overflow-visible bg-[repeating-linear-gradient(90deg,rgba(239,255,0,0.55)_0_6px,transparent_6px_11px)]">
                <motion.span
                    className="absolute -top-[3px] h-2 w-2 rounded-full bg-[#EFFF00] shadow-[0_0_12px_rgba(239,255,0,0.8)]"
                    initial={{ left: 0 }}
                    animate={still ? { left: "50%" } : { left: ["0%", "100%"] }}
                    transition={still ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }}
                />
            </span>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EFFF00] text-[#1E1E1E]">
                <Laptop className="h-7 w-7" />
            </span>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.07]">
                <Tablet className="h-7 w-7" />
            </span>
        </div>
    );
}
