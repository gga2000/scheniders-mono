"use client";

import { useState, useCallback, useRef } from "react";
import {
    Palette,
    Type as TypeIcon,
    ImageIcon,
    Code,
    Upload,
    Trash2,
    Loader2,
    Check,
    AlertTriangle,
    ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import {
    generatePalette,
    generateHarmony,
    isAccessible,
    CURATED_PALETTES,
    type ColorPalette,
    type ColorHarmony,
} from "@/lib/color-utils";
import { FONT_PAIRINGS, getFontImportUrl, type FontPairing } from "@/lib/font-pairings";
import type { DesignTokens } from "@scheniders/shared";

// =============================================
// PROPS
// =============================================

interface BrandingEditorProps {
    designTokens: DesignTokens;
    updateDesignTokens: (tokens: Partial<DesignTokens>) => void;
    logoUrl: string | null;
    setLogoUrl: (v: string | null) => void;
    customCss: string;
    setCustomCss: (v: string) => void;
    tenantId: string;
}

// =============================================
// SUB-SECTION: COLOR PICKER
// =============================================

function ColorSection({
    designTokens,
    updateDesignTokens,
}: Pick<BrandingEditorProps, "designTokens" | "updateDesignTokens">) {
    const currentPrimary = designTokens.colors?.primary || "#3b82f6";
    const [showPalettes, setShowPalettes] = useState(false);

    const palette = generatePalette(currentPrimary);
    const harmony = generateHarmony(currentPrimary);
    const whiteAccessible = isAccessible(currentPrimary, "#ffffff");

    const handlePrimaryChange = useCallback(
        (color: string) => {
            const newHarmony = generateHarmony(color);
            updateDesignTokens({
                colors: {
                    primary: color,
                    secondary: newHarmony.secondary,
                    accent: newHarmony.accent,
                    background: designTokens.colors?.background || "#ffffff",
                    text: designTokens.colors?.text || "#111827",
                },
            });
        },
        [designTokens.colors, updateDesignTokens]
    );

    const handleCuratedPalette = useCallback(
        (p: (typeof CURATED_PALETTES)[number]) => {
            updateDesignTokens({
                colors: {
                    primary: p.primary,
                    secondary: p.secondary,
                    accent: p.accent,
                    background: designTokens.colors?.background || "#ffffff",
                    text: designTokens.colors?.text || "#111827",
                },
            });
        },
        [designTokens.colors, updateDesignTokens]
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Brand Colors</span>
            </div>

            {/* Primary color input */}
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="color"
                        value={currentPrimary}
                        onChange={(e) => handlePrimaryChange(e.target.value)}
                        className="w-10 h-10 rounded-xl border border-(--card-border) cursor-pointer p-0.5"
                    />
                </label>
                <input
                    type="text"
                    value={currentPrimary}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                            handlePrimaryChange(v);
                        }
                    }}
                    className="w-28 px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="#3b82f6"
                />
                <div className="flex items-center gap-1.5">
                    {whiteAccessible ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                            <Check className="w-3 h-3" /> AA
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3" /> Low contrast
                        </span>
                    )}
                </div>
            </div>

            {/* Auto-generated palette preview */}
            <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Generated Palette</span>
                <div className="flex gap-1">
                    {(Object.entries(palette) as [string, string][]).map(([shade, color]) => (
                        <div
                            key={shade}
                            className="flex-1 h-8 rounded-md first:rounded-l-lg last:rounded-r-lg cursor-pointer hover:scale-y-125 transition-transform"
                            style={{ backgroundColor: color }}
                            title={`${shade}: ${color}`}
                        />
                    ))}
                </div>
            </div>

            {/* Harmony colors */}
            <div className="flex items-center gap-3">
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Secondary</span>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={designTokens.colors?.secondary || harmony.secondary}
                            onChange={(e) =>
                                updateDesignTokens({
                                    colors: { ...designTokens.colors!, secondary: e.target.value },
                                })
                            }
                            className="w-8 h-8 rounded-lg border border-(--card-border) cursor-pointer p-0.5"
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Accent</span>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={designTokens.colors?.accent || harmony.accent}
                            onChange={(e) =>
                                updateDesignTokens({
                                    colors: { ...designTokens.colors!, accent: e.target.value },
                                })
                            }
                            className="w-8 h-8 rounded-lg border border-(--card-border) cursor-pointer p-0.5"
                        />
                    </div>
                </div>
            </div>

            {/* Curated palettes */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowPalettes(!showPalettes)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showPalettes && "rotate-180")} />
                    Preset Palettes
                </button>
                <AnimatePresence>
                    {showPalettes && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-3 gap-2 pt-3">
                                {CURATED_PALETTES.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => handleCuratedPalette(p)}
                                        className={cn(
                                            "p-2 rounded-xl border transition-all text-left",
                                            designTokens.colors?.primary === p.primary
                                                ? "border-primary ring-1 ring-primary"
                                                : "border-(--card-border) hover:border-primary/50"
                                        )}
                                    >
                                        <div className="flex gap-1 mb-1.5">
                                            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: p.primary }} />
                                            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: p.secondary }} />
                                            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: p.accent }} />
                                        </div>
                                        <span className="text-[10px] font-medium text-muted-foreground">{p.name}</span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// =============================================
// SUB-SECTION: FONT PAIRING
// =============================================

