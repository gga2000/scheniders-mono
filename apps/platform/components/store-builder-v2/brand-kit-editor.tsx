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
    useMemo,
    useState,
    type ReactElement,
} from "react";
import {
    Image as ImageIcon,
    Loader2,
    Palette,
    Type as TypeIcon,
    Shapes,
    Activity,
    MessageCircle,
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
import { toast } from "@/hooks/use-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { I18nStringInput } from "./i18n-string-input";
import { BRAND_THEMES, type BrandTheme } from "@/lib/brand-themes";
import { STRINGS, t as tChrome, tFormat as tChromeFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { useEditorMode } from "@/lib/editor-mode-context";
import {
    extractPaletteFromLogo,
    isValidHex,
    randomHarmoniousPalette,
} from "./brand-kit/color-utils";
import {
    ARABIC_GOOGLE_FONTS,
    Card,
    ColorField,
    ContrastBadge,
    FontCombo,
    ImageField,
    Segmented,
} from "./brand-kit/controls";
import {
    ALL_SWATCH_KEYS,
    ExtractedPalette,
    LivePreview,
    readVar,
} from "./brand-kit/live-preview";

// Compat re-exports — pre-split callers import these from here.
export { ARABIC_GOOGLE_FONTS } from "./brand-kit/controls";
export { GOOGLE_FONTS } from "./brand-kit/color-utils";

/* ─────────────────────────────────────────────────────────────────── */
/* Fonts catalogue                                                      */
/* ─────────────────────────────────────────────────────────────────── */



/* ─────────────────────────────────────────────────────────────────── */
/* Candy defaults — per-slot reset                                      */
/* ─────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────── */
/* Color helpers (pure)                                                 */
/* ─────────────────────────────────────────────────────────────────── */

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
/* BrandKitEditor                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export function BrandKitEditor(props: BrandKitEditorProps): ReactElement {
    const { value, onChange, tenantId } = props;
    const chromeLocale = useResolvedEditorLocale();
    const { mode: editorMode } = useEditorMode();

    /** Apply a curated theme: colors + typography + shape in one undoable change. */
    const applyTheme = useCallback(
        (theme: BrandTheme): void => {
            onChange({
                ...value,
                colors: { ...theme.colors },
                typography: { ...value.typography, ...theme.typography },
                shape: { ...theme.shape },
            });
        },
        [value, onChange],
    );

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
    const setColor = (k: keyof BrandColors, v: string): void => {
        // Guard the data sink: never persist a malformed hex. Otherwise an
        // invalid value round-trips to Supabase and then renders as the candy
        // default on reload (silent colour loss). Inputs already normalize on
        // their own, but this keeps the invariant true for every caller.
        const hex = v.trim().toLowerCase();
        if (!isValidHex(hex)) return;
        patch("colors", { [k]: hex } as Partial<BrandColors>);
    };
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

                {/* Ready-made looks ([D1]) — the non-designer's entry point.
                    Rendered above the raw pickers so "pick a look" comes
                    before "compose 8 hex values". */}
                <Card
                    title={tChrome(STRINGS.brand_kit.themes_title, chromeLocale)}
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                >
                    <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                        {tChrome(STRINGS.brand_kit.themes_hint, chromeLocale)}
                    </p>
                    <div
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                        data-testid="brand-theme-gallery"
                    >
                        {BRAND_THEMES.map((theme) => {
                            const isApplied =
                                colors.primary === theme.colors.primary &&
                                colors.surface === theme.colors.surface &&
                                typography.display === theme.typography.display;
                            const themeName = tChrome(theme.name, chromeLocale);
                            return (
                                <button
                                    key={theme.id}
                                    type="button"
                                    data-testid={`brand-theme-${theme.id}`}
                                    aria-label={tChromeFormat(
                                        STRINGS.brand_kit.theme_apply_aria,
                                        chromeLocale,
                                        { name: themeName },
                                    )}
                                    aria-pressed={isApplied}
                                    onClick={() => applyTheme(theme)}
                                    className={cn(
                                        "group flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-all",
                                        isApplied
                                            ? "border-foreground shadow-[2px_2px_0_0_var(--card-border)]"
                                            : "border-(--card-border) hover:-translate-y-px hover:border-(--border-hover) hover:shadow-(--card-shadow)",
                                    )}
                                >
                                    {/* Mini palette strip */}
                                    <div
                                        className="flex h-8 w-full overflow-hidden rounded-lg border border-black/10"
                                        style={{ backgroundColor: theme.colors.surface }}
                                        aria-hidden="true"
                                    >
                                        <span className="h-full w-1/3" style={{ backgroundColor: theme.colors.primary }} />
                                        <span className="h-full w-1/4" style={{ backgroundColor: theme.colors.secondary }} />
                                        <span className="h-full w-1/5" style={{ backgroundColor: theme.colors.accent }} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                            <span
                                                className="truncate text-[12px] font-bold text-foreground"
                                                style={{ fontFamily: `'${theme.typography.display}', system-ui, sans-serif` }}
                                            >
                                                {themeName}
                                            </span>
                                            {isApplied && (
                                                <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                                                    {tChrome(STRINGS.brand_kit.theme_applied, chromeLocale)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="block truncate text-[10px] text-muted-foreground">
                                            {tChrome(theme.hint, chromeLocale)}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                {/* Colors */}
                <Card
                    title="Colors"
                    icon={<Palette className="h-3.5 w-3.5" />}
                    onReset={() => resetBranch("colors")}
                    resetTestId="reset-colors"
                >
                    {/* Top toolbar — extract + randomize (randomize is an
                        Advanced affordance: one mis-click nukes a palette). */}
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
                        {editorMode === "advanced" && (
                            <button
                                type="button"
                                onClick={randomizePalette}
                                data-testid="random-palette-button"
                                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-background px-3 py-1.5 text-[12px] font-semibold shadow-[2px_2px_0_0_var(--card-border)] transition-transform hover:-translate-y-px"
                            >
                                <Shuffle className="h-3.5 w-3.5" />
                                Random palette
                            </button>
                        )}
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

                        {/* Arabic pairing ([D3]) — the store's primary script */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">
                                الخط العربي — العناوين
                            </label>
                            <FontCombo
                                value={typography.display_ar ?? ""}
                                onChange={(v) =>
                                    patch("typography", { display_ar: v || undefined })
                                }
                                testId="typography-display-ar-select"
                                fonts={ARABIC_GOOGLE_FONTS}
                                allowEmpty
                                emptyLabel="تلقائي (خط النظام)"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                يُستخدم للعناوين بالعربية والكردية — الخطوط اللاتينية لا
                                تحتوي على أحرف عربية.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">
                                الخط العربي — النصوص
                            </label>
                            <FontCombo
                                value={typography.body_ar ?? ""}
                                onChange={(v) =>
                                    patch("typography", { body_ar: v || undefined })
                                }
                                testId="typography-body-ar-select"
                                fonts={ARABIC_GOOGLE_FONTS}
                                allowEmpty
                                emptyLabel="تلقائي (خط النظام)"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                يُستخدم للفقرات والأوصاف بالعربية والكردية.
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
                            className="h-5 w-5 rounded-md border border-(--card-border)"
                            style={{ background: val }}
                        />
                    </Tooltip>
                );
            })}
        </div>
    );
}
