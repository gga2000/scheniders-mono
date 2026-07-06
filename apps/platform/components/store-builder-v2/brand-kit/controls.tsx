"use client";

// =====================================================================
// Brand-kit form controls (extracted from brand-kit-editor, 4.2)
// =====================================================================
// The reusable building blocks of the brand-kit screen: Card, Segmented,
// ImageField (upload), HslSlider, ColorPopover, ColorField,
// ContrastBadge and FontCombo. A future rail-embedded mini style panel
// composes these without dragging in the full-page editor.
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import type { BrandColors } from "@scheniders/shared";
import {
    Image as ImageIcon,
    Upload,
    X,
    Loader2,
    Pipette,
    RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { STRINGS, t as tChrome } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import {
    CANDY_DEFAULTS,
    GOOGLE_FONTS,
    contrastRatio,
    gradeContrast,
    hexToHsl,
    hslToHex,
    isValidHex,
    suggestedTones,
} from "./color-utils";

/* ─────────────────────────────────────────────────────────────────── */
/* Card primitive                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export interface CardProps {
    title: string;
    icon: ReactNode;
    /** Optional — cards without a resettable branch (theme gallery) omit it. */
    onReset?: () => void;
    resetTestId?: string;
    children: ReactNode;
}

export function Card({ title, icon, onReset, resetTestId, children }: CardProps): ReactElement {
    const chromeLocale = useResolvedEditorLocale();
    return (
        <section className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-sm">
            <header className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {icon}
                    </span>
                    <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                </div>
                {onReset && (
                    <button
                        type="button"
                        onClick={onReset}
                        data-testid={resetTestId}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <RotateCcw className="h-3 w-3" />
                        {tChrome(STRINGS.brand_kit.reset, chromeLocale)}
                    </button>
                )}
            </header>
            <div>{children}</div>
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Segmented control                                                    */
/* ─────────────────────────────────────────────────────────────────── */

export interface SegmentedOption<V extends string> {
    value: V;
    label: string;
    sub?: string;
    preview?: ReactNode;
}

export interface SegmentedProps<V extends string> {
    value: V;
    onChange: (v: V) => void;
    options: ReadonlyArray<SegmentedOption<V>>;
    disabled?: boolean;
    testIdPrefix?: string;
    columns?: 2 | 3 | 4;
}

export function Segmented<V extends string>({
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

export interface ImageFieldProps {
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

export function ImageField({
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
    const chromeLocale = useResolvedEditorLocale();
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
                    {tChrome(STRINGS.brand_kit.reset, chromeLocale)}
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
                        {uploading
                            ? tChrome(STRINGS.auto_form.uploading, chromeLocale)
                            : tChrome(STRINGS.auto_form.upload_image, chromeLocale)}
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

export function HslSlider({
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

export function ColorPopover({
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

export function ColorField({ label, keyName, value, onChange }: ColorFieldProps): ReactElement {
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

export function ContrastBadge({ label, fg, bg, testId }: ContrastBadgeProps): ReactElement {
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
    /** Font list; defaults to the Latin catalogue. */
    fonts?: readonly string[];
    /** Adds an empty "auto" first option (Arabic pairing is optional). */
    allowEmpty?: boolean;
    emptyLabel?: string;
}

export function FontCombo({
    value,
    onChange,
    testId,
    fonts = GOOGLE_FONTS,
    allowEmpty = false,
    emptyLabel = "—",
}: FontComboProps): ReactElement {
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
                style={{ fontFamily: value ? `'${value}', system-ui, sans-serif` : undefined }}
            >
                {allowEmpty && <option value="">{emptyLabel}</option>}
                {fonts.map((f) => (
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

/**
 * Arabic-capable Google Fonts ([D3]). Latin display faces (Anton,
 * Fraunces…) have no Arabic glyphs — these do, and they're the popular
 * choices for Arabic storefront typography.
 */
export const ARABIC_GOOGLE_FONTS: readonly string[] = [
    "Cairo",
    "Tajawal",
    "Almarai",
    "IBM Plex Sans Arabic",
    "Noto Kufi Arabic",
    "Noto Naskh Arabic",
    "Noto Sans Arabic",
    "Changa",
    "El Messiri",
    "Amiri",
    "Rubik",
];

