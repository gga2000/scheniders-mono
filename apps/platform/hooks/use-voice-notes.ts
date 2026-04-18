"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VoiceNote } from "@/types/customer";

export function useVoiceNotes(phone: string | undefined) {
    return useQuery({
        queryKey: ["voice-notes", phone],
        queryFn: async () => {
            if (!phone) return [];
            const { data, error } = await supabase
                .from("customer_voice_notes")
                .select("*")
                .eq("customer_phone", phone)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as VoiceNote[];
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}

export function useUploadVoiceNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ phone, audioBlob, duration, textNote, recordedBy }: {
            phone: string;
            audioBlob: Blob;
            duration: number;
            textNote?: string;
            recordedBy?: string;
        }) => {
            const fileName = `${phone}/${Date.now()}.webm`;
            const { error: uploadErr } = await supabase.storage
                .from("customer-voice-notes")
                .upload(fileName, audioBlob, { contentType: "audio/webm" });
            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabase.storage
                .from("customer-voice-notes")
                .getPublicUrl(fileName);

            const { data, error } = await supabase
                .from("customer_voice_notes")
                .insert([{
                    customer_phone: phone,
                    audio_url: urlData.publicUrl,
                    duration_seconds: Math.round(duration),
                    text_note: textNote,
                    recorded_by: recordedBy,
                }])
                .select()
                .single();
            if (error) throw error;
            return data as VoiceNote;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["voice-notes", data.customer_phone] });
        },
    });
}

export function useDeleteVoiceNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ noteId, phone }: { noteId: string; phone: string }) => {
            const { error } = await supabase
                .from("customer_voice_notes")
                .delete()
                .eq("id", noteId);
            if (error) throw error;
            return { phone };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["voice-notes", data.phone] });
        },
    });
}

export function useAudioRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [frequencies, setFrequencies] = useState<number[]>(new Array(28).fill(0));

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number>(0);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const MAX_DURATION = 30;

    const updateFrequencies = useCallback(() => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const bars = 28;
        const step = Math.floor(data.length / bars);
        const freqs = Array.from({ length: bars }, (_, i) => {
            const slice = data.slice(i * step, (i + 1) * step);
            return slice.reduce((a, b) => a + b, 0) / slice.length / 255;
        });
        setFrequencies(freqs);
        animFrameRef.current = requestAnimationFrame(updateFrequencies);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
            };

            recorder.start(100);
            setIsRecording(true);
            setDuration(0);
            setAudioBlob(null);
            setAudioUrl(null);

            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    if (prev >= MAX_DURATION - 1) {
                        stopRecording();
                        return MAX_DURATION;
                    }
                    return prev + 1;
                });
            }, 1000);

            updateFrequencies();
        } catch (err) {
            console.error("[AudioRecorder] Failed to start:", err);
        }
    }, [updateFrequencies]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        cancelAnimationFrame(animFrameRef.current);
        setIsRecording(false);
        setFrequencies(new Array(28).fill(0));
    }, []);

    const reset = useCallback(() => {
        stopRecording();
        setDuration(0);
        setAudioBlob(null);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
    }, [stopRecording, audioUrl]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            cancelAnimationFrame(animFrameRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    return {
        isRecording, duration, audioBlob, audioUrl, frequencies,
        startRecording, stopRecording, reset,
        maxDuration: MAX_DURATION,
    };
}
