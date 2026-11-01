"use client";

import { useState, useRef } from "react";
import { Download, Key, FileText, Upload, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

import type { ProductEditorFormData } from "@/hooks/use-product-editor";

interface DigitalFieldsSectionProps {
    formData: ProductEditorFormData;
    updateField: <K extends keyof ProductEditorFormData>(field: K, value: ProductEditorFormData[K]) => void;
    productId?: string;
}

export function DigitalFieldsSection({ formData, updateField, productId }: DigitalFieldsSectionProps) {
    const { t } = useLanguage();
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (file: File) => {
        if (file.size > 100 * 1024 * 1024) {
            toast.error(t("products.digital.tooBig"));
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
            const fileName = `digital/${productId || "temp"}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(fileName, file, {
                    cacheControl: "3600",
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(fileName);

            updateField("download_url", urlData.publicUrl);
            updateField("file_size", formatFileSize(file.size));
            toast.success(t("products.digital.uploaded"));
        } catch (err) {
            console.error("Upload error:", err);
            toast.error(t("products.digital.uploadFailed"));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t("products.digital.title")}
            </h2>

            {/* File Upload / URL */}
            <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">
                    {t("products.digital.file")}
                </label>

                {formData.download_url ? (
                    <div className="flex items-center gap-3 p-3 bg-[var(--pastel-green)] rounded-xl">
                        <FileText className="w-5 h-5 text-green-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-800 truncate">
                                {formData.download_url.split('/').pop()}
                            </p>
                            {formData.file_size && (
                                <p className="text-xs text-green-700">{formData.file_size}</p>
                            )}
                        </div>
                        <a
                            href={formData.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-green-700 hover:text-green-900 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                updateField("download_url", "");
                                updateField("file_size", "");
                            }}
                            className="text-xs text-green-700 hover:text-green-900 font-medium"
                        >
                            {t("products.digital.remove")}
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-6 bg-[var(--background)] border-2 border-dashed border-[var(--card-border)] rounded-xl cursor-pointer hover:border-[var(--ink)]/30 transition-colors"
                    >
                        {uploading ? (
                            <Loader2 className="w-6 h-6 text-muted animate-spin" />
                        ) : (
                            <Upload className="w-6 h-6 text-muted" />
                        )}
                        <p className="text-sm text-muted">
                            {uploading ? t("products.digital.uploading") : t("products.digital.clickUpload")}
                        </p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                    }}
                />

                {/* Or paste URL */}
                <div>
                    <label className="block text-xs text-muted mb-1">{t("products.digital.pasteUrl")}</label>
                    <input
                        type="url"
                        value={formData.download_url || ""}
                        onChange={(e) => updateField("download_url", e.target.value)}
                        placeholder="https://example.com/file.zip"
                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                    />
                </div>
            </div>

            {/* License Key Pattern */}
            <div>
                <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4 text-muted" />
                    {t("products.digital.licensePattern")}
                    <span className="text-xs text-muted">{t("products.digital.optional")}</span>
                </label>
                <input
                    type="text"
                    value={formData.license_key_pattern || ""}
                    onChange={(e) => updateField("license_key_pattern", e.target.value)}
                    placeholder={t("products.digital.licensePh")}
                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                />
                <p className="text-xs text-muted mt-1">
                    {t("products.digital.licenseHint")}
                </p>
            </div>
        </div>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}
