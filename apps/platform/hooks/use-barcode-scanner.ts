"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type ScannerStatus =
    | "idle"
    | "requesting-permission"
    | "active"
    | "success"
    | "error";

export type ScannerErrorType =
    | "permission-denied"
    | "no-camera"
    | "camera-in-use"
    | "timeout"
    | "decode-error"
    | null;

interface UseBarcodeScannerOptions {
    onScan: (value: string) => void;
    timeoutMs?: number;
}

interface UseBarcodeScannerReturn {
    status: ScannerStatus;
    errorType: ScannerErrorType;
    lastResult: string | null;
    devices: MediaDeviceInfo[];
    activeDeviceId: string | undefined;
    videoRef: RefObject<HTMLVideoElement | null>;
    startScanning: (deviceId?: string) => Promise<void>;
    stopScanning: () => void;
    switchCamera: () => void;
    retry: () => void;
}

/** Stop all tracks on a MediaStream and null it out. */
function releaseStream(streamRef: React.MutableRefObject<MediaStream | null>) {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
            try { t.stop(); } catch { /* ignore */ }
        });
        streamRef.current = null;
    }
}

export function useBarcodeScanner({
    onScan,
    timeoutMs = 45_000,
}: UseBarcodeScannerOptions): UseBarcodeScannerReturn {
    const [status, setStatus] = useState<ScannerStatus>("idle");
    const [errorType, setErrorType] = useState<ScannerErrorType>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    // Direct reference to the MediaStream — lets us stop tracks even after the
    // video element has been removed from the DOM (videoRef.current = null).
    const streamRef = useRef<MediaStream | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    // Set to false by stopScanning() — guards async gaps in startScanning so
    // controls/streams that resolve late are stopped immediately.
    const shouldScanRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const stopScanning = useCallback(() => {
        // Flip first so any in-flight async startScanning bails out
        shouldScanRef.current = false;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // Stop ZXing scan loop
        if (controlsRef.current) {
            try { controlsRef.current.stop(); } catch { /* ignore */ }
            controlsRef.current = null;
        }

        // Explicitly stop MediaStream tracks — this is what actually turns off
        // the camera LED, independent of the video element being in the DOM.
        releaseStream(streamRef);

        // Also stop any tracks still on the video element if accessible
        if (videoRef.current?.srcObject instanceof MediaStream) {
            videoRef.current.srcObject.getTracks().forEach((t) => {
                try { t.stop(); } catch { /* ignore */ }
            });
            videoRef.current.srcObject = null;
        }

        if (isMountedRef.current) setStatus("idle");
    }, []);

    const startScanning = useCallback(
        async (deviceId?: string) => {
            // Mark as active before any awaits
            shouldScanRef.current = true;

            // Clean up any previous session
            if (controlsRef.current) {
                try { controlsRef.current.stop(); } catch { /* ignore */ }
                controlsRef.current = null;
            }
            releaseStream(streamRef);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            setStatus("requesting-permission");
            setErrorType(null);

            // Wait one frame so the video element is in the DOM
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

            if (!shouldScanRef.current) return;

            if (!videoRef.current) {
                setStatus("error");
                setErrorType("no-camera");
                return;
            }

            try {
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                const { DecodeHintType, BarcodeFormat, NotFoundException } = await import("@zxing/library");

                if (!shouldScanRef.current) return;

                const hints = new Map();
                hints.set(DecodeHintType.TRY_HARDER, true);
                hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                    BarcodeFormat.CODE_128,
                    BarcodeFormat.CODE_39,
                    BarcodeFormat.CODE_93,
                    BarcodeFormat.EAN_13,
                    BarcodeFormat.EAN_8,
                    BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E,
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.AZTEC,
                    BarcodeFormat.PDF_417,
                    BarcodeFormat.ITF,
                    BarcodeFormat.CODABAR,
                ]);

                const reader = new BrowserMultiFormatReader(hints);
                const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();

                if (!shouldScanRef.current || !isMountedRef.current) return;

                if (videoDevices.length === 0) {
                    setStatus("error");
                    setErrorType("no-camera");
                    return;
                }

                setDevices(videoDevices);

                let selectedId = deviceId;
                if (!selectedId) {
                    const rearCamera = videoDevices.find((d) =>
                        d.label.toLowerCase().includes("back") ||
                        d.label.toLowerCase().includes("environment") ||
                        d.label.toLowerCase().includes("rear")
                    );
                    selectedId = (rearCamera ?? videoDevices[0]).deviceId;
                }
                setActiveDeviceId(selectedId);
                setStatus("active");

                if (!shouldScanRef.current) return;

                const controls = await reader.decodeFromVideoDevice(
                    selectedId,
                    videoRef.current,
                    (result, error) => {
                        if (!isMountedRef.current) return;

                        if (result) {
                            const text = result.getText();
                            setLastResult(text);
                            setStatus("success");

                            // Stop after success animation
                            setTimeout(() => {
                                if (controlsRef.current) {
                                    try { controlsRef.current.stop(); } catch { /* ignore */ }
                                    controlsRef.current = null;
                                }
                                releaseStream(streamRef);
                                if (timeoutRef.current) {
                                    clearTimeout(timeoutRef.current);
                                    timeoutRef.current = null;
                                }
                            }, 400);

                            onScan(text);
                            return;
                        }

                        if (error) {
                            if (error instanceof NotFoundException) return;
                            if (isMountedRef.current) {
                                setStatus("error");
                                setErrorType("decode-error");
                            }
                        }
                    }
                );

                // If stopScanning() fired while decodeFromVideoDevice was resolving,
                // the stream is now live with no owner — stop it immediately.
                if (!shouldScanRef.current) {
                    try { controls.stop(); } catch { /* ignore */ }
                    // Also stop tracks directly in case controls.stop() misses them
                    if (videoRef.current?.srcObject instanceof MediaStream) {
                        videoRef.current.srcObject.getTracks().forEach((t) => {
                            try { t.stop(); } catch { /* ignore */ }
                        });
                        videoRef.current.srcObject = null;
                    }
                    return;
                }

                controlsRef.current = controls;

                // Capture the stream ZXing attached to the video element
                if (videoRef.current?.srcObject instanceof MediaStream) {
                    streamRef.current = videoRef.current.srcObject;
                }

                timeoutRef.current = setTimeout(() => {
                    if (isMountedRef.current) {
                        stopScanning();
                        setStatus("error");
                        setErrorType("timeout");
                    }
                }, timeoutMs);

            } catch (err) {
                if (!isMountedRef.current) return;
                // Also ensure stream is released on error
                releaseStream(streamRef);
                const domErr = err as DOMException;
                if (domErr?.name === "NotAllowedError" || domErr?.name === "PermissionDeniedError") {
                    setStatus("error");
                    setErrorType("permission-denied");
                } else if (domErr?.name === "NotFoundError" || domErr?.name === "DevicesNotFoundError") {
                    setStatus("error");
                    setErrorType("no-camera");
                } else if (domErr?.name === "NotReadableError" || domErr?.name === "TrackStartError") {
                    setStatus("error");
                    setErrorType("camera-in-use");
                } else {
                    setStatus("error");
                    setErrorType("decode-error");
                }
            }
        },
        [onScan, timeoutMs, stopScanning]
    );

    const switchCamera = useCallback(() => {
        if (devices.length < 2) return;
        const currentIndex = devices.findIndex((d) => d.deviceId === activeDeviceId);
        startScanning(devices[(currentIndex + 1) % devices.length].deviceId);
    }, [devices, activeDeviceId, startScanning]);

    const retry = useCallback(() => {
        setErrorType(null);
        startScanning(activeDeviceId);
    }, [startScanning, activeDeviceId]);

    // Nuclear cleanup on unmount — stops everything regardless of state
    useEffect(() => {
        return () => {
            shouldScanRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (controlsRef.current) {
                try { controlsRef.current.stop(); } catch { /* ignore */ }
            }
            releaseStream(streamRef);
        };
    }, []);

    return {
        status,
        errorType,
        lastResult,
        devices,
        activeDeviceId,
        videoRef,
        startScanning,
        stopScanning,
        switchCamera,
        retry,
    };
}
