"use client";

import { useState, useCallback, useRef } from "react";
import { Plus, Trash2, Upload, Loader2, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface GalleryEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
    tenantId: string;
}

const MAX_IMAGES = 12;

export function GalleryEditor({ data, onUpdate, tenantId }: GalleryEditorProps) {
    const images = (data.images as string[]) || [];
    const layout = (data.layout as string) || "grid";
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleUpload = useCallback(
        async (files: FileList) => {
            const remaining = MAX_IMAGES - images.length;
            const filesToUpload = Array.from(files).slice(0, remaining);

            if (filesToUpload.length === 0) {
                toast.error(`Maximum ${MAX_IMAGES} images allowed`);
                return;
            }

            setUploading(true);
            const newUrls: string[] = [];

            for (const file of filesToUpload) {
                if (file.size > 2 * 1024 * 1024) {
                    toast.error(`${file.name} exceeds 2MB limit`);
                    continue;
                }

                const ext = file.name.split(".").pop() || "jpg";
                const path = `${tenantId}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

                const { error } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file, { cacheControl: "3600", upsert: true });

                if (error) {
                    toast.error(`Failed to upload ${file.name}`);
                    continue;
                }

                const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
                newUrls.push(urlData.publicUrl);
            }

            if (newUrls.length > 0) {
                onUpdate({ ...data, images: [...images, ...newUrls] });
                toast.success(`${newUrls.length} image${newUrls.length > 1 ? "s" : ""} uploaded`);
            }
            setUploading(false);
        },
        [data, images, tenantId, onUpdate]
    );

    const removeImage = useCallback(
        (index: number) => {
            onUpdate({ ...data, images: images.filter((_, i) => i !== index) });
        },
        [data, images, onUpdate]
    );

    return (
        <div className="space-y-4">
            {/* Layout selector */}
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Layout
                </label>
                <div className="flex gap-2">
                    {(["grid", "masonry"] as const).map((l) => (
                        <button
                            key={l}
                            type="button"
                            onClick={() => onUpdate({ ...data, layout: l })}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize",
                                layout === l
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-(--card-border) text-muted-foreground hover:border-primary/50"
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Image grid */}
            <div className="grid grid-cols-3 gap-2">
                {images.map((url, index) => (
                    <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-(--card-border)">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                ))}

                {/* Upload area */}
                {images.length < MAX_IMAGES && (
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="aspect-square rounded-lg border-2 border-dashed border-(--card-border) flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Plus className="w-5 h-5" />
                                <span className="text-[10px] mt-0.5">Add</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleUpload(e.target.files);
                    }
                }}
            />

            <p className="text-[10px] text-muted-foreground">
                {images.length}/{MAX_IMAGES} images. Max 2MB each. PNG, JPG, WebP.
            </p>
        </div>
    );
}
