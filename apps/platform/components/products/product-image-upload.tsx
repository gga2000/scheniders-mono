"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Link, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface ProductImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    productId?: string;
}

export function ProductImageUpload({ value, onChange, productId }: ProductImageUploadProps) {
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
            setError("Please upload an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("Image must be less than 5MB");
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
                    throw new Error("Storage bucket 'product-images' not found. Please create it in Supabase.");
                }
                throw uploadError;
            }

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(filePath);

            onChange(urlData.publicUrl);
        } catch (err) {
            console.error("Upload error:", err);
            setError(err instanceof Error ? err.message : "Failed to upload image");
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
    }, [productId]);

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
                    Product Image
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
                        Upload
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
                        URL
                    </button>
                </div>
            </div>

            {/* Current Image Preview */}
            {value && (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-[var(--card-border)]">
                    <img
                        src={value}
                        alt="Product preview"
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
                                        <p className="text-sm text-muted">Uploading...</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                                            <Upload className="w-6 h-6 text-amber-700" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-foreground">
                                                {dragActive ? "Drop image here" : "Click or drag to upload"}
                                            </p>
                                            <p className="text-xs text-muted mt-1">
                                                PNG, JPG, WEBP up to 5MB
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
                                    Add
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
