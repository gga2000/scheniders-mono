// apps/platform/components/chat/voice-recorder.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@scheniders/ui/button";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

/** Maximum recording duration in milliseconds (2 minutes). */
const MAX_DURATION_MS = 120_000;

/** Pick the best supported audio MIME type, preferring webm > mp4 > ogg. */
function pickMime(): string {
    // Guard: MediaRecorder may not exist (SSR / old browsers).
    if (typeof MediaRecorder === "undefined") return "audio/webm";
    for (const mime of ["audio/webm", "audio/mp4", "audio/ogg"]) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    // Fall back to browser default (empty string means MediaRecorder picks).
    return "";
}

/** Format elapsed seconds as mm:ss. */
function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

export function VoiceRecorder({
    onRecorded,
    disabled = false,
}: {
    onRecorded: (file: File) => void;
    disabled?: boolean;
}) {
    const { t } = useLanguage();

    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Clean up stream + recorder without firing the onstop handler again. */
    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (maxTimerRef.current) {
            clearTimeout(maxTimerRef.current);
            maxTimerRef.current = null;
        }
        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) track.stop();
            streamRef.current = null;
        }
        recorderRef.current = null;
        chunksRef.current = [];
        setElapsed(0);
    }, []);

    // Clean up on unmount in case the user navigates away mid-recording.
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const startRecording = useCallback(async () => {
        // Guard: browser APIs not available (SSR or unsupported).
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            toast.error(t("chat.voice.notSupported", "Voice recording is not supported in this browser."));
            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            const isDenied =
                err instanceof DOMException &&
                (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
            toast.error(
                isDenied
                    ? t("chat.voice.permissionDenied", "Microphone access denied. Please allow access and try again.")
                    : t("chat.voice.micError", "Couldn't access the microphone. Please check your device.")
            );
            return;
        }

        streamRef.current = stream;
        chunksRef.current = [];

        const mime = pickMime();
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const actualMime = recorder.mimeType || mime || "audio/webm";
            const ext = actualMime.includes("mp4") ? "mp4" : actualMime.includes("ogg") ? "ogg" : "webm";
            const blob = new Blob(chunksRef.current, { type: actualMime });
            const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: actualMime });
            onRecorded(file);
            cleanup();
            setIsRecording(false);
        };

        recorder.start();
        setIsRecording(true);
        setElapsed(0);

        // Elapsed-time ticker.
        timerRef.current = setInterval(() => {
            setElapsed((prev) => prev + 1);
        }, 1000);

        // Auto-stop at max duration.
        maxTimerRef.current = setTimeout(() => {
            if (recorderRef.current?.state === "recording") {
                recorderRef.current.stop();
            }
        }, MAX_DURATION_MS);
    }, [onRecorded, cleanup, t]);

    const stopRecording = useCallback(() => {
        if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
        }
    }, []);

    if (isRecording) {
        return (
            <div className="flex items-center gap-1.5">
                {/* Elapsed time */}
                <span className="min-w-[36px] text-center text-[12px] font-mono font-medium text-red-500 tabular-nums">
                    {formatElapsed(elapsed)}
                </span>
                {/* Stop button */}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("chat.voice.stopRecording", "Stop recording")}
                    onClick={stopRecording}
                    className="text-red-500 hover:text-red-600"
                >
                    <Square className="h-4 w-4 fill-current" />
                </Button>
            </div>
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chat.voice.record", "Record voice note")}
            disabled={disabled}
            onClick={() => void startRecording()}
            className="text-muted-foreground"
        >
            <Mic className="h-5 w-5" />
        </Button>
    );
}
