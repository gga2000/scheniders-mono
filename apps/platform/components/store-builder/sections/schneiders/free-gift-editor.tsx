"use client";

import { useState } from "react";
import type { FreeGiftConfig } from "@scheniders/shared";
import { Gift, Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import {
  Field,
  SectionHeader,
  Switch,
  TextInput,
  formatIQD,
  parseIQD,
} from "./_shared";

interface FreeGiftEditorProps {
  value: FreeGiftConfig | undefined;
  onChange: (next: FreeGiftConfig) => void;
  tenantId: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function FreeGiftEditor({ value, onChange, tenantId }: FreeGiftEditorProps) {
  const v: FreeGiftConfig = value ?? {};
  const set = (patch: Partial<FreeGiftConfig>) => onChange({ ...v, ...patch });
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Gift image must be under 2MB");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${tenantId}/free-gift-${Date.now()}.${ext}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("tenant-assets")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("tenant-assets").getPublicUrl(path);
      set({ image_url: publicUrl });
      toast.success("Gift image uploaded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      toast.error("Upload failed", message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <SectionHeader
        icon={Gift}
        title="Free Gift"
        bg="var(--pastel-lilac)"
        iconClass="text-violet-700"
      />
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2">
          <div className="flex-1 text-sm font-medium">Enable free gift</div>
          <Switch
            checked={!!v.enabled}
            onChange={(b) => set({ enabled: b })}
          />
        </div>

        <Field label="Threshold (IQD)" hint="Cart total above which the gift unlocks.">
          <TextInput
            value={formatIQD(v.threshold_iqd)}
            onChange={(s) => set({ threshold_iqd: parseIQD(s) })}
            placeholder="150,000"
          />
        </Field>

        <Field label="Label">
          <TextInput
            value={v.label ?? ""}
            onChange={(s) => set({ label: s })}
            placeholder="Free Gift with this order 🎁"
          />
        </Field>

        <Field label="Gift image">
          {v.image_url ? (
            <div className="relative rounded-xl overflow-hidden border border-(--card-border)">
              <img
                src={v.image_url}
                alt="Gift preview"
                className="w-full h-40 object-cover"
              />
              <button
                type="button"
                onClick={() => set({ image_url: "" })}
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
                "w-full h-32 rounded-xl cursor-pointer",
                "border-2 border-dashed border-(--card-border)",
                "hover:border-primary/50 hover:bg-primary/5 transition-colors",
                uploading && "pointer-events-none opacity-60"
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
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          )}
        </Field>
      </div>
    </div>
  );
}
