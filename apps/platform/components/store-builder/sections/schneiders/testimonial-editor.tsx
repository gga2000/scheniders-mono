"use client";

import { useState } from "react";
import { MessageSquareQuote, Upload, Loader2, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { SCHNEIDERS_DEFAULTS, type TestimonialConfig } from "@scheniders/shared";

interface TestimonialEditorProps {
  value: TestimonialConfig;
  onChange: (next: TestimonialConfig) => void;
  tenantId: string;
}

const DEF = SCHNEIDERS_DEFAULTS.testimonial;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export function TestimonialEditor({ value, onChange, tenantId }: TestimonialEditorProps) {
  const [uploading, setUploading] = useState(false);
  const enabled = value.enabled ?? DEF.enabled;
  const rating = (value.rating ?? DEF.rating) as 1 | 2 | 3 | 4 | 5;

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Avatar must be under 2MB");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${tenantId}/testimonial-${Date.now()}.${ext}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("tenant-assets")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("tenant-assets").getPublicUrl(path);
      onChange({ ...value, avatar_url: publicUrl });
      toast.success("Avatar uploaded");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Upload failed";
      toast.error("Upload failed", m);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-pink)" }}
        >
          <MessageSquareQuote className="w-4 h-4 text-rose-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Customer Testimonial</h3>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable testimonial"
          onClick={() => onChange({ ...value, enabled: !enabled })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors",
            enabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full",
              "bg-white shadow-sm ring-0 transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      <div className="space-y-4">
        {/* Quote */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Quote</label>
          <textarea
            value={value.quote ?? ""}
            onChange={(e) => onChange({ ...value, quote: e.target.value })}
            placeholder={DEF.quote}
            rows={3}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm resize-none",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors",
            )}
          />
        </div>

        {/* Reviewer name + city */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reviewer Name</label>
            <input
              type="text"
              value={value.reviewer_name ?? ""}
              onChange={(e) => onChange({ ...value, reviewer_name: e.target.value })}
              placeholder={DEF.reviewer_name}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">City</label>
            <input
              type="text"
              value={value.reviewer_city ?? ""}
              onChange={(e) => onChange({ ...value, reviewer_city: e.target.value })}
              placeholder={DEF.reviewer_city}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
        </div>

        {/* Badge text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Badge Text</label>
          <input
            type="text"
            value={value.badge_text ?? ""}
            onChange={(e) => onChange({ ...value, badge_text: e.target.value })}
            placeholder={DEF.badge_text}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors",
            )}
          />
        </div>

        {/* Rating */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rating</label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => onChange({ ...value, rating: n as 1 | 2 | 3 | 4 | 5 })}
                className="p-1 hover:scale-110 transition-transform"
              >
                <Star
                  className={cn(
                    "w-6 h-6",
                    n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Avatar upload */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Avatar (optional)</label>
          {value.avatar_url ? (
            <div className="relative inline-block">
              <img
                src={value.avatar_url}
                alt="Reviewer avatar"
                className="w-20 h-20 rounded-full object-cover border border-(--card-border)"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, avatar_url: "" })}
                className={cn(
                  "absolute -top-1 -right-1 w-6 h-6 rounded-full",
                  "bg-black/60 text-white flex items-center justify-center",
                  "hover:bg-black/80 transition-colors",
                )}
                aria-label="Remove avatar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-1.5",
                "w-full h-24 rounded-xl cursor-pointer",
                "border-2 border-dashed border-(--card-border)",
                "hover:border-primary/50 hover:bg-primary/5 transition-colors",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              ) : (
                <Upload className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {uploading ? "Uploading..." : "Click to upload (max 2MB)"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
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
