"use client";

import { useState } from "react";
import Link from "next/link";
import { Monitor, Smartphone, Globe, Rocket, Pencil } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { ClaimHandleDialog } from "./claim-handle-dialog";

interface PreviewCardProps {
    storefrontUrl: string;
    /**
     * Only published stores have a public storefront to embed. For an
     * unpublished/draft store the public URL renders an empty or 404 page,
     * so we show an onboarding placeholder instead of a broken iframe.
     */
    published: boolean;
    /**
     * A truly fresh store (nothing built) → the placeholder CTA opens the
     * onboarding wizard. A built-but-unpublished store → it opens the editor.
     */
    isBrandNew?: boolean;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
    /** Current tenant slug — enables the handle-claim affordance (UX2-13). */
    slug?: string;
}

type ViewMode = "desktop" | "mobile";

export function PreviewCard({
    storefrontUrl,
    published,
    isBrandNew = false,
    locale,
    slug,
}: PreviewCardProps) {
    const [mode, setMode] = useState<ViewMode>("desktop");
    // Which URL has finished loading — a new handle/domain shows the spinner again.
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
    const loaded = loadedUrl === storefrontUrl;
    const [claimOpen, setClaimOpen] = useState(false);

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5 text-blue-700" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                        {t(STRINGS.command_center.live_preview, locale)}
                    </span>
                </div>
                {published && (
                    <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-0.5">
                        <button
                            type="button"
                            aria-pressed={mode === "desktop"}
                            onClick={() => setMode("desktop")}
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                mode === "desktop"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Monitor className="w-3 h-3" />
                            {t(STRINGS.command_center.preview_desktop, locale)}
                        </button>
                        <button
                            type="button"
                            aria-pressed={mode === "mobile"}
                            onClick={() => setMode("mobile")}
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                mode === "mobile"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Smartphone className="w-3 h-3" />
                            {t(STRINGS.command_center.preview_mobile, locale)}
                        </button>
                    </div>
                )}
            </div>

            {!published ? (
                /* Unpublished store — no public storefront to embed yet. */
                <div
                    className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center"
                    style={{ minHeight: 480 }}
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
                        <Rocket className="h-6 w-6 text-violet-700" />
                    </div>
                    <div className="space-y-1.5 max-w-sm">
                        <p className="text-base font-semibold text-foreground">
                            {t(STRINGS.command_center.preview_unpublished_title, locale)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {isBrandNew
                                ? t(STRINGS.command_center.preview_unpublished_body_new, locale)
                                : t(STRINGS.command_center.preview_unpublished_body_built, locale)}
                        </p>
                    </div>
                    <Link
                        href={isBrandNew ? "/store/onboarding" : "/store/edit"}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        {isBrandNew
                            ? t(STRINGS.command_center.preview_set_up_your_store, locale)
                            : t(STRINGS.command_center.preview_open_editor, locale)}
                    </Link>
                </div>
            ) : (
                <>
                    {/* Faux browser chrome */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
                        <div className="flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        </div>
                        <div className="flex-1 bg-background border border-border rounded-md px-3 py-1 text-xs text-muted-foreground font-mono truncate">
                            {storefrontUrl}
                        </div>
                        {slug && (
                            <button
                                type="button"
                                data-testid="claim-handle-open"
                                onClick={() => setClaimOpen(true)}
                                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                            >
                                <Pencil className="h-3 w-3" aria-hidden="true" />
                                {t(STRINGS.command_center.handle_edit, locale)}
                            </button>
                        )}
                    </div>

                    {/* iframe container */}
                    <div className="flex justify-center bg-muted/10 p-4" style={{ minHeight: 480 }}>
                        <div
                            className={cn(
                                "relative rounded-xl overflow-hidden border border-border shadow-md transition-all duration-300 bg-white",
                                mode === "desktop" ? "w-full" : "w-[390px]"
                            )}
                            style={{ height: 480 }}
                        >
                            {!loaded && (
                                <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        <span className="text-xs">
                                            {t(STRINGS.command_center.preview_loading, locale)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {/* The embedded page is the merchant's own storefront, which
                             * is cross-origin to the platform (separate subdomain in
                             * prod, :3001 in dev). `allow-same-origin` therefore grants
                             * the frame access to its OWN origin — needed for the
                             * storefront's client session/cart — and cannot reach the
                             * platform DOM. `allow-scripts` is required for hydration. */}
                            <iframe
                                key={storefrontUrl}
                                src={storefrontUrl}
                                loading="lazy"
                                className="w-full h-full"
                                onLoad={() => setLoadedUrl(storefrontUrl)}
                                title={t(STRINGS.command_center.preview_iframe_title, locale)}
                                sandbox="allow-scripts allow-same-origin allow-forms"
                            />
                        </div>
                    </div>
                </>
            )}

            {claimOpen && slug && (
                <ClaimHandleDialog
                    currentSlug={slug}
                    onClose={() => setClaimOpen(false)}
                    locale={locale}
                />
            )}
        </div>
    );
}
