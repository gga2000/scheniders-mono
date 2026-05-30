"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type ContinuousScannerStatus = "idle" | "requesting" | "active" | "error";
export type ContinuousScannerError =
    | "permission-denied"
    | "no-camera"
    | "camera-in-use"
    | "decode-error"
    | null;

interface Options {
    onScan: (value: string) => void;
    enabled?: boolean;
}

interface Return {
    videoRef: RefObject<HTMLVideoElement | null>;
    status: ContinuousScannerStatus;
    errorType: ContinuousScannerError;
    retry: () => void;
    torchSupported: boolean;
    torchOn: boolean;
    toggleTorch: () => void;
}

/**
 * Continuous, fast barcode/QR scanner for the returns phone page.
 *
 * - Prefers the native BarcodeDetector API (instant, GPU-accelerated) when
 *   available (Chromium/Android). Falls back to ZXing restricted to QR +
 *   CODE_128 (no TRY_HARDER) on browsers without it (e.g. iOS Safari).
 * - Never stops after a hit — it keeps scanning so a whole pile of packages
 *   can be run through in one sweep. De-duping of repeated reads is the
 *   caller's job (debounce in the page).
 */
export function useContinuousScanner({ onScan, enabled = true }: Options): Return {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [status, setStatus] = useState<ContinuousScannerStatus>("idle");
    const [errorType, setErrorType] = useState<ContinuousScannerError>(null);
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
    const stoppedRef = useRef(false);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const stop = useCallback(() => {
        stoppedRef.current = true;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (zxingControlsRef.current) { try { zxingControlsRef.current.stop(); } catch { /* ignore */ } zxingControlsRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
            streamRef.current = null;
        }
        if (videoRef.current) { try { videoRef.current.srcObject = null; } catch { /* ignore */ } }
    }, []);

    const start = useCallback(async () => {
        stoppedRef.current = false;
        setStatus("requesting");
        setErrorType(null);

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (stoppedRef.current || !videoRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });
            if (stoppedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => { /* ignore autoplay rejection */ });
            setStatus("active");
            try {
                const vtrack = stream.getVideoTracks()[0];
                const caps = (vtrack?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
                setTorchSupported(!!caps.torch);
            } catch { setTorchSupported(false); }

            // Fast path: native BarcodeDetector
            const BD = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>; }; getSupportedFormats?: () => Promise<string[]> }).BarcodeDetector;
            if (BD) {
                let supported: string[] = [];
                try {
                    const getFormats = (BD as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats;
                    if (getFormats) supported = await getFormats();
                } catch { /* ignore */ }
                const want = ["qr_code", "code_128"].filter((f) => supported.length === 0 || supported.includes(f));
                const detector = new BD(want.length ? { formats: want } : undefined);
                const tick = async () => {
                    if (stoppedRef.current || !videoRef.current) return;
                    try {
                        const codes = await detector.detect(videoRef.current);
                        if (codes && codes.length > 0) onScanRef.current(String(codes[0].rawValue));
                    } catch { /* transient detect error, keep going */ }
                    if (!stoppedRef.current) rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            // Fallback: ZXing restricted to QR + CODE_128
            const { BrowserMultiFormatReader } = await import("@zxing/browser");
            const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
            const hints = new Map();
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]);
            const reader = new BrowserMultiFormatReader(hints);
            const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
                if (result && !stoppedRef.current) onScanRef.current(result.getText());
            });
            if (stoppedRef.current) { try { controls.stop(); } catch { /* ignore */ } return; }
            zxingControlsRef.current = controls;
        } catch (err) {
            const name = (err as DOMException)?.name;
            if (name === "NotAllowedError" || name === "PermissionDeniedError") setErrorType("permission-denied");
            else if (name === "NotFoundError" || name === "DevicesNotFoundError") setErrorType("no-camera");
            else if (name === "NotReadableError" || name === "TrackStartError") setErrorType("camera-in-use");
            else setErrorType("decode-error");
            setStatus("error");
        }
    }, []);

    useEffect(() => {
        if (enabled) start();
        return () => stop();
    }, [enabled, start, stop]);

    const toggleTorch = useCallback(async () => {
        const track = streamRef.current?.getVideoTracks?.()[0];
        if (!track) return;
        const next = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
            setTorchOn(next);
        } catch { /* torch unsupported on this device */ }
    }, [torchOn]);

    return { videoRef, status, errorType, retry: start, torchSupported, torchOn, toggleTorch };
}
