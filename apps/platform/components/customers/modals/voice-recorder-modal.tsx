"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Play, RotateCcw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useAudioRecorder, useUploadVoiceNote } from "@/hooks/use-voice-notes";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

export function VoiceRecorderModal() {
    const { t } = useLanguage();
    const { isVoiceRecorderModalOpen, setVoiceRecorderModalOpen, voiceRecorderPhone } = useCustomerStore();
    const recorder = useAudioRecorder();
    const uploadMutation = useUploadVoiceNote();
    const [textNote, setTextNote] = useState("");

    const handleClose = () => {
        setVoiceRecorderModalOpen(false);
        recorder.reset();
        setTextNote("");
    };

    const handleSave = () => {
        if (!voiceRecorderPhone || !recorder.audioBlob) return;
        uploadMutation.mutate({
            phone: voiceRecorderPhone,
            audioBlob: recorder.audioBlob,
            duration: recorder.duration,
            textNote: textNote || undefined,
        }, { onSuccess: handleClose });
    };

    const progressPercent = (recorder.duration / recorder.maxDuration) * 100;

    return (
        <ModalShell isOpen={isVoiceRecorderModalOpen} onClose={handleClose} title={t("customers.voice.title")}>
            <div className="space-y-6">
                {/* Waveform */}
                <div className="flex items-center justify-center gap-[3px] h-24 px-4">
                    {recorder.frequencies.map((freq, i) => (
                        <motion.div
                            key={i}
                            className={cn(
                                "waveform-bar w-2 rounded-full",
                                recorder.isRecording ? "bg-red-400" : recorder.audioBlob ? "bg-cyan-400" : "bg-muted/30"
                            )}
                            animate={{ height: Math.max(4, freq * 80) }}
                            transition={{ duration: 0.05 }}
                        />
                    ))}
                </div>

                {/* Timer */}
                <div className="text-center">
                    <p className="text-3xl font-bold text-foreground tabular-nums">
                        {Math.floor(recorder.duration / 60).toString().padStart(2, "0")}
                        :{(recorder.duration % 60).toString().padStart(2, "0")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t("customers.voice.maxDuration")}</p>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-red-400 rounded-full"
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                    {!recorder.isRecording && !recorder.audioBlob && (
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={recorder.startRecording}
                            className="relative w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg"
                        >
                            <Mic className="w-7 h-7" />
                            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                        </motion.button>
                    )}

                    {recorder.isRecording && (
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={recorder.stopRecording}
                            className="record-btn-active w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg"
                        >
                            <Square className="w-6 h-6" />
                        </motion.button>
                    )}

                    {recorder.audioBlob && !recorder.isRecording && (
                        <>
                            <button
                                onClick={recorder.reset}
                                className="p-3 rounded-xl border border-(--card-border) text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    if (recorder.audioUrl) {
                                        const audio = new Audio(recorder.audioUrl);
                                        audio.play();
                                    }
                                }}
                                className="w-14 h-14 bg-cyan-500 rounded-full flex items-center justify-center text-white shadow-lg"
                            >
                                <Play className="w-6 h-6 ml-0.5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Text note */}
                {recorder.audioBlob && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <textarea
                            value={textNote}
                            onChange={(e) => setTextNote(e.target.value)}
                            placeholder={t("customers.voice.textNote")}
                            className="w-full bg-muted/20 border border-(--card-border) rounded-xl p-3 text-sm resize-none h-16 focus:ring-2 focus:ring-foreground/10"
                        />
                        <button
                            onClick={handleSave}
                            disabled={uploadMutation.isPending}
                            className="w-full bg-foreground text-background py-3 rounded-xl font-bold text-sm mt-3 disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                            {uploadMutation.isPending ? "..." : t("customers.voice.save")}
                        </button>
                    </motion.div>
                )}
            </div>
        </ModalShell>
    );
}
