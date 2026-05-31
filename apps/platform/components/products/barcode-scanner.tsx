"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    Camera,
    CameraOff,
    CheckCircle,
    FlipHorizontal,
    ScanBarcode,
    X,
} from "lucide-react";
import { useEffect } from "react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (value: string) => void;
}

export function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
    const {
        status,
        errorType,
        devices,
        videoRef,
        startScanning,
        stopScanning,
        switchCamera,
        retry,
    } = useBarcodeScanner({ onScan });

    // Start/stop camera when modal opens or closes.
    // NOTE: No "if (!isOpen) return null" early exit in this component — the
    // AnimatePresence keeps the exiting DOM (including <video>) alive during the
    // exit animation, so stopScanning() here fires while videoRef.current is
    // still valid. streamRef in the hook is a second layer of safety.
    useEffect(() => {
        if (isOpen) {
            startScanning();
        } else {
            stopScanning();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Auto-close after success animation
    useEffect(() => {
        if (status === "success") {
            const timer = setTimeout(() => onClose(), 600);
            return () => clearTimeout(timer);
        }
    }, [status, onClose]);

    const statusText = () => {
        switch (status) {
            case "requesting-permission": return "Requesting camera access...";
            case "active": return "Point camera at a barcode";
            case "success": return "Barcode detected!";
            case "error":
                if (errorType === "timeout") return "Scan timed out — try again";
                if (errorType === "decode-error") return "Could not read barcode — try again";
                return "";
            default: return "";
        }
    };

    const hasInlineError =
        status === "error" &&
        (errorType === "permission-denied" ||
            errorType === "no-camera" ||
            errorType === "camera-in-use");

    // Always render — never early-return null. This keeps the <video> in the DOM
    // during AnimatePresence exit animations so the camera can be properly released.
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="relative z-10 w-full max-w-lg bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--card-border)]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--pastel-yellow)]/20 flex items-center justify-center">
                                    <ScanBarcode className="w-5 h-5 text-[var(--pastel-yellow)]" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground text-sm">Scan Barcode</p>
                                    <p className="text-xs text-[var(--foreground-subtle)]">
                                        Searches by SKU or product name
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {devices.length > 1 && status === "active" && (
                                    <button
                                        onClick={switchCamera}
                                        title="Switch camera"
                                        className="p-2 rounded-xl text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--card-border)] transition-all"
                                    >
                                        <FlipHorizontal className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--card-border)] transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Camera Viewport */}
                        <div className="relative mx-6 mt-5 aspect-video rounded-2xl overflow-hidden bg-black">
                            {/* Video element — lives inside AnimatePresence so it stays in
                                the DOM during exit animation, keeping videoRef valid for cleanup */}
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />

                            {/* Requesting permission */}
                            <AnimatePresence>
                                {status === "requesting-permission" && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-4 z-10"
                                    >
                                        <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin" />
                                        <p className="text-sm text-[var(--foreground-subtle)]">
                                            Requesting camera access...
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Inline error states */}
                            <AnimatePresence>
                                {hasInlineError && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 gap-4 px-6 text-center z-10"
                                    >
                                        {errorType === "permission-denied" ? (
                                            <>
                                                <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
                                                    <CameraOff className="w-7 h-7 text-red-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground mb-1">
                                                        Camera access blocked
                                                    </p>
                                                    <p className="text-xs text-[var(--foreground-subtle)] leading-relaxed">
                                                        Allow camera access in your browser settings, then click Retry.
                                                    </p>
                                                </div>
                                            </>
                                        ) : errorType === "no-camera" ? (
                                            <>
                                                <div className="w-14 h-14 rounded-2xl bg-[var(--card-border)] flex items-center justify-center">
                                                    <Camera className="w-7 h-7 text-[var(--foreground-subtle)]" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground mb-1">
                                                        No camera detected
                                                    </p>
                                                    <p className="text-xs text-[var(--foreground-subtle)] leading-relaxed">
                                                        Connect a camera and try again.
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-14 h-14 rounded-2xl bg-orange-500/15 flex items-center justify-center">
                                                    <AlertTriangle className="w-7 h-7 text-orange-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground mb-1">
                                                        Camera in use
                                                    </p>
                                                    <p className="text-xs text-[var(--foreground-subtle)] leading-relaxed">
                                                        Another application is using your camera. Close it and retry.
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                        <button
                                            onClick={retry}
                                            className="mt-1 px-5 py-2 text-sm font-medium rounded-xl bg-[var(--pastel-yellow)]/20 hover:bg-[var(--pastel-yellow)]/30 text-[var(--pastel-yellow)] transition-all"
                                        >
                                            Retry
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Scanning reticle */}
                            <AnimatePresence>
                                {status === "active" && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 pointer-events-none z-10"
                                    >
                                        <div className="absolute inset-0 [box-shadow:inset_0_0_60px_20px_rgba(0,0,0,0.55)]" />
                                        <div className="absolute inset-[20%]">
                                            <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-[var(--pastel-yellow)] rounded-tl-md" />
                                            <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-[var(--pastel-yellow)] rounded-tr-md" />
                                            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-[var(--pastel-yellow)] rounded-bl-md" />
                                            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-[var(--pastel-yellow)] rounded-br-md" />
                                            <motion.div
                                                className="absolute left-0 right-0 h-0.5 rounded-full"
                                                style={{
                                                    background: "linear-gradient(to right, transparent, var(--pastel-yellow), transparent)",
                                                    boxShadow: "0 0 8px 2px color-mix(in srgb, var(--pastel-yellow) 60%, transparent)",
                                                }}
                                                animate={{ top: ["5%", "95%", "5%"] }}
                                                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Success flash */}
                            <AnimatePresence>
                                {status === "success" && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/40 backdrop-blur-sm gap-3 z-10"
                                    >
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                        >
                                            <CheckCircle className="w-16 h-16 text-white drop-shadow-lg" />
                                        </motion.div>
                                        <motion.p
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 }}
                                            className="text-sm font-semibold text-white"
                                        >
                                            Barcode scanned!
                                        </motion.p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex items-center justify-between min-h-[60px]">
                            <p className="text-sm text-[var(--foreground-subtle)]">{statusText()}</p>
                            {status === "error" &&
                                (errorType === "timeout" || errorType === "decode-error") && (
                                    <button
                                        onClick={retry}
                                        className="px-4 py-1.5 text-sm font-medium rounded-xl bg-[var(--pastel-yellow)]/20 hover:bg-[var(--pastel-yellow)]/30 text-[var(--pastel-yellow)] transition-all"
                                    >
                                        Try again
                                    </button>
                                )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