function FontSection({
    designTokens,
    updateDesignTokens,
}: Pick<BrandingEditorProps, "designTokens" | "updateDesignTokens">) {
    const selectedId = designTokens.fonts?.pairing_id || "modern-clean";

    const handleSelect = useCallback(
        (pairing: FontPairing) => {
            updateDesignTokens({
                fonts: {
                    heading: pairing.heading,
                    body: pairing.body,
                    pairing_id: pairing.id,
                },
            });
        },
        [updateDesignTokens]
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
                <TypeIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Typography</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {FONT_PAIRINGS.map((pairing) => {
                    const isSelected = selectedId === pairing.id;
                    return (
                        <button
                            key={pairing.id}
                            type="button"
                            onClick={() => handleSelect(pairing)}
                            className={cn(
                                "p-3 rounded-xl border text-left transition-all",
                                isSelected
                                    ? "border-primary ring-1 ring-primary bg-primary/5"
                                    : "border-(--card-border) hover:border-primary/50"
                            )}
                        >
                            {/* Load font for preview */}
                            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                            <link rel="stylesheet" href={getFontImportUrl(pairing)} />
                            <div
                                className="text-sm font-bold mb-0.5 leading-tight truncate"
                                style={{ fontFamily: `'${pairing.heading}', sans-serif` }}
                            >
                                {pairing.previewEn}
                            </div>
                            <div
                                className="text-xs text-muted-foreground mb-1 truncate"
                                style={{ fontFamily: `'${pairing.body}', sans-serif` }}
                            >
                                Body text preview
                            </div>
                            <div
                                className="text-xs text-muted-foreground truncate"
                                dir="rtl"
                                style={{ fontFamily: `'${pairing.headingAr}', sans-serif` }}
                            >
                                {pairing.previewAr}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-muted-foreground">
                                    {pairing.name}
                                </span>
                                {isSelected && <Check className="w-3 h-3 text-primary" />}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// =============================================
// SUB-SECTION: LOGO UPLOAD
// =============================================

function LogoSection({
    logoUrl,
    setLogoUrl,
    tenantId,
}: Pick<BrandingEditorProps, "logoUrl" | "setLogoUrl" | "tenantId">) {
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleUpload = useCallback(
        async (file: File) => {
            if (file.size > 2 * 1024 * 1024) {
                toast.error("Logo must be under 2MB");
                return;
            }
            setUploading(true);
            const ext = file.name.split(".").pop() || "png";
            const path = `${tenantId}/logo-${Date.now()}.${ext}`;

            const { error } = await supabase.storage
                .from("tenant-assets")
                .upload(path, file, { cacheControl: "3600", upsert: true });
            if (error) {
                toast.error("Upload failed", error.message);
                setUploading(false);
                return;
            }

            const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
            setLogoUrl(urlData.publicUrl);

            // Also update branding.logo_url in tenants table
            await supabase
                .from("tenants")
                .update({ branding: { logo_url: urlData.publicUrl } } as any)
                .eq("id", tenantId);

            setUploading(false);
            toast.success("Logo uploaded");
        },
        [tenantId, setLogoUrl]
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Logo</span>
            </div>

            <div className="flex items-center gap-4">
                {logoUrl ? (
                    <div className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={logoUrl}
                            alt="Store logo"
                            className="w-16 h-16 rounded-xl object-contain border border-(--card-border) bg-white p-1"
                        />
                        <button
                            type="button"
                            onClick={() => setLogoUrl(null)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-(--card-border) flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-6 h-6" />
                    </div>
                )}

                <div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(file);
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--card-border) text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Upload className="w-3.5 h-3.5" />
                        )}
                        {logoUrl ? "Change" : "Upload"}
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        PNG, JPG, WebP, SVG. Max 2MB.
                    </p>
                </div>
            </div>
        </div>
    );
}

// =============================================
// SUB-SECTION: CUSTOM CSS
// =============================================

function CustomCssSection({
    customCss,
    setCustomCss,
}: Pick<BrandingEditorProps, "customCss" | "setCustomCss">) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <Code className="w-4 h-4" />
                <span>Custom CSS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Advanced</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform ml-auto", expanded && "rotate-180")} />
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2 space-y-2">
                            <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Custom CSS may override template styles. Use with caution.
                            </p>
                            <textarea
                                value={customCss}
                                onChange={(e) => setCustomCss(e.target.value)}
                                rows={6}
                                className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                placeholder={`.storefront-hero {\n  /* your custom styles */\n}`}
                                spellCheck={false}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BrandingEditor({
    designTokens,
    updateDesignTokens,
    logoUrl,
    setLogoUrl,
    customCss,
    setCustomCss,
    tenantId,
}: BrandingEditorProps) {
    return (
        <div className="space-y-6" data-tour-id="branding-editor">
            <ColorSection designTokens={designTokens} updateDesignTokens={updateDesignTokens} />

            <div className="border-t border-(--card-border)" />

            <FontSection designTokens={designTokens} updateDesignTokens={updateDesignTokens} />

            <div className="border-t border-(--card-border)" />

            <LogoSection logoUrl={logoUrl} setLogoUrl={setLogoUrl} tenantId={tenantId} />

            <div className="border-t border-(--card-border)" />

            <CustomCssSection customCss={customCss} setCustomCss={setCustomCss} />
        </div>
    );
}
