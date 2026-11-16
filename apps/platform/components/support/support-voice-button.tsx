"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SupportRequestError, useSupportVoice } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";
import { SUPPORT_VOICE_MAX_SECONDS } from "@/lib/support/schema";
import { formatVoiceLength, recorderType } from "@/lib/support/voice";
import { cn } from "@/lib/utils";

export interface RecordedVoice {
    /** Where the server stored it. */
    path: string;
    seconds: number;
}

interface Recording {
    recorder: MediaRecorder;
    stream: MediaStream;
    startedAt: number;
}

function canRecord(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        recorderType((type) => MediaRecorder.isTypeSupported(type)) !== null
    );
}

/**
 * The microphone chip in the Help chat. First press asks for the microphone
 * and records; second press (or 2 minutes) stops, uploads and hands the
 * stored voice note to the chat. Hidden where the browser cannot record.
 */
export function SupportVoiceButton({ chipClass, disabled, onRecorded }: {
    chipClass: string;
    disabled: boolean;
    onRecorded: (voice: RecordedVoice) => void;
}) {
    const { t } = useLanguage();
    const upload = useSupportVoice();
    // Mounted only inside the open chat, so always in the browser.
    const [supported] = useState(canRecord);
    const [recording, setRecording] = useState<Recording | null>(null);
    const [seconds, setSeconds] = useState(0);
    const chunks = useRef<Blob[]>([]);

    // The clock, and the 2-minute stop.
    useEffect(() => {
        if (!recording) return;
        const id = window.setInterval(() => {
            const elapsed = (Date.now() - recording.startedAt) / 1000;
            setSeconds(elapsed);
            if (elapsed >= SUPPORT_VOICE_MAX_SECONDS && recording.recorder.state === "recording") recording.recorder.stop();
        }, 250);
        return () => window.clearInterval(id);
    }, [recording]);

    // Closing the chat mid-recording lets go of the microphone.
    useEffect(() => {
        if (!recording) return;
        return () => {
            if (recording.recorder.state !== "inactive") recording.recorder.stop();
            recording.stream.getTracks().forEach((track) => track.stop());
        };
    }, [recording]);

    const start = async () => {
        const type = recorderType((candidate) => MediaRecorder.isTypeSupported(candidate));
        if (!type) return;
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
            toast.error(t(denied ? "support.voice.denied" : "support.voice.failed"));
            return;
        }
        const recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32_000 });
        const startedAt = Date.now();
        chunks.current = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.current.push(event.data);
        };
        recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            setRecording(null);
            const length = (Date.now() - startedAt) / 1000;
            const voice = new Blob(chunks.current, { type: recorder.mimeType || type });
            chunks.current = [];
            if (length < 1 || voice.size === 0) return;
            upload.mutate(voice, {
                onSuccess: (path) => onRecorded({ path, seconds: Math.min(length, SUPPORT_VOICE_MAX_SECONDS) }),
                onError: (error) => {
                    const code = error instanceof SupportRequestError ? error.code : "failed";
                    toast.error(t(code === "support_rate_limited" ? "support.error.rateLimited" : "support.voice.failed"));
                },
            });
        };
        recorder.start(1000);
        setSeconds(0);
        setRecording({ recorder, stream, startedAt });
    };

    const stop = () => {
        if (recording && recording.recorder.state === "recording") recording.recorder.stop();
    };

    if (!supported) return null;

    if (recording) {
        return (
            <button
                type="button"
                onClick={stop}
                className={cn(chipClass, "border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400")}
            >
                <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-600" />
                <span dir="ltr" className="tabular-nums">{formatVoiceLength(seconds)}</span>
                <Square className="h-3 w-3 shrink-0 fill-current" />
                <span dir="auto">{t("support.voice.stop")}</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={start}
            disabled={disabled || upload.isPending}
            className={cn(chipClass, "border-dashed text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-60")}
        >
            {upload.isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Mic className="h-3 w-3 shrink-0" />}
            <span dir="auto">{t(upload.isPending ? "support.voice.saving" : "support.voice.add")}</span>
        </button>
    );
}
