// apps/platform/components/chat/voice-message.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/components/providers/language-provider";
import type { ChatAttachment } from "@/types/chat";

/** Format a duration in seconds as mm:ss. */
function fmtDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    return `${m}:${s}`;
}

export function VoiceMessage({ attachment }: { attachment: ChatAttachment }) {
    const { t } = useLanguage();

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Lazy-loaded signed URL: fetched only on first play to avoid needless calls
    // for every message in the list.
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [loadingUrl, setLoadingUrl] = useState(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    /** Fetch the signed URL on first play. Returns the URL on success or null. */
    const ensureSignedUrl = useCallback(async (): Promise<string | null> => {
        if (signedUrl) return signedUrl;
        setLoadingUrl(true);
        try {
            const { data } = await supabase.storage
                .from("chat-attachments")
                .createSignedUrl(attachment.storage_path, 3600);
            if (!data?.signedUrl) return null;
            setSignedUrl(data.signedUrl);
            return data.signedUrl;
        } finally {
            setLoadingUrl(false);
        }
    }, [signedUrl, attachment.storage_path]);

    const togglePlay = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            return;
        }

        // Lazily load the signed URL on first play.
        if (!signedUrl) {
            const url = await ensureSignedUrl();
            if (!url) return;
            audio.src = url;
            // Load metadata so duration is available.
            audio.load();
        }

        void audio.play();
    }, [isPlaying, signedUrl, ensureSignedUrl]);

    // Wire audio element event handlers.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onDurationChange = () => {
            if (isFinite(audio.duration)) setDuration(audio.duration);
        };

        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("durationchange", onDurationChange);

        return () => {
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("durationchange", onDurationChange);
        };
    }, []);

    const progress = duration > 0 ? currentTime / duration : 0;

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !signedUrl || duration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
    };

    const label = attachment.file_name ?? t("chat.voice.voiceMessage", "Voice message");

    return (
        <div
            className="flex max-w-[260px] items-center gap-2.5 rounded-2xl border border-(--card-border) bg-(--card-bg) px-3 py-2 shadow-sm"
            aria-label={t("chat.voice.voiceMessage", "Voice message")}
        >
            {/* Hidden audio element — no controls; we drive it imperatively. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- voice notes are user-generated; no caption available */}
            <audio ref={audioRef} preload="none" aria-hidden="true" />

            {/* Play / Pause button */}
            <button
                type="button"
                aria-label={isPlaying ? t("chat.voice.pause", "Pause") : t("chat.voice.play", "Play")}
                onClick={() => void togglePlay()}
                disabled={loadingUrl}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
                {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                )}
            </button>

            <div className="min-w-0 flex-1">
                {/* Progress bar */}
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    aria-label={label}
                    onClick={handleSeek}
                    className="relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-foreground/10"
                >
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all duration-100"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
                {/* Duration */}
                <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                    {isPlaying || currentTime > 0
                        ? `${fmtDuration(currentTime)} / ${fmtDuration(duration)}`
                        : fmtDuration(duration)}
                </span>
            </div>
        </div>
    );
}
