"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Link, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface ProductImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    productId?: string;
}

export function ProductImageUpload({ value, onChange, productId }: ProductImageUploadProps) {
    const { t } = useLanguage();
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<"upload" | "url">("upload");
    const [urlInput, setUrlInput] = useState(value || "");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            setError(t("products.image.notImage"));
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError(t("products.image.tooLarge"));
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const fileName = `${productId || "temp"}-${Date.now()}.${fileExt}`;
            const filePath = `products/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: true,
                });

            if (uploadError) {
                // If bucket doesn't exist, show helpful error
                if (uploadError.message.includes("not found")) {
                    throw new Error(t("products.image.bucketMissing"));
                }
                throw uploadError;
            }

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(filePath);

            onChange(urlData.publicUrl);
        } catch (err) {
            console.error("Upload error:", err);
            setError(err instanceof Error ? err.message : t("products.image.uploadFailed"));
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadFile(e.dataTransfer.files[0]);
        }
    }, [productId, t]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0]);
        }
    };

    const handleUrlSubmit = () => {
        if (urlInput.trim()) {
            onChange(urlInput.trim());
        }
    };

    const handleRemove = () => {
        onChange("");
        setUrlInput("");
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-foreground">
                    {t("products.image.label")}
                </label>
                <div className="flex bg-[var(--background)] rounded-lg p-0.5 border border-[var(--card-border)]">
                    <button
                        type="button"
                        onClick={() => setMode("upload")}
                        className={cn(
                            "px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                            mode === "upload"
                                ? "bg-[var(--ink)] text-white"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <Upload className="w-3 h-3" />
                        {t("products.image.upload")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("url")}
                        className={cn(
                            "px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                            mode === "url"
                                ? "bg-[var(--ink)] text-white"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <Link className="w-3 h-3" />
                        {t("products.image.url")}
                    </button>
                </div>
            </div>

            {/* Current Image Preview */}
            {value && (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-[var(--card-border)]">
                    <img
                        src={value}
                        alt={t("products.image.previewAlt")}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>
            )}

            {!value && (
                <AnimatePresence mode="wait">
                    {mode === "upload" ? (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            {/* Drop Zone */}
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => inputRef.current?.click()}
                                className={cn(
                                    "relative w-full h-40 rounded-xl border-2 border-dashed transition-all cursor-pointer",
                                    "flex flex-col items-center justify-center gap-3",
                                    dragActive
                                        ? "border-[var(--ink)] bg-[var(--ink)]/5"
                                        : "border-[var(--card-border)] hover:border-[var(--ink)]/50 bg-[var(--background)]",
                                    uploading && "pointer-events-none opacity-50"
                                )}
                            >
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />

                                {uploading ? (
                                    <>
                                        <Loader2 className="w-8 h-8 text-[var(--foreground)] animate-spin" />
                                        <p className="text-sm text-muted">{t("products.image.uploading")}</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                                            <Upload className="w-6 h-6 text-amber-700" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-foreground">
                                                {dragActive ? t("products.image.dropHere") : t("products.image.clickOrDrag")}
                                            </p>
                                            <p className="text-xs text-muted mt-1">
                                                {t("products.image.formats")}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="url"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            {/* URL Input */}
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    placeholder="https://example.com/image.jpg"
                                    className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={handleUrlSubmit}
                                    disabled={!urlInput.trim()}
                                    className="px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50"
                                >
                                    {t("products.image.add")}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* Error Message */}
            {error && (
                <p className="text-sm text-rose-600 flex items-center gap-2">
                    <X className="w-4 h-4" />
                    {error}
                </p>
            )}
        </div>
    );
}
