"use client";

// The phone's camera, full screen, reading the code on a computer's sign-in
// page. It runs in the very browser the owner is signed in to, so the yes
// page that follows never asks them to sign in again (the phone's own camera
// app may open a different browser). Any other code is named as not ours.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw, X } from "lucide-react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { computerSignInIdFromScan, computerSignInPath } from "@/lib/computer-sign-in";

export function PairCodeScanner({ onClose }: { onClose: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const [notOurs, setNotOurs] = useState(false);
    const { status, errorType, videoRef, startScanning, stopScanning, retry } = useBarcodeScanner({
        onScan: (text) => {
            const id = computerSignInIdFromScan(text);
            if (id) {
                router.push(computerSignInPath(id));
                return;
            }
            setNotOurs(true);
        },
    });

    // The camera follows this screen being open.
    useEffect(() => {
        void startScanning();
        return () => stopScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once on open, stop on close; the scanner's callbacks are new each render
    }, []);

    const again = () => {
        setNotOurs(false);
        retry();
    };

    const problem =
        notOurs ? t("computerSetup.scanner.notOurs")
        : status !== "error" ? null
        : errorType === "permission-denied" ? t("computerSetup.scanner.denied")
        : errorType === "no-camera" || errorType === "camera-in-use" ? t("computerSetup.scanner.noCamera")
        : t("computerSetup.scanner.timeout");
    const canRetry = notOurs || errorType === "timeout" || errorType === "decode-error";

    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" data-testid="pair-code-scanner">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted aria-hidden />
            {/* The frame to hold the code in. */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                <div className="h-64 w-64 rounded-[28px] shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)] ring-2 ring-[#EFFF00]" />
            </div>
            <div className="relative flex items-center justify-between px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
                <p dir={dir} className="min-w-0 flex-1 text-left text-[15px] font-semibold">{t("computerSetup.scanner.title")}</p>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("computerSetup.scanner.close")}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur"
                >
                    <X className="h-5 w-5" aria-hidden />
                </button>
            </div>
            <div className="relative mt-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
                {problem ? (
                    <div role="alert" className="grid gap-3 rounded-2xl bg-white p-4 text-[#1E1E1E]">
                        <p dir={dir} className="text-left text-[14px] leading-relaxed">{problem}</p>
                        {canRetry && (
                            <button type="button" onClick={again} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E1E1E] text-[14px] font-semibold text-white">
                                <RotateCw className="h-4 w-4 text-[#EFFF00]" aria-hidden />
                                {t("computerSetup.scanner.retry")}
                            </button>
                        )}
                    </div>
                ) : status === "requesting-permission" || status === "idle" ? (
                    <p role="status" className="flex items-center justify-center gap-2 text-[14px] text-white/85">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {t("computerSetup.scanner.starting")}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
