"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { recorderType } from "@/lib/support/voice";

interface Recording {
    recorder: MediaRecorder;
    stream: MediaStream;
    startedAt: number;
}

export type RecorderFailure = "blocked" | "failed";

const noSubscription = () => () => {};

function canRecord(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        recorderType((type) => MediaRecorder.isTypeSupported(type)) !== null
    );
}

/**
 * Records one voice clip from the microphone: `start` asks for the mic and
 * records, `stop` (or `maxSeconds`) ends it and hands the clip to `onDone`.
 * A clip under a second is dropped as a slip of the finger.
 */
export function useVoiceRecorder({ maxSeconds, onDone, onFailure }: {
    maxSeconds: number;
    onDone: (clip: Blob) => void;
    onFailure: (failure: RecorderFailure) => void;
}) {
    const supported = useSyncExternalStore(noSubscription, canRecord, () => false);
    const [recording, setRecording] = useState<Recording | null>(null);
    const [seconds, setSeconds] = useState(0);
    const chunks = useRef<Blob[]>([]);
    const handlers = useRef({ onDone, onFailure });

    useEffect(() => {
        handlers.current = { onDone, onFailure };
    }, [onDone, onFailure]);

    // The clock, and the stop at maxSeconds.
    useEffect(() => {
        if (!recording) return;
        const id = window.setInterval(() => {
            const elapsed = (Date.now() - recording.startedAt) / 1000;
            setSeconds(Math.min(elapsed, maxSeconds));
            if (elapsed >= maxSeconds && recording.recorder.state === "recording") recording.recorder.stop();
        }, 250);
        return () => window.clearInterval(id);
    }, [recording, maxSeconds]);

    // Closing the form mid-recording lets go of the microphone and drops the
    // clip: nobody is left to read it.
    useEffect(() => {
        if (!recording) return;
        return () => {
            recording.recorder.onstop = null;
            if (recording.recorder.state !== "inactive") recording.recorder.stop();
            recording.stream.getTracks().forEach((track) => track.stop());
        };
    }, [recording]);

    const start = useCallback(async () => {
        const type = recorderType((candidate) => MediaRecorder.isTypeSupported(candidate));
        if (!type) return;
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
            handlers.current.onFailure(denied ? "blocked" : "failed");
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
            const clip = new Blob(chunks.current, { type: recorder.mimeType || type });
            chunks.current = [];
            if (length < 1 || clip.size === 0) return;
            handlers.current.onDone(clip);
        };
        recorder.start(1000);
        setSeconds(0);
        setRecording({ recorder, stream, startedAt });
    }, []);

    const stop = useCallback(() => {
        if (recording && recording.recorder.state === "recording") recording.recorder.stop();
    }, [recording]);

    return { supported, recording: recording !== null, seconds, start, stop };
}
