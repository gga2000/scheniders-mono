"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ImagePlus, Loader2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";

interface QCPhotoUploaderProps {
    qcItemId: string;
    photos: string[];
    onAdd: (urls: string[]) => Promise<void>;
    onRemove: (url: string) => Promise<void>;
}

export function QCPhotoUploader({ qcItemId, photos, onAdd, onRemove }: QCPhotoUploaderProps) {
    const { t } = useLanguage();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    const handleFiles = useCallback(
        async (files: FileList | File[]) => {
            const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
            if (list.length === 0) return;
            setUploading(true);
            try {
                const uploaded: string[] = [];
                for (const file of list) {
                    const ext = file.name.split(".").pop() || "jpg";
                    const path = `${qcItemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                    const { data, error } = await supabase.storage.from("qc-evidence").upload(path, file, { upsert: false });
                    if (error) {
                        toast.error(t("qc.photo.uploadFailed"), error.message);
                        continue;
                    }
                    const { data: pub } = supabase.storage.from("qc-evidence").getPublicUrl(data.path);
                    uploaded.push(pub.publicUrl);
                }
                if (uploaded.length > 0) {
                    await onAdd(uploaded);
                    toast.success(
                        t(uploaded.length > 1 ? "qc.photo.uploaded" : "qc.photo.uploadedSingle", { count: uploaded.length })
                    );
                }
            } catch (e) {
                toast.error(t("qc.photo.uploadFailed"));
            } finally {
                setUploading(false);
            }
        },
        [qcItemId, onAdd, t]
    );

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    };

    const handleRemove = async (url: string) => {
        try {
            await onRemove(url);
            toast.success(t("qc.photo.removed"));
            setLightboxIdx(null);
        } catch {
            toast.error(t("qc.photo.removeFailed"));
        }
    };

    return (
        <div className="space-y-3">
            {/* Drop zone */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                    "relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer",
                    dragging
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-[var(--card-border)] bg-[var(--background)]/50 hover:border-amber-500/50"
                )}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div className="flex flex-col items-center gap-2 text-center py-2">
                    {uploading ? (
                        <>
                            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                            <p className="text-sm font-medium">{t("qc.photo.uploading")}</p>
                        </>
                    ) : (
                        <>
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <Upload className="w-5 h-5 text-amber-600" />
                            </div>
                            <p className="text-sm font-medium">
                                {dragging ? t("qc.photo.dropHere") : t("qc.photo.dropOrClick")}
                            </p>
                            <p className="text-xs text-muted">{t("qc.photo.hint")}</p>
                        </>
                    )}
                </div>
            </div>

            {/* Gallery */}
            {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {photos.map((url, idx) => (
                        <button
                            key={url}
                            onClick={() => setLightboxIdx(idx)}
                            className="relative group aspect-square rounded-lg overflow-hidden bg-[var(--background)] border border-[var(--card-border)] hover:border-amber-500/50 transition"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                                <ImagePlus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Lightbox */}
            <AnimatePresence>
                {lightboxIdx !== null && photos[lightboxIdx] && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setLightboxIdx(null)}
                        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8"
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setLightboxIdx(null);
                            }}
                            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        {lightboxIdx > 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxIdx(lightboxIdx - 1);
                                }}
                                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                        )}
                        {lightboxIdx < photos.length - 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxIdx(lightboxIdx + 1);
                                }}
                                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        )}
                        <motion.img
                            key={lightboxIdx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            src={photos[lightboxIdx]}
                            alt={`Evidence ${lightboxIdx + 1}`}
                            onClick={(e) => e.stopPropagation()}
                            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemove(photos[lightboxIdx]);
                            }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 transition"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t("qc.photo.removeBtn")}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
