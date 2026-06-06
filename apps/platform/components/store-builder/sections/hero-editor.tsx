"use client";

import { useState } from "react";
import { Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
interface HeroEditorProps {
  heroTitle: string;
  setHeroTitle: (v: string) => void;
  heroSubtitle: string;
  setHeroSubtitle: (v: string) => void;
  heroCta: string;
  setHeroCta: (v: string) => void;
  heroImage: string | null;
  setHeroImage: (v: string | null) => void;
  tenantId: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function HeroEditor({
  heroTitle,
  setHeroTitle,
  heroSubtitle,
  setHeroSubtitle,
  heroCta,
  setHeroCta,
  heroImage,
  setHeroImage,
  tenantId,
}: HeroEditorProps) {
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Hero image must be under 2MB");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${tenantId}/hero-${Date.now()}.${ext}`;

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("tenant-assets")
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("tenant-assets").getPublicUrl(path);

      setHeroImage(publicUrl);
      toast.success("Hero image uploaded");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      toast.error("Upload failed", message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div data-tour-id="hero-editor">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-pink)" }}
        >
          <ImageIcon className="w-4 h-4 text-rose-700" />
        </div>
        <h3 className="text-lg font-semibold">Hero Section</h3>
      </div>

      <div className="space-y-4">
        {/* Hero title */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Headline</label>
          <input
            type="text"
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            placeholder="Welcome to our store"
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors"
            )}
          />
        </div>

        {/* Hero subtitle */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Subtitle</label>
          <input
            type="text"
            value={heroSubtitle}
            onChange={(e) => setHeroSubtitle(e.target.value)}
            placeholder="Discover amazing products"
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors"
            )}
          />
        </div>

        {/* CTA text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Button Text</label>
          <input
            type="text"
            value={heroCta}
            onChange={(e) => setHeroCta(e.target.value)}
            placeholder="Shop Now"
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors"
            )}
          />
        </div>

        {/* Hero image upload */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Hero Image</label>

          {heroImage ? (
            <div className="relative rounded-xl overflow-hidden border border-(--card-border)">
              <img
                src={heroImage}
                alt="Hero preview"
                className="w-full h-40 object-cover"
              />
              <button
                type="button"
                onClick={() => setHeroImage(null)}
                className={cn(
                  "absolute top-2 right-2 w-7 h-7 rounded-full",
                  "bg-black/60 text-white flex items-center justify-center",
                  "hover:bg-black/80 transition-colors"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2",
                "w-full h-40 rounded-xl cursor-pointer",
                "border-2 border-dashed border-(--card-border)",
                "hover:border-primary/50 hover:bg-primary/5 transition-colors",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">
                {uploading ? "Uploading..." : "Click to upload (max 2MB)"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          )}

        </div>
      </div>
    </div>
  );
}
