"use client";

// =====================================================================
// BrandKitEditor — full-page editor for `BrandKit`
// =====================================================================
// Single screen. No collapsibles. Left = scrollable form, right = sticky
// mini-preview rendered live from the same `buildBrandKitVars` helper
// that drives the storefront.
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactElement,
    type ReactNode,
} from "react";
import {
    Image as ImageIcon,
    Upload,
    X,
    Loader2,
    Palette,
    Type as TypeIcon,
    Shapes,
    Activity,
    MessageCircle,
    Pipette,
    RotateCcw,
    Shuffle,
    Wand2,
} from "lucide-react";
import type {
    BrandKit,
    BrandColors,
    BrandTypography,
    BrandShape,
    BrandMotion,
    BrandVoice,
    BrandIdentity,
    I18nString,
} from "@scheniders/shared";
import {
    EMPTY_BRAND_KIT,
    buildBrandKitVars,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { I18nStringInput } from "./i18n-string-input";

/* ─────────────────────────────────────────────────────────────────── */
/* Fonts catalogue                                                      */
/* ─────────────────────────────────────────────────────────────────── */

const GOOGLE_FONTS: readonly string[] = [
    "Bricolage Grotesque",
    "DM Sans",
    "Inter",
    "Playfair Display",
    "Manrope",
    "Outfit",
    "Space Grotesk",
    "Plus Jakarta Sans",
    "Public Sans",
    "IBM Plex Sans",
    "Anton",
    "Bebas Neue",
    "Newsreader",
    "EB Garamond",
    "Source Serif Pro",
    "Lora",
    "Cormorant",
    "Fraunces",
    "Geist",
    "Geist Mono",
    "Karla",
    "Lexend",
    "Montserrat",
    "Nunito",
    "Poppins",
    "Raleway",
    "Roboto",
    "Work Sans",
    "Bricolage",
    "Playfair",
] as const;

/* ─────────────────────────────────────────────────────────────────── */
/* Candy defaults — per-slot reset                                      */
/* ─────────────────────────────────────────────────────────────────── */

const CANDY_DEFAULTS: Readonly<BrandColors> = {
    primary: "#ff5a8a",
    secondary: "#c5b6ff",
    accent: "#ffd84a",
    surface: "#fff7ed",
    surface_alt: "#ffffff",
    ink: "#1a1a1a",
    success: "#7cf0bd",
    danger: "#ff4d4d",
} as const;

/* ─────────────────────────────────────────────────────────────────── */
/* Color helpers (pure)                                                 */
/* ─────────────────────────────────────────────────────────────────── */

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isValidHex(value: string): boolean {
    return HEX_RE.test(value);
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function pad2(n: number): string {
    const s = Math.round(clamp(n, 0, 255)).toString(16);
    return s.length === 1 ? `0${s}` : s;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${pad2(r)}${pad2(g)}${pad2(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
    if (!isValidHex(hex)) return { h: 0, s: 0, l: 0 };
    const { r: R, g: G, b: B } = hexToRgb(hex);
    const r = R / 255;
    const g = G / 255;
    const b = B / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h *= 60;
    }
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

function hslToHex(h: number, s: number, l: number): string {
    const hh = ((h % 360) + 360) % 360 / 360;
    const ss = clamp(s, 0, 100) / 100;
    const ll = clamp(l, 0, 100) / 100;
    if (ss === 0) {
        const v = Math.round(ll * 255);
        return rgbToHex(v, v, v);
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const conv = (t: number): number => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    return rgbToHex(
        Math.round(conv(hh + 1 / 3) * 255),
        Math.round(conv(hh) * 255),
        Math.round(conv(hh - 1 / 3) * 255),
    );
}

/** Relative luminance per WCAG. */
function luminance(hex: string): number {
    if (!isValidHex(hex)) return 0;
    const { r, g, b } = hexToRgb(hex);
    const norm = (c: number): number => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

function contrastRatio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    const [lo, hi] = la < lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

type ContrastGrade = "AAA" | "AA" | "Fail";

function gradeContrast(ratio: number): ContrastGrade {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    return "Fail";
}

/** Generate ~12 harmonious tones around a given color. */
function suggestedTones(hex: string): string[] {
    if (!isValidHex(hex)) return [];
    const { h, s, l } = hexToHsl(hex);
    const out: string[] = [];
    // Lightness ladder
    out.push(hslToHex(h, s, clamp(l + 28, 5, 95)));
    out.push(hslToHex(h, s, clamp(l + 14, 5, 95)));
    out.push(hslToHex(h, s, clamp(l - 14, 5, 95)));
    out.push(hslToHex(h, s, clamp(l - 28, 5, 95)));
    // Saturation variants
    out.push(hslToHex(h, clamp(s - 30, 0, 100), l));
    out.push(hslToHex(h, clamp(s + 20, 0, 100), l));
    // Complementary
    out.push(hslToHex(h + 180, s, l));
    out.push(hslToHex(h + 180, s, clamp(l + 15, 5, 95)));
    // Analogous
    out.push(hslToHex(h + 30, s, l));
    out.push(hslToHex(h - 30, s, l));
    // Triadic
    out.push(hslToHex(h + 120, s, l));
    out.push(hslToHex(h - 120, s, l));
    return out;
}

function randomHarmoniousPalette(): BrandColors {
    const baseHue = Math.floor(Math.random() * 360);
    return {
        primary: hslToHex(baseHue, 75, 60),
        secondary: hslToHex((baseHue + 150) % 360, 60, 70),
        accent: hslToHex((baseHue + 45) % 360, 85, 60),
        surface: hslToHex(baseHue, 30, 96),
        surface_alt: "#ffffff",
        ink: hslToHex(baseHue, 25, 12),
        success: "#7cf0bd",
        danger: "#ff4d4d",
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Logo palette extractor                                               */
/* ─────────────────────────────────────────────────────────────────── */

async function extractPaletteFromLogo(url: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const SIZE = 64;
                const canvas = document.createElement("canvas");
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas unavailable"));
                    return;
                }
                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

                // Bucket by 16 hue bins × lightness band.
                const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i] ?? 0;
                    const g = data[i + 1] ?? 0;
                    const b = data[i + 2] ?? 0;
                    const a = data[i + 3] ?? 0;
                    if (a < 128) continue;
                    // Exclude near-white & near-black
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const l = (max + min) / 2 / 255;
                    if (l > 0.95 || l < 0.05) continue;
                    const hex = rgbToHex(r, g, b);
                    const { h, l: ll } = hexToHsl(hex);
                    const hueBucket = Math.floor(h / (360 / 16));
                    const lightBucket = ll < 33 ? "d" : ll > 66 ? "l" : "m";
                    const key = `${hueBucket}-${lightBucket}`;
                    const entry = buckets.get(key);
                    if (entry) {
                        entry.count += 1;
                        entry.r += r;
                        entry.g += g;
                        entry.b += b;
                    } else {
                        buckets.set(key, { count: 1, r, g, b });
                    }
                }

                const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
                const palette: string[] = [];
                for (const entry of sorted) {
                    const hex = rgbToHex(
                        entry.r / entry.count,
                        entry.g / entry.count,
                        entry.b / entry.count,
                    );
                    // dedupe near-identical colors
                    const exists = palette.some((p) => contrastRatio(p, hex) < 1.1);
                    if (!exists) palette.push(hex);
                    if (palette.length >= 5) break;
                }
                resolve(palette);
            } catch (err) {
                reject(err instanceof Error ? err : new Error("Extraction failed"));
            }
        };
        img.onerror = () => reject(new Error("Failed to load logo"));
        img.src = url;
    });
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component props                                                      */
/* ─────────────────────────────────────────────────────────────────── */

export interface BrandKitEditorProps {
    value: BrandKit;
    onChange: (next: BrandKit) => void;
    /** Tenant id — needed for asset uploads. Optional in tests. */
    tenantId?: string;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Reset helpers                                                        */
/* ─────────────────────────────────────────────────────────────────── */

type ResetKey = keyof BrandKit;

/* ─────────────────────────────────────────────────────────────────── */
/* Card primitive                                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface CardProps {
    title: string;
    icon: ReactNode;
    onReset: () => void;
    resetTestId: string;
    children: ReactNode;
}

function Card({ title, icon, onReset, resetTestId, children }: CardProps): ReactElement {
    return (
        <section className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-sm">
            <header className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {icon}
                    </span>
                    <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                </div>
                <button
                    type="button"
                    onClick={onReset}
                    data-testid={resetTestId}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                </button>
            </header>
            <div>{children}</div>
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Segmented control                                                    */
/* ─────────────────────────────────────────────────────────────────── */

interface SegmentedOption<V extends string> {
    value: V;
    label: string;
    sub?: string;
    preview?: ReactNode;
}

interface SegmentedProps<V extends string> {
    value: V;
    onChange: (v: V) => void;
    options: ReadonlyArray<SegmentedOption<V>>;
    disabled?: boolean;
    testIdPrefix?: string;
    columns?: 2 | 3 | 4;
}

function Segmented<V extends string>({
    value,
    onChange,
    options,
    disabled = false,
    testIdPrefix,
    columns = 4,
}: SegmentedProps<V>): ReactElement {
    const gridCols =
        columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-4";
    return (
        <div className={cn("grid gap-2", gridCols)}>
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={disabled}
                        data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-center transition-colors",
                            disabled && "opacity-50 cursor-not-allowed",
                            isActive
                                ? "border-primary bg-primary/10"
                                : "border-(--card-border) bg-background hover:border-primary/40 hover:bg-muted/40",
                        )}
                    >
                        {opt.preview && (
                            <div className="flex h-7 items-center justify-center">
                                {opt.preview}
                            </div>
                        )}
                        <div className="text-[11px] font-semibold tracking-tight">
                            {opt.label}
                        </div>
                        {opt.sub && (
                            <div className="text-[10px] leading-tight text-muted-foreground">
                                {opt.sub}
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Image upload field                                                   */
/* ─────────────────────────────────────────────────────────────────── */

interface ImageFieldProps {
    label: string;
    value: string | undefined;
    onChange: (next: string | undefined) => void;
    tenantId?: string;
    maxBytes: number;
    helperText: string;
    /** Aspect helper text — preview frame sizing. */
    previewAspect: "square" | "favicon" | "og";
    onReset: () => void;
    testIdPrefix: string;
}

function ImageField({
    label,
    value,
    onChange,
    tenantId,
    maxBytes,
    helperText,
    previewAspect,
    onReset,
    testIdPrefix,
}: ImageFieldProps): ReactElement {
    const [uploading, setUploading] = useState<boolean>(false);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > maxBytes) {
                toast.error(`${label} must be under ${Math.round(maxBytes / 1024 / 1024 * 10) / 10}MB`);
                return;
            }
            if (!tenantId) {
                toast.error("Missing tenant context for upload");
                return;
            }
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            const path = `${tenantId}/brand-${testIdPrefix}-${Date.now()}.${ext}`;
            setUploading(true);
            try {
                const { error } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file, { upsert: true });
                if (error) throw error;
                const {
                    data: { publicUrl },
                } = supabase.storage.from("tenant-assets").getPublicUrl(path);
                onChange(publicUrl);
                toast.success(`${label} uploaded`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Upload failed";
                toast.error("Upload failed", msg);
            } finally {
                setUploading(false);
            }
        },
        [label, maxBytes, onChange, tenantId, testIdPrefix],
    );

    const previewBox = (
        <div
            data-testid={`${testIdPrefix}-preview`}
            className={cn(
                "relative shrink-0 overflow-hidden rounded-xl border border-(--card-border) bg-muted/30",
                previewAspect === "square" && "h-20 w-20",
                previewAspect === "favicon" && "h-8 w-8 rounded-md",
                previewAspect === "og" && "h-20 w-[160px]",
            )}
        >
            {value ? (
                <img
                    src={value}
                    alt={label}
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-4 w-4" />
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{label}</label>
                <button
                    type="button"
                    onClick={onReset}
                    data-testid={`${testIdPrefix}-reset`}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                    Reset
                </button>
            </div>
            <div className="flex items-stretch gap-3">
                {previewBox}
                <label
                    className={cn(
                        "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-(--card-border) px-3 py-2 text-center transition-colors",
                        "hover:border-primary/50 hover:bg-primary/5",
                        uploading && "pointer-events-none opacity-60",
                    )}
                >
                    {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-[11px] text-muted-foreground">
                        {uploading ? "Uploading…" : "Upload image"}
                    </span>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleUpload}
                        className="hidden"
                        disabled={uploading}
                        data-testid={`${testIdPrefix}-file-input`}
                    />
                </label>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        data-testid={`${testIdPrefix}-clear`}
                        aria-label={`Clear ${label}`}
                        className="self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            <p className="text-[11px] text-muted-foreground">{helperText}</p>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* HSL slider primitive                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface HslSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
    gradient: string;
    testId: string;
}

function HslSlider({
    label,
    value,
    min,
    max,
    onChange,
    gradient,
    testId,
}: HslSliderProps): ReactElement {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </label>
                <span className="font-mono text-[10px] tabular-nums text-foreground/80">
                    {value}
                </span>
            </div>
            <div
                className="relative h-4 rounded-full border border-(--card-border)"
                style={{ background: gradient }}
            >
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    data-testid={testId}
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow"
                />
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Color picker popover                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface ColorPopoverProps {
    keyName: keyof BrandColors;
    value: string;
    onChange: (next: string) => void;
    onReset: () => void;
    onClose: () => void;
}

function ColorPopover({
    keyName,
    value,
    onChange,
    onReset,
    onClose,
}: ColorPopoverProps): ReactElement {
    const safeValue = isValidHex(value) ? value : "#000000";
    const hsl = useMemo(() => hexToHsl(safeValue), [safeValue]);
    const tones = useMemo(() => suggestedTones(safeValue), [safeValue]);
    const rootRef = useRef<HTMLDivElement>(null);

    const hasEyeDropper = useMemo(
        () =>
            typeof window !== "undefined" &&
            typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === "function",
        [],
    );

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) onClose();
        };
        // Defer 1 tick so the opening click doesn't immediately close.
        const id = window.setTimeout(() => {
            document.addEventListener("mousedown", onDocClick);
        }, 0);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener("mousedown", onDocClick);
        };
    }, [onClose]);

    const setHue = (h: number): void => onChange(hslToHex(h, hsl.s, hsl.l));
    const setSat = (s: number): void => onChange(hslToHex(hsl.h, s, hsl.l));
    const setLight = (l: number): void => onChange(hslToHex(hsl.h, hsl.s, l));

    const useEyeDropper = async (): Promise<void> => {
        try {
            const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
            const result = await new Ctor().open();
            const hex = result.sRGBHex.toLowerCase();
            if (isValidHex(hex)) onChange(hex);
        } catch {
            // user cancelled; ignore
        }
    };

    return (
        <div
            ref={rootRef}
            data-testid={`color-popover-${keyName}`}
            className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border-2 border-(--card-border) bg-(--card-bg) p-3 shadow-[4px_4px_0_0_var(--card-border)]"
        >
            <div className="space-y-3">
                <HslSlider
                    label="Hue"
                    value={hsl.h}
                    min={0}
                    max={360}
                    onChange={setHue}
                    gradient="linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                    testId={`color-hue-${keyName}`}
                />
                <HslSlider
                    label="Saturation"
                    value={hsl.s}
                    min={0}
                    max={100}
                    onChange={setSat}
                    gradient={`linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`}
                    testId={`color-sat-${keyName}`}
                />
                <HslSlider
                    label="Lightness"
                    value={hsl.l}
                    min={0}
                    max={100}
                    onChange={setLight}
                    gradient={`linear-gradient(to right, #000000, ${hslToHex(hsl.h, hsl.s, 50)}, #ffffff)`}
                    testId={`color-light-${keyName}`}
                />

                <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Suggested
                    </div>
                    <div
                        className="grid grid-cols-6 gap-1"
                        data-testid={`color-suggested-${keyName}`}
                    >
                        {tones.map((tone, idx) => (
                            <button
                                key={`${tone}-${idx}`}
                                type="button"
                                onClick={() => onChange(tone)}
                                title={tone}
                                data-testid={`color-tone-${keyName}-${idx}`}
                                className="aspect-square rounded-md border border-(--card-border) transition-transform hover:scale-110"
                                style={{ background: tone }}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {hasEyeDropper && (
                        <button
                            type="button"
                            onClick={useEyeDropper}
                            data-testid={`color-eyedropper-${keyName}`}
                            className="inline-flex items-center gap-1 rounded-md border border-(--card-border) bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted/40"
                        >
                            <Pipette className="h-3 w-3" />
                            Pick
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onReset}
                        data-testid={`color-popover-reset-${keyName}`}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Color field (swatch + hex + popover)                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface ColorFieldProps {
    label: string;
    keyName: keyof BrandColors;
    value: string;
    onChange: (next: string) => void;
}

function ColorField({ label, keyName, value, onChange }: ColorFieldProps): ReactElement {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string>(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const handleHexChange = (raw: string): void => {
        let next = raw.trim().toLowerCase();
        if (!next.startsWith("#")) next = `#${next}`;
        setDraft(next);
        if (isValidHex(next)) onChange(next);
    };

    const resetDefault = (): void => {
        onChange(CANDY_DEFAULTS[keyName]);
    };

    return (
        <div className="relative space-y-1.5" data-testid={`color-field-${keyName}`}>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-label={`Edit ${label} color`}
                    data-testid={`color-swatch-${keyName}`}
                    className="relative h-10 w-10 shrink-0 cursor-pointer rounded-lg border-[3px] border-foreground shadow-[3px_3px_0_0_var(--card-border)] transition-transform hover:scale-[1.04] active:translate-x-px active:translate-y-px active:shadow-[2px_2px_0_0_var(--card-border)]"
                    style={{ backgroundColor: isValidHex(value) ? value : "#ffffff" }}
                />
                {/* Hidden native color input — kept for tests + as low-friction fallback */}
                <input
                    type="color"
                    value={isValidHex(value) ? value : "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="sr-only"
                    data-testid={`color-input-${keyName}`}
                    aria-hidden="true"
                    tabIndex={-1}
                />
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => handleHexChange(e.target.value)}
                    placeholder="#000000"
                    spellCheck={false}
                    data-testid={`color-hex-${keyName}`}
                    className={cn(
                        "flex-1 rounded-lg border border-(--card-border) bg-background px-3 py-1.5 font-mono text-xs uppercase",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                        !isValidHex(draft) && "border-red-500/60 text-red-600",
                    )}
                />
            </div>
            {open && (
                <ColorPopover
                    keyName={keyName}
                    value={value}
                    onChange={onChange}
                    onReset={resetDefault}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Contrast badges                                                      */
/* ─────────────────────────────────────────────────────────────────── */

interface ContrastBadgeProps {
    label: string;
    fg: string;
    bg: string;
    testId: string;
}

function ContrastBadge({ label, fg, bg, testId }: ContrastBadgeProps): ReactElement {
    const ratio = contrastRatio(fg, bg);
    const grade = gradeContrast(ratio);
    const tone =
        grade === "AAA"
            ? "bg-emerald-500/15 text-emerald-700"
            : grade === "AA"
                ? "bg-amber-500/15 text-amber-700"
                : "bg-red-500/15 text-red-700";
    return (
        <div
            data-testid={testId}
            className="flex items-center justify-between gap-2 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5"
        >
            <div className="flex items-center gap-2">
                <div className="flex">
                    <span
                        className="h-5 w-5 rounded-l border border-foreground/20"
                        style={{ background: bg }}
                    />
                    <span
                        className="h-5 w-5 rounded-r border border-l-0 border-foreground/20"
                        style={{ background: fg }}
                    />
                </div>
                <span className="text-[11px] font-medium">{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {ratio.toFixed(2)}
                </span>
                <span
                    data-testid={`${testId}-grade`}
                    className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        tone,
                    )}
                >
                    {grade}
                </span>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Font combobox                                                        */
/* ─────────────────────────────────────────────────────────────────── */

interface FontComboProps {
    value: string;
    onChange: (v: string) => void;
    testId: string;
}

function FontCombo({ value, onChange, testId }: FontComboProps): ReactElement {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className={cn(
                    "w-full appearance-none rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                )}
                style={{ fontFamily: `'${value}', system-ui, sans-serif` }}
            >
                {GOOGLE_FONTS.map((f) => (
                    <option
                        key={f}
                        value={f}
                        style={{ fontFamily: `'${f}', system-ui, sans-serif` }}
                    >
                        {f}
                    </option>
                ))}
            </select>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Derived-swatch strip                                                 */
/* ─────────────────────────────────────────────────────────────────── */

const ALL_SWATCH_KEYS: ReadonlyArray<{ name: string; cssVar: string }> = [
    { name: "primary", cssVar: "--bk-primary" },
    { name: "secondary", cssVar: "--bk-secondary" },
    { name: "accent", cssVar: "--bk-accent" },
    { name: "surface", cssVar: "--bk-surface" },
    { name: "surface-alt", cssVar: "--bk-surface-alt" },
    { name: "ink", cssVar: "--bk-ink" },
    { name: "success", cssVar: "--bk-success" },
    { name: "danger", cssVar: "--bk-danger" },
    { name: "on-primary", cssVar: "--bk-on-primary" },
    { name: "on-secondary", cssVar: "--bk-on-secondary" },
    { name: "on-accent", cssVar: "--bk-on-accent" },
    { name: "primary-hover", cssVar: "--bk-primary-hover" },
    { name: "primary-soft", cssVar: "--bk-primary-soft" },
    { name: "ink-soft", cssVar: "--bk-ink-soft" },
    { name: "ink-faint", cssVar: "--bk-ink-faint" },
    { name: "divider", cssVar: "--bk-divider" },
];

function readVar(vars: Record<string, string>, name: string): string {
    return vars[name] ?? "";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Live preview pane                                                    */
/* ─────────────────────────────────────────────────────────────────── */

function LivePreview({ value }: { value: BrandKit }): ReactElement {
    const vars = useMemo(
        () => buildBrandKitVars(value) as unknown as Record<string, string>,
        [value],
    );

    const previewStyle = vars as unknown as CSSProperties;

    const storeName = value.identity?.name?.trim() || "Your Store";

    return (
        <aside
            data-testid="brand-kit-preview"
            className="sticky top-4 flex flex-col gap-4 rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-sm"
        >
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold tracking-tight">Live preview</h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Real-time
                </span>
            </div>

            <div
                data-testid="brand-kit-preview-stage"
                style={previewStyle}
                className="space-y-3 rounded-2xl p-4"
            >
                <div
                    className="rounded-[var(--bk-radius-card)] p-4"
                    style={{
                        background: "var(--bk-surface)",
                        border: "var(--bk-border-thickness) solid var(--bk-ink)",
                        boxShadow: "var(--bk-shadow-card)",
                        color: "var(--bk-ink)",
                    }}
                >
                    <div
                        className="text-2xl"
                        style={{
                            fontFamily: "var(--bk-font-display)",
                            fontWeight: 700,
                            letterSpacing: "-0.01em",
                            lineHeight: 1.1,
                        }}
                    >
                        {storeName}
                    </div>
                    <div
                        className="mt-1 text-sm"
                        style={{
                            fontFamily: "var(--bk-font-body)",
                            color: "var(--bk-ink-soft)",
                            fontSize: "calc(var(--bk-scale-base) * 0.875)",
                            lineHeight: "var(--bk-scale-leading)",
                        }}
                    >
                        Brand wordmark + body type
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {/* Primary CTA */}
                    <div
                        className="rounded-[var(--bk-radius-card)] p-3"
                        style={{
                            background: "var(--bk-primary)",
                            border: "var(--bk-border-thickness) solid var(--bk-ink)",
                            boxShadow: "var(--bk-shadow-button)",
                            color: "var(--bk-on-primary)",
                        }}
                    >
                        <div
                            className="text-[10px] uppercase tracking-wider opacity-80"
                            style={{ fontFamily: "var(--bk-font-body)" }}
                        >
                            CTA
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            Shop now
                        </div>
                    </div>

                    {/* Secondary surface */}
                    <div
                        className="rounded-[var(--bk-radius-card)] p-3"
                        style={{
                            background: "var(--bk-secondary)",
                            border: "var(--bk-border-thickness) solid var(--bk-ink)",
                            color: "var(--bk-on-secondary)",
                        }}
                    >
                        <div
                            className="text-[10px] uppercase tracking-wider opacity-80"
                            style={{ fontFamily: "var(--bk-font-body)" }}
                        >
                            Surface
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            Hello
                        </div>
                    </div>

                    {/* Cream text */}
                    <div
                        className="rounded-[var(--bk-radius-card)] p-3"
                        style={{
                            background: "var(--bk-surface-alt)",
                            border: "var(--bk-border-thickness) solid var(--bk-ink)",
                            color: "var(--bk-ink)",
                        }}
                    >
                        <div
                            className="text-[10px] uppercase tracking-wider"
                            style={{
                                fontFamily: "var(--bk-font-body)",
                                color: "var(--bk-ink-soft)",
                            }}
                        >
                            Ink
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            Aa Bb
                        </div>
                    </div>
                </div>

                {/* Sticker w/ rotation */}
                <div className="flex items-center justify-center py-2">
                    <div
                        className="inline-block rounded-[var(--bk-radius-card)] px-3 py-1.5"
                        style={{
                            background: "var(--bk-accent)",
                            border: "var(--bk-border-thickness) solid var(--bk-ink)",
                            color: "var(--bk-on-accent)",
                            transform: `rotate(calc(-8deg * var(--bk-wedge-multiplier)))`,
                            fontFamily: "var(--bk-font-display)",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                        }}
                    >
                        SALE!
                    </div>
                </div>
            </div>

            {/* Resolved tokens grid */}
            <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Resolved tokens
                </div>
                <div
                    className="grid grid-cols-8 gap-1"
                    data-testid="brand-kit-swatch-strip"
                >
                    {ALL_SWATCH_KEYS.map((swatch) => {
                        const colorValue = readVar(vars, swatch.cssVar);
                        return (
                            <Tooltip
                                key={swatch.name}
                                content={
                                    <span className="font-mono text-[10px]">
                                        {swatch.name}: {colorValue}
                                    </span>
                                }
                                side="top"
                            >
                                <div
                                    data-testid={`swatch-${swatch.name}`}
                                    title={`${swatch.name}: ${colorValue}`}
                                    className="aspect-square rounded-md border border-(--card-border)"
                                    style={{ background: colorValue }}
                                />
                            </Tooltip>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Extracted-palette toolbar                                            */
/* ─────────────────────────────────────────────────────────────────── */

interface ExtractedPaletteProps {
    palette: string[];
    onApply: (slot: keyof BrandColors, hex: string) => void;
    onClear: () => void;
}

const APPLY_SLOTS: ReadonlyArray<{ key: keyof BrandColors; label: string }> = [
    { key: "primary", label: "Primary" },
    { key: "secondary", label: "Secondary" },
    { key: "accent", label: "Accent" },
    { key: "surface", label: "Surface" },
    { key: "ink", label: "Ink" },
];

function ExtractedPalette({
    palette,
    onApply,
    onClear,
}: ExtractedPaletteProps): ReactElement {
    return (
        <div
            data-testid="extracted-palette"
            className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3"
        >
            <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                    Logo palette
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    data-testid="extracted-palette-clear"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                    Dismiss
                </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
                {palette.map((hex, idx) => (
                    <div key={`${hex}-${idx}`} className="space-y-1">
                        <div
                            className="aspect-square rounded-lg border-2 border-foreground shadow-[2px_2px_0_0_var(--card-border)]"
                            style={{ background: hex }}
                            data-testid={`extracted-color-${idx}`}
                            title={hex}
                        />
                        <div className="font-mono text-[9px] uppercase text-muted-foreground">
                            {hex}
                        </div>
                        <select
                            data-testid={`extracted-apply-${idx}`}
                            defaultValue=""
                            onChange={(e) => {
                                const slot = e.target.value as keyof BrandColors | "";
                                if (slot) onApply(slot, hex);
                                e.target.value = "";
                            }}
                            className="w-full appearance-none rounded-md border border-(--card-border) bg-background px-1 py-0.5 text-[10px]"
                        >
                            <option value="">Apply to…</option>
                            {APPLY_SLOTS.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* BrandKitEditor                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export function BrandKitEditor(props: BrandKitEditorProps): ReactElement {
    const { value, onChange, tenantId } = props;

    /** Patch helper for a top-level brand-kit branch. */
    const patch = useCallback(
        <K extends ResetKey>(key: K, partial: Partial<BrandKit[K]>): void => {
            onChange({
                ...value,
                [key]: { ...value[key], ...partial },
            });
        },
        [value, onChange],
    );

    const resetBranch = useCallback(
        (key: ResetKey): void => {
            onChange({ ...value, [key]: EMPTY_BRAND_KIT[key] });
        },
        [value, onChange],
    );

    const identity: BrandIdentity = value.identity ?? {};
    const colors: BrandColors = value.colors ?? EMPTY_BRAND_KIT.colors;
    const typography: BrandTypography = value.typography ?? EMPTY_BRAND_KIT.typography;
    const shape: BrandShape = value.shape ?? EMPTY_BRAND_KIT.shape;
    const motion: BrandMotion = value.motion ?? EMPTY_BRAND_KIT.motion;
    const voice: BrandVoice = value.voice ?? EMPTY_BRAND_KIT.voice;

    /* ── Identity helpers ─────────────────────────────────────────── */
    const setName = (v: string): void => patch("identity", { name: v || undefined });
    const setTagline = (v: I18nString): void => patch("identity", { tagline: v });
    const setLogo = (v: string | undefined): void => patch("identity", { logo_url: v });
    const setFavicon = (v: string | undefined): void => patch("identity", { favicon_url: v });
    const setOgImage = (v: string | undefined): void => patch("identity", { og_image_url: v });

    /* ── Colors helpers ───────────────────────────────────────────── */
    const setColor = (k: keyof BrandColors, v: string): void => patch("colors", { [k]: v } as Partial<BrandColors>);
    const setAllColors = (next: BrandColors): void => onChange({ ...value, colors: next });

    /* ── Typography helpers ───────────────────────────────────────── */
    const setDisplay = (v: string): void => patch("typography", { display: v });
    const setBody = (v: string): void => patch("typography", { body: v });
    const setScale = (v: BrandTypography["scale"]): void => patch("typography", { scale: v });

    /* ── Shape helpers ────────────────────────────────────────────── */
    const setRadius = (v: BrandShape["radius"]): void => patch("shape", { radius: v });
    const setBorder = (v: BrandShape["border_thickness"]): void => patch("shape", { border_thickness: v });
    const setShadow = (v: BrandShape["shadow_style"]): void => patch("shape", { shadow_style: v });
    const setRotation = (v: BrandShape["rotation_intensity"]): void =>
        patch("shape", { rotation_intensity: v });

    /* ── Motion helpers ───────────────────────────────────────────── */
    const setMotionEnabled = (b: boolean): void => patch("motion", { enabled: b });
    const setSpeed = (v: BrandMotion["speed"]): void => patch("motion", { speed: v });

    /* ── Voice helpers ────────────────────────────────────────────── */
    const setFormality = (v: BrandVoice["formality"]): void => patch("voice", { formality: v });
    const setVoiceNotes = (v: I18nString): void => patch("voice", { notes: v });

    const colorRows: ReadonlyArray<{ key: keyof BrandColors; label: string }> = [
        { key: "primary", label: "Primary" },
        { key: "secondary", label: "Secondary" },
        { key: "accent", label: "Accent" },
        { key: "surface", label: "Surface" },
        { key: "surface_alt", label: "Surface alt" },
        { key: "ink", label: "Ink" },
        { key: "success", label: "Success" },
        { key: "danger", label: "Danger" },
    ];

    /* ── Palette extraction ───────────────────────────────────────── */
    const [extractedPalette, setExtractedPalette] = useState<string[] | null>(null);
    const [extractionError, setExtractionError] = useState<string | null>(null);
    const [extracting, setExtracting] = useState<boolean>(false);

    const runExtraction = useCallback(async () => {
        if (!identity.logo_url) return;
        setExtracting(true);
        setExtractionError(null);
        try {
            const palette = await extractPaletteFromLogo(identity.logo_url);
            if (palette.length === 0) {
                setExtractionError("Couldn't find dominant colors in this logo.");
            } else {
                setExtractedPalette(palette);
            }
        } catch {
            setExtractionError(
                "Couldn't read logo — make sure it's hosted with CORS enabled.",
            );
        } finally {
            setExtracting(false);
        }
    }, [identity.logo_url]);

    const applyExtracted = (slot: keyof BrandColors, hex: string): void => {
        setColor(slot, hex);
        toast.success(`Applied ${hex} to ${slot.replace("_", " ")}`);
    };

    const randomizePalette = (): void => {
        const next = randomHarmoniousPalette();
        // preserve surface_alt + ink + success + danger if merchant set custom values? Keep simple: full overwrite.
        setAllColors(next);
        toast.success("New palette generated");
    };

    return (
        <div
            data-testid="brand-kit-editor"
            className="grid h-full grid-cols-1 gap-6 overflow-y-auto bg-background p-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"
        >
            {/* Left: form */}
            <div className="space-y-5">
                <header className="space-y-1">
                    <h2 className="text-xl font-bold tracking-tight">Brand Kit</h2>
                    <p className="text-sm text-muted-foreground">
                        Single source of truth for your storefront&apos;s visual identity.
                        Edit any field — the right preview updates instantly.
                    </p>
                </header>

                {/* Identity */}
                <Card
                    title="Identity"
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("identity")}
                    resetTestId="reset-identity"
                >
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Store name</label>
                                <button
                                    type="button"
                                    onClick={() => setName("")}
                                    className="text-[11px] text-muted-foreground hover:text-foreground"
                                    data-testid="reset-identity-name"
                                >
                                    Reset
                                </button>
                            </div>
                            <input
                                type="text"
                                value={identity.name ?? ""}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your store name"
                                data-testid="identity-name-input"
                                className={cn(
                                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                                )}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Used as the storefront wordmark and in the header by default.
                            </p>
                        </div>

                        <I18nStringInput
                            label="Tagline"
                            value={identity.tagline ?? {}}
                            onChange={setTagline}
                            placeholder="A short line that describes your store"
                            helperText="Falls back to English if a locale is empty."
                            testIdPrefix="identity-tagline"
                        />

                        <ImageField
                            label="Logo"
                            value={identity.logo_url}
                            onChange={setLogo}
                            tenantId={tenantId}
                            maxBytes={2 * 1024 * 1024}
                            helperText="PNG or SVG. Max 2MB. Appears in header + on receipts."
                            previewAspect="square"
                            onReset={() => setLogo(undefined)}
                            testIdPrefix="identity-logo"
                        />

                        <ImageField
                            label="Favicon"
                            value={identity.favicon_url}
                            onChange={setFavicon}
                            tenantId={tenantId}
                            maxBytes={512 * 1024}
                            helperText="32×32 PNG or ICO. Max 512KB."
                            previewAspect="favicon"
                            onReset={() => setFavicon(undefined)}
                            testIdPrefix="identity-favicon"
                        />

                        <ImageField
                            label="OG image"
                            value={identity.og_image_url}
                            onChange={setOgImage}
                            tenantId={tenantId}
                            maxBytes={2 * 1024 * 1024}
                            helperText="1200×630 JPG/PNG. Used when your store is shared on social."
                            previewAspect="og"
                            onReset={() => setOgImage(undefined)}
                            testIdPrefix="identity-og"
                        />
                    </div>
                </Card>

                {/* Colors */}
                <Card
                    title="Colors"
                    icon={<Palette className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("colors")}
                    resetTestId="reset-colors"
                >
                    {/* Top toolbar — extract + randomize */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        {identity.logo_url && (
                            <button
                                type="button"
                                onClick={runExtraction}
                                disabled={extracting}
                                data-testid="extract-from-logo-button"
                                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-background px-3 py-1.5 text-[12px] font-semibold shadow-[2px_2px_0_0_var(--card-border)] transition-transform hover:-translate-y-px disabled:opacity-60"
                            >
                                {extracting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Wand2 className="h-3.5 w-3.5" />
                                )}
                                {extracting ? "Reading logo…" : "Extract palette from logo"}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={randomizePalette}
                            data-testid="random-palette-button"
                            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-background px-3 py-1.5 text-[12px] font-semibold shadow-[2px_2px_0_0_var(--card-border)] transition-transform hover:-translate-y-px"
                        >
                            <Shuffle className="h-3.5 w-3.5" />
                            Random palette
                        </button>
                    </div>

                    {extractionError && (
                        <div
                            data-testid="extract-error"
                            className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-700"
                        >
                            {extractionError}
                        </div>
                    )}

                    {extractedPalette && (
                        <div className="mb-4">
                            <ExtractedPalette
                                palette={extractedPalette}
                                onApply={applyExtracted}
                                onClear={() => setExtractedPalette(null)}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        {colorRows.map((row) => (
                            <ColorField
                                key={row.key}
                                label={row.label}
                                keyName={row.key}
                                value={colors[row.key]}
                                onChange={(v) => setColor(row.key, v)}
                            />
                        ))}
                    </div>

                    {/* Contrast scores */}
                    <div className="mt-5 space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Accessibility · contrast
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                            <ContrastBadge
                                label="Primary on surface"
                                fg={colors.primary}
                                bg={colors.surface}
                                testId="contrast-primary-surface"
                            />
                            <ContrastBadge
                                label="Ink on surface"
                                fg={colors.ink}
                                bg={colors.surface}
                                testId="contrast-ink-surface"
                            />
                            <ContrastBadge
                                label="Primary on ink"
                                fg={colors.primary}
                                bg={colors.ink}
                                testId="contrast-primary-ink"
                            />
                        </div>
                    </div>

                    <div className="mt-5 space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Resolved palette · live
                        </div>
                        <DerivedSwatchStrip kit={value} />
                    </div>
                </Card>

                {/* Typography */}
                <Card
                    title="Typography"
                    icon={<TypeIcon className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("typography")}
                    resetTestId="reset-typography"
                >
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Display font</label>
                            <FontCombo
                                value={typography.display}
                                onChange={setDisplay}
                                testId="typography-display-select"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Used for headlines and the wordmark.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Body font</label>
                            <FontCombo
                                value={typography.body}
                                onChange={setBody}
                                testId="typography-body-select"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Used for paragraphs, descriptions, and UI labels.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Scale</label>
                            <Segmented
                                value={typography.scale}
                                onChange={setScale}
                                columns={3}
                                testIdPrefix="typography-scale"
                                options={[
                                    {
                                        value: "compact",
                                        label: "Compact",
                                        sub: "0.875rem",
                                        preview: (
                                            <span style={{ fontSize: "11px" }}>Aa</span>
                                        ),
                                    },
                                    {
                                        value: "comfortable",
                                        label: "Comfortable",
                                        sub: "1rem",
                                        preview: (
                                            <span style={{ fontSize: "14px" }}>Aa</span>
                                        ),
                                    },
                                    {
                                        value: "spacious",
                                        label: "Spacious",
                                        sub: "1.125rem",
                                        preview: (
                                            <span style={{ fontSize: "18px" }}>Aa</span>
                                        ),
                                    },
                                ]}
                            />
                        </div>

                        <div className="rounded-xl border border-(--card-border) bg-muted/20 p-4">
                            <div
                                style={{
                                    fontFamily: `'${typography.display}', system-ui, sans-serif`,
                                }}
                                className="text-2xl font-bold tracking-tight"
                            >
                                Aa — The quick brown fox 1234567890
                            </div>
                            <div
                                style={{
                                    fontFamily: `'${typography.body}', system-ui, sans-serif`,
                                }}
                                className="mt-1 text-sm text-muted-foreground"
                            >
                                The quick brown fox jumps over the lazy dog.
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Shape */}
                <Card
                    title="Shape"
                    icon={<Shapes className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("shape")}
                    resetTestId="reset-shape"
                >
                    <div className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Radius</label>
                            <Segmented
                                value={shape.radius}
                                onChange={setRadius}
                                testIdPrefix="shape-radius"
                                options={[
                                    {
                                        value: "none",
                                        label: "Sharp",
                                        preview: (
                                            <div className="h-5 w-5 border-2 border-foreground" />
                                        ),
                                    },
                                    {
                                        value: "soft",
                                        label: "Soft",
                                        preview: (
                                            <div className="h-5 w-5 rounded-sm border-2 border-foreground" />
                                        ),
                                    },
                                    {
                                        value: "round",
                                        label: "Round",
                                        preview: (
                                            <div className="h-5 w-5 rounded-lg border-2 border-foreground" />
                                        ),
                                    },
                                    {
                                        value: "pill",
                                        label: "Pill",
                                        preview: (
                                            <div className="h-5 w-5 rounded-full border-2 border-foreground" />
                                        ),
                                    },
                                ]}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Border thickness</label>
                            <Segmented
                                value={shape.border_thickness}
                                onChange={setBorder}
                                testIdPrefix="shape-border"
                                options={[
                                    {
                                        value: "none",
                                        label: "None",
                                        preview: <div className="h-1 w-6 bg-muted" />,
                                    },
                                    {
                                        value: "thin",
                                        label: "Thin",
                                        preview: <div className="h-px w-6 bg-foreground" />,
                                    },
                                    {
                                        value: "thick",
                                        label: "Thick",
                                        preview: <div className="h-[2px] w-6 bg-foreground" />,
                                    },
                                    {
                                        value: "chunky",
                                        label: "Chunky",
                                        preview: <div className="h-[3px] w-6 bg-foreground" />,
                                    },
                                ]}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Shadow style</label>
                            <Segmented
                                value={shape.shadow_style}
                                onChange={setShadow}
                                testIdPrefix="shape-shadow"
                                options={[
                                    {
                                        value: "flat",
                                        label: "Flat",
                                        preview: <div className="h-5 w-8 rounded bg-foreground/5 border border-foreground" />,
                                    },
                                    {
                                        value: "soft",
                                        label: "Soft",
                                        preview: <div className="h-5 w-8 rounded bg-background border border-foreground shadow-md" />,
                                    },
                                    {
                                        value: "hard-offset",
                                        label: "Offset",
                                        preview: (
                                            <div className="relative">
                                                <div className="absolute left-[3px] top-[3px] h-5 w-8 rounded bg-foreground" />
                                                <div className="relative h-5 w-8 rounded bg-background border border-foreground" />
                                            </div>
                                        ),
                                    },
                                    {
                                        value: "elevated",
                                        label: "Elevated",
                                        preview: <div className="h-5 w-8 rounded bg-background border border-foreground shadow-lg" />,
                                    },
                                ]}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Rotation intensity</label>
                            <Segmented
                                value={shape.rotation_intensity}
                                onChange={setRotation}
                                testIdPrefix="shape-rotation"
                                options={[
                                    {
                                        value: "none",
                                        label: "None",
                                        preview: (
                                            <div className="h-5 w-9 rounded bg-primary/30 border border-foreground" />
                                        ),
                                    },
                                    {
                                        value: "subtle",
                                        label: "Subtle",
                                        preview: (
                                            <div
                                                className="h-5 w-9 rounded bg-primary/30 border border-foreground"
                                                style={{ transform: "rotate(-3deg)" }}
                                            />
                                        ),
                                    },
                                    {
                                        value: "playful",
                                        label: "Playful",
                                        preview: (
                                            <div
                                                className="h-5 w-9 rounded bg-primary/30 border border-foreground"
                                                style={{ transform: "rotate(-8deg)" }}
                                            />
                                        ),
                                    },
                                    {
                                        value: "wild",
                                        label: "Wild",
                                        preview: (
                                            <div
                                                className="h-5 w-9 rounded bg-primary/30 border border-foreground"
                                                style={{ transform: "rotate(-14deg)" }}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>
                </Card>

                {/* Motion */}
                <Card
                    title="Motion"
                    icon={<Activity className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("motion")}
                    resetTestId="reset-motion"
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background p-3">
                            <div>
                                <div className="text-sm font-medium">Motion enabled</div>
                                <p className="text-[11px] text-muted-foreground">
                                    Adds subtle animations to interactive elements.
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={motion.enabled}
                                onClick={() => setMotionEnabled(!motion.enabled)}
                                data-testid="motion-enabled-toggle"
                                className={cn(
                                    "relative h-6 w-11 rounded-full transition-colors",
                                    motion.enabled ? "bg-primary" : "bg-muted",
                                )}
                            >
                                <span
                                    className={cn(
                                        "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                                        motion.enabled ? "translate-x-5" : "translate-x-0.5",
                                    )}
                                />
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Speed</label>
                            <Segmented
                                value={motion.speed}
                                onChange={setSpeed}
                                disabled={!motion.enabled}
                                columns={3}
                                testIdPrefix="motion-speed"
                                options={[
                                    { value: "slow", label: "Slow", sub: "300ms" },
                                    { value: "normal", label: "Normal", sub: "150ms" },
                                    { value: "snappy", label: "Snappy", sub: "80ms" },
                                ]}
                            />
                        </div>
                    </div>
                </Card>

                {/* Voice */}
                <Card
                    title="Voice & tone"
                    icon={<MessageCircle className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("voice")}
                    resetTestId="reset-voice"
                >
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Formality</label>
                            <Segmented
                                value={voice.formality}
                                onChange={setFormality}
                                testIdPrefix="voice-formality"
                                options={[
                                    { value: "formal", label: "Formal", sub: "Precise, polite" },
                                    { value: "casual", label: "Casual", sub: "Friendly, easy" },
                                    { value: "playful", label: "Playful", sub: "Fun, cheeky" },
                                    { value: "luxe", label: "Luxe", sub: "Elevated, refined" },
                                ]}
                            />
                        </div>

                        <I18nStringInput
                            label="Notes"
                            value={voice.notes ?? {}}
                            onChange={setVoiceNotes}
                            placeholder="Anything else worth knowing about how you want to speak…"
                            multiline
                            helperText="Used as guidance for content writers and templates."
                            testIdPrefix="voice-notes"
                        />
                    </div>
                </Card>
            </div>

            {/* Right: live preview */}
            <LivePreview value={value} />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Derived swatch strip — exported sub-component                        */
/* ─────────────────────────────────────────────────────────────────── */

function DerivedSwatchStrip({ kit }: { kit: BrandKit }): ReactElement {
    const vars = useMemo(
        () => buildBrandKitVars(kit) as unknown as Record<string, string>,
        [kit],
    );
    return (
        <div className="grid grid-cols-8 gap-1" data-testid="brand-kit-derived-strip">
            {ALL_SWATCH_KEYS.map((s) => {
                const val = readVar(vars, s.cssVar);
                return (
                    <Tooltip
                        key={s.name}
                        content={
                            <span className="font-mono text-[10px]">
                                {s.name}: {val}
                            </span>
                        }
                        side="top"
                    >
                        <div
                            data-testid={`derived-swatch-${s.name}`}
                            title={`${s.name}: ${val}`}
                            className="aspect-square rounded-md border border-(--card-border)"
                            style={{ background: val }}
                        />
                    </Tooltip>
                );
            })}
        </div>
    );
}
