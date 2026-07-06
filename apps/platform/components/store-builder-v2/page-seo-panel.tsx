"use client";

// =====================================================================
// PageSeoPanel — per-page SEO / meta editor (E1)
// =====================================================================
// Edits the active page's PageMeta (title, description, OG image,
// noindex). PageMeta already existed on every PageConfig and is rendered
// by the storefront (resolveV2PageMetadata) — it was just unreachable in
// the editor. Bilingual title/description reuse I18nStringInput; a live
// Google-style SERP preview shows how the page will look in search.
// =====================================================================

import { useMemo } from "react";
import { Search } from "lucide-react";
import { resolveI18n } from "@scheniders/shared";
import type {
    I18nString,
    LocaleCode,
    PageId,
    PageMeta,
} from "@scheniders/shared";
import { Switch } from "@scheniders/ui";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { I18nStringInput } from "./i18n-string-input";

const EMPTY_I18N: I18nString = {};

export interface PageSeoPanelProps {
    pageId: PageId;
    pageLabel: string;
    /** The active page's current meta (may be undefined for a fresh page). */
    meta: PageMeta | undefined;
    onChange: (next: PageMeta) => void;
    activeLocale?: LocaleCode;
    /** Storefront origin — used for the SERP preview host + crumb. */
    storefrontUrl?: string;
    /** Falls back as the title when no meta title is set. */
    businessName?: string;
}

export function PageSeoPanel({
    pageId,
    pageLabel,
    meta,
    onChange,
    activeLocale = "en",
    storefrontUrl,
    businessName,
}: PageSeoPanelProps) {
    const locale = useResolvedEditorLocale(activeLocale);
    const current: PageMeta = meta ?? {};
    const patch = (p: Partial<PageMeta>): void => onChange({ ...current, ...p });

    const title = current.title ?? EMPTY_I18N;
    const description = current.description ?? EMPTY_I18N;

    const resolvedTitle =
        resolveI18n(title, activeLocale).trim() ||
        businessName ||
        pageLabel;
    const resolvedDesc = resolveI18n(description, activeLocale).trim();

    const host = useMemo(() => {
        try {
            return new URL(storefrontUrl ?? "").host || "yourstore.com";
        } catch {
            return "yourstore.com";
        }
    }, [storefrontUrl]);

    return (
        <div
            data-testid="inspector-seo-panel"
            className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
        >
            <header className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100">
                    <Search className="h-4 w-4 text-sky-700" aria-hidden="true" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">
                        {tFormat(STRINGS.seo.heading, locale, { page: pageLabel })}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {t(STRINGS.seo.subtitle, locale)}
                    </p>
                </div>
            </header>

            {/* Google-style SERP preview */}
            <div
                data-testid="seo-serp-preview"
                className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3.5"
            >
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t(STRINGS.seo.serp_preview, locale)}
                </p>
                <p className="truncate text-xs text-emerald-700">
                    {host} › {pageId}
                </p>
                <p className="truncate text-[15px] leading-snug text-[#1a0dab]">
                    {resolvedTitle}
                </p>
                <p className="line-clamp-2 text-xs text-[#4d5156]">
                    {resolvedDesc || t(STRINGS.seo.description_fallback, locale)}
                </p>
            </div>

            <I18nStringInput
                label={t(STRINGS.seo.title_label, locale)}
                value={title}
                onChange={(v) => patch({ title: v })}
                placeholder={businessName ?? pageLabel}
                activeLocale={activeLocale}
                testIdPrefix="seo-title"
                helperText={t(STRINGS.seo.title_help, locale)}
            />

            <I18nStringInput
                label={t(STRINGS.seo.description_label, locale)}
                value={description}
                onChange={(v) => patch({ description: v })}
                multiline
                activeLocale={activeLocale}
                testIdPrefix="seo-description"
                helperText={t(STRINGS.seo.description_help, locale)}
            />

            {/* Social share (OG) image */}
            <div className="flex flex-col gap-2">
                <label
                    htmlFor="seo-og-image"
                    className="text-xs font-semibold text-foreground"
                >
                    {t(STRINGS.seo.og_label, locale)}
                </label>
                <input
                    id="seo-og-image"
                    type="url"
                    inputMode="url"
                    dir="ltr"
                    data-testid="seo-og-image-input"
                    value={current.og_image_url ?? ""}
                    onChange={(e) =>
                        patch({ og_image_url: e.target.value || undefined })
                    }
                    placeholder="https://…/share.jpg"
                    className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {current.og_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={current.og_image_url}
                        alt=""
                        data-testid="seo-og-image-preview"
                        className="aspect-[1200/630] w-full rounded-lg border border-(--card-border) object-cover"
                    />
                ) : null}
                <p className="text-xs text-muted-foreground">
                    {t(STRINGS.seo.og_help, locale)}
                </p>
            </div>

            {/* noindex */}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--background-soft) px-3.5 py-3">
                <div>
                    <span className="text-xs font-semibold text-foreground">
                        {t(STRINGS.seo.noindex_label, locale)}
                    </span>
                    <p className="text-xs text-muted-foreground">
                        {t(STRINGS.seo.noindex_help_prefix, locale)}{" "}
                        <code>noindex</code>{" "}
                        {t(STRINGS.seo.noindex_help_suffix, locale)}
                    </p>
                </div>
                <Switch
                    data-testid="seo-noindex-toggle"
                    checked={!!current.noindex}
                    onCheckedChange={(v) => patch({ noindex: v })}
                    aria-label={t(STRINGS.seo.noindex_aria, locale)}
                />
            </label>
        </div>
    );
}
