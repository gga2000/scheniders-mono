"use client";

// =====================================================================
// Brand-kit live preview + derived-swatch strip (extracted, 4.2)
// =====================================================================

import { useMemo, type CSSProperties, type ReactElement } from "react";
import type { BrandColors, BrandKit } from "@scheniders/shared";
import { Tooltip } from "@/components/ui/tooltip";
import { buildBrandKitVars } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Derived-swatch strip                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export const ALL_SWATCH_KEYS: ReadonlyArray<{ name: string; cssVar: string }> = [
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

export function readVar(vars: Record<string, string>, name: string): string {
    return vars[name] ?? "";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Live preview pane                                                    */
/* ─────────────────────────────────────────────────────────────────── */

export function LivePreview({ value }: { value: BrandKit }): ReactElement {
    const locale = useResolvedEditorLocale();
    const vars = useMemo(
        () => buildBrandKitVars(value) as unknown as Record<string, string>,
        [value],
    );

    const previewStyle = vars as unknown as CSSProperties;

    const storeName =
        value.identity?.name?.trim() ||
        t(STRINGS.brand_kit_preview.store_fallback, locale);

    return (
        <aside
            data-testid="brand-kit-preview"
            className="sticky top-4 flex flex-col gap-4 rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-sm"
        >
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold tracking-tight">
                    {t(STRINGS.brand_kit_preview.heading, locale)}
                </h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t(STRINGS.brand_kit_preview.realtime, locale)}
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
                        {t(STRINGS.brand_kit_preview.wordmark_caption, locale)}
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
                            {t(STRINGS.brand_kit_preview.cta_label, locale)}
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            {t(STRINGS.brand_kit_preview.cta_sample, locale)}
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
                            {t(STRINGS.brand_kit_preview.surface_label, locale)}
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            {t(STRINGS.brand_kit_preview.surface_sample, locale)}
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
                            {t(STRINGS.brand_kit_preview.ink_label, locale)}
                        </div>
                        <div
                            className="mt-0.5 text-sm font-semibold"
                            style={{ fontFamily: "var(--bk-font-display)" }}
                        >
                            {t(STRINGS.brand_kit_preview.ink_sample, locale)}
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
                        {t(STRINGS.brand_kit_preview.sale_sample, locale)}
                    </div>
                </div>
            </div>

            {/* Resolved tokens grid */}
            <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(STRINGS.brand_kit_preview.tokens_heading, locale)}
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
                                {/* Fixed size — the Tooltip trigger is an inline
                                    wrapper, so aspect-square alone collapses to
                                    0×0 inside the grid cell. */}
                                <div
                                    data-testid={`swatch-${swatch.name}`}
                                    title={`${swatch.name}: ${colorValue}`}
                                    className="h-5 w-5 rounded-md border border-(--card-border)"
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

export function ExtractedPalette({
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

