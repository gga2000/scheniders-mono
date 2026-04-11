"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, Trash2, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import type { SEOConfig } from "@scheniders/shared";

interface SEOEditorProps {
    seo: SEOConfig;
    updateSEO: (field: keyof SEOConfig, value: string) => void;
    businessName: string;
    storeUrl: string;
    tenantId: string;
}

function CharCounter({ current, max }: { current: number; max: number }) {
    const ratio = current / max;
    const color =
        ratio > 1
            ? "text-red-500"
            : ratio > 0.85
            ? "text-amber-500"
            : "text-green-600";

    return (
        <span className={cn("text-[10px] tabular-nums", color)}>
            {current}/{max}
        </span>
    );
}

export function SEOEditor({ seo, updateSEO, businessName, storeUrl, tenantId }: SEOEditorProps) {
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const metaTitle = seo.meta_title || "";
    const metaDescription = seo.meta_description || "";
    const ogImageUrl = seo.og_image_url || "";

    // Auto-populated defaults
    const displayTitle = metaTitle || businessName;
    const displayDescription =
        metaDescription || `${businessName} — اطلب الآن من أفضل المنتجات`;

    const handleOgUpload = useCallback(
        async (file: File) => {
            if (file.size > 2 * 1024 * 1024) {
                toast.error("Image must be under 2MB");
                return;
            }
            setUploading(true);
            const ext = file.name.split(".").pop() || "jpg";
            const path = `${tenantId}/og-image-${Date.now()}.${ext}`;

            const { error } = await supabase.storage
                .from("tenant-assets")
                .upload(path, file, { cacheControl: "3600", upsert: true });
            if (error) {
                toast.error("Upload failed");
                setUploading(false);
                return;
            }
            const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
            updateSEO("og_image_url", urlData.publicUrl);
            setUploading(false);
            toast.success("OG image uploaded");
        },
        [tenantId, updateSEO]
    );

    return (
        <div className="space-y-5" data-tour-id="seo-editor">
            {/* Meta Title */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground">
                        Meta Title
                    </label>
                    <CharCounter current={metaTitle.length} max={60} />
                </div>
                <input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => updateSEO("meta_title", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={businessName}
                    dir="auto"
                    maxLength={70}
                    aria-label="Meta title"
                />
            </div>

            {/* Meta Description */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground">
                        Meta Description
                    </label>
                    <CharCounter current={metaDescription.length} max={160} />
                </div>
                <textarea
                    value={metaDescription}
                    onChange={(e) => updateSEO("meta_description", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder={`${businessName} — اطلب الآن من أفضل المنتجات`}
                    dir="auto"
                    maxLength={200}
                />
            </div>

            {/* OG Image */}
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Social Share Image (OG Image)
                </label>
                <div className="flex items-center gap-3">
                    {ogImageUrl ? (
                        <div className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={ogImageUrl}
                                alt="OG preview"
                                className="w-32 h-16 rounded-lg object-cover border border-(--card-border)"
                            />
                            <button
                                type="button"
                                onClick={() => updateSEO("og_image_url", "")}
                                aria-label="Remove social share image"
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-32 h-16 rounded-lg border-2 border-dashed border-(--card-border) flex items-center justify-center text-muted-foreground text-xs">
                            1200×630
                        </div>
                    )}
                    <div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleOgUpload(file);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--card-border) text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
                        >
                            {uploading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Upload className="w-3.5 h-3.5" />
                            )}
                            Upload
                        </button>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Recommended: 1200×630px
                        </p>
                    </div>
                </div>
            </div>

            {/* Google SERP Preview */}
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    Google Preview
                </label>
                <div className="p-4 rounded-xl border border-(--card-border) bg-white dark:bg-zinc-900 space-y-1">
                    <p className="text-xs text-green-700 dark:text-green-400 truncate" dir="ltr">
                        {storeUrl}
                    </p>
                    <p className="text-[15px] font-medium text-blue-700 dark:text-blue-400 truncate hover:underline cursor-default">
                        {displayTitle}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                        {displayDescription}
                    </p>
                </div>
            </div>
        </div>
    );
}
