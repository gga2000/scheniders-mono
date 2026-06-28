"use client";

// =====================================================================
// PixelsScreen — marketing pixels + Conversions API (pixels R3)
// =====================================================================
// Edits config.globals.analytics_pixels.base (AnalyticsConfig). Pixel IDs are
// public (rendered in the storefront <head>); CAPI tokens are server-only
// secrets — they're redacted from the config before it reaches the browser
// (redactServerOnlyConfig in the storefront tenant loader) and read only by
// the checkout server action for the Conversions API.
// =====================================================================

import { useCallback } from "react";
import { X, BarChart3 } from "lucide-react";
import type { AnalyticsConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface PixelsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

function newId(): string {
    const c = globalThis.crypto;
    return c && typeof c.randomUUID === "function"
        ? c.randomUUID()
        : `px_${Math.random().toString(36).slice(2, 12)}`;
}

const inputCls =
    "w-full rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

type Field = { key: keyof AnalyticsConfig; label: string; secret?: boolean; placeholder?: string };

const ID_FIELDS: Field[] = [
    { key: "meta_pixel_id", label: "Meta Pixel ID", placeholder: "15–16 digit ID" },
    { key: "tiktok_pixel_id", label: "TikTok Pixel ID" },
    { key: "google_analytics_id", label: "Google Analytics ID", placeholder: "G-XXXXXXX" },
    { key: "snapchat_pixel_id", label: "Snapchat Pixel ID" },
    { key: "gtm_container_id", label: "Google Tag Manager ID", placeholder: "GTM-XXXXX" },
];

const CAPI_FIELDS: Field[] = [
    { key: "meta_capi_token", label: "Meta CAPI token", secret: true },
    { key: "tiktok_capi_token", label: "TikTok Events API token", secret: true },
    { key: "capi_test_event_code", label: "Meta test event code", placeholder: "TESTxxxx" },
];

export function PixelsScreen({
    builder,
    onClose,
}: PixelsScreenProps): React.ReactElement {
    const base = (builder.config.globals?.analytics_pixels?.base ??
        {}) as AnalyticsConfig;

    const update = useCallback(
        (patch: Partial<AnalyticsConfig>): void => {
            builder.setConfig((prev) => {
                const existing = prev.globals?.analytics_pixels;
                const nextBase = { ...(existing?.base ?? {}), ...patch };
                return {
                    ...prev,
                    globals: {
                        ...prev.globals,
                        analytics_pixels: existing
                            ? { ...existing, base: nextBase }
                            : {
                                  id: newId(),
                                  type: "analytics_pixels",
                                  enabled: true,
                                  base: nextBase,
                              },
                    },
                };
            }, "Edited pixels");
        },
        [builder],
    );

    const renderField = (f: Field) => (
        <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {f.label}
            </span>
            <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                dir="ltr"
                data-testid={`pixel-${f.key}`}
                value={(base[f.key] as string) ?? ""}
                placeholder={f.placeholder}
                onChange={(e) =>
                    update({ [f.key]: e.target.value || undefined } as Partial<AnalyticsConfig>)
                }
                className={inputCls}
            />
        </label>
    );

    return (
        <div
            data-testid="pixels-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label="Close pixels"
                    data-testid="pixels-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <BarChart3 className="h-4 w-4 text-sky-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">
                    Pixels &amp; tracking
                </h2>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
                <section className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pixels
                    </p>
                    {ID_FIELDS.map(renderField)}
                    <p className="text-xs text-muted-foreground">
                        IDs load on the storefront and fire PageView, ViewContent,
                        AddToCart, InitiateCheckout, and Purchase automatically.
                    </p>
                </section>

                <section className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Conversions API (server-side)
                    </p>
                    {CAPI_FIELDS.map(renderField)}
                    <p className="text-xs text-muted-foreground">
                        Tokens send a deduplicated server-side Purchase for accurate
                        tracking despite iOS / ad-blockers. Kept private — never sent to
                        the browser.
                    </p>
                </section>
            </div>
        </div>
    );
}
