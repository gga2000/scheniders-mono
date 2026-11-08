"use client";

// =====================================================================
// PixelsScreen — marketing pixels + Conversions API (pixels R3)
// =====================================================================
// Edits config.globals.analytics_pixels.base (AnalyticsConfig). Pixel IDs are
// public (rendered in the storefront <head>). The Conversions API send keys
// are not part of the design at all: they live in a server-only lockbox and
// the editor only sees "saved" and the last four characters (use-capi-keys).
// =====================================================================

import { useCallback } from "react";

import type { AnalyticsConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { CapiKeyField } from "./capi-key-field";
import { ScreenHeader } from "./screen-header";
import { useCapiKeys, type CapiNetwork } from "./use-capi-keys";

export interface PixelsScreenProps {
    builder: UseStoreBuilderV2Return;
    tenantId: string;
    onClose: () => void;
}

function newId(): string {
    const c = globalThis.crypto;
    return c && typeof c.randomUUID === "function"
        ? c.randomUUID()
        : `px_${Math.random().toString(36).slice(2, 12)}`;
}

const inputCls =
    "text-foreground placeholder:text-muted-foreground w-full rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

type Field = {
    key: keyof AnalyticsConfig;
    label: EditorString;
    placeholder?: string | EditorString;
};

const ID_FIELDS: Field[] = [
    { key: "meta_pixel_id", label: STRINGS.pixels.meta_pixel, placeholder: STRINGS.pixels.meta_placeholder },
    {
        key: "tiktok_pixel_id",
        label: STRINGS.pixels.tiktok_pixel,
        placeholder: STRINGS.pixels.tiktok_placeholder,
    },
    { key: "google_analytics_id", label: STRINGS.pixels.ga_id, placeholder: "G-XXXXXXX" },
    { key: "snapchat_pixel_id", label: STRINGS.pixels.snap_pixel },
    { key: "gtm_container_id", label: STRINGS.pixels.gtm_id, placeholder: "GTM-XXXXX" },
];

const CAPI_KEYS: { network: CapiNetwork; label: EditorString }[] = [
    { network: "meta", label: STRINGS.pixels.meta_capi },
    { network: "tiktok", label: STRINGS.pixels.tiktok_capi },
];

const TEST_CODE_FIELD: Field = {
    key: "capi_test_event_code",
    label: STRINGS.pixels.meta_test_code,
    placeholder: "TESTxxxx",
};

export function PixelsScreen({
    builder,
    tenantId,
    onClose,
}: PixelsScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const keys = useCapiKeys(tenantId);
    const keysData = keys.status.data;
    const P = STRINGS.pixels;
    const tr = (v: string | EditorString | undefined): string | undefined =>
        v === undefined || typeof v === "string" ? v : t(v, locale);
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
            }, tFormat(STRINGS.history.edit_named, locale, { name: t(P.heading, locale) }));
        },
        [builder, locale, P],
    );

    const renderField = (f: Field) => (
        <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground text-left!">
                {tr(f.label)}
            </span>
            <input
                type="text"
                autoComplete="off"
                dir="ltr"
                data-testid={`pixel-${f.key}`}
                value={(base[f.key] as string) ?? ""}
                placeholder={tr(f.placeholder)}
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
            <ScreenHeader
                setting="pixels"
                onBack={onClose}
                backTestId="pixels-close"
            />

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
                <section className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-left!">
                        {t(P.pixels_group, locale)}
                    </p>
                    {ID_FIELDS.map(renderField)}
                    <p className="text-xs text-muted-foreground text-left!">
                        {t(P.pixels_help, locale)} {t(P.publish_note, locale)}
                    </p>
                </section>

                <section className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-left!">
                        {t(P.capi_group, locale)}
                    </p>
                    {keys.status.isPending ? (
                        <p data-testid="capi-keys-loading" className="text-xs text-muted-foreground">
                            {t(P.key_loading, locale)}
                        </p>
                    ) : keys.status.isError || !keysData ? (
                        <p role="alert" className="flex items-center gap-2 text-xs text-red-600">
                            {t(P.key_load_error, locale)}
                            <button
                                type="button"
                                onClick={() => void keys.status.refetch()}
                                className="font-semibold underline underline-offset-2"
                            >
                                {t(P.key_retry, locale)}
                            </button>
                        </p>
                    ) : (
                        CAPI_KEYS.map(({ network, label }) => (
                            <CapiKeyField
                                key={network}
                                network={network}
                                label={label}
                                status={keysData[network]}
                                pending={keys.save.isPending}
                                onSave={async (token) => {
                                    await keys.save.mutateAsync({ network, token });
                                }}
                            />
                        ))
                    )}
                    <p className="text-xs text-muted-foreground text-left!">
                        {t(P.capi_help, locale)} {t(P.key_locked_help, locale)}
                    </p>
                    {/* The test code is part of the design, unlike the keys above. */}
                    {renderField(TEST_CODE_FIELD)}
                    <p data-testid="pixels-test-code-note" className="-mt-2 text-xs text-muted-foreground text-left!">
                        {t(P.publish_note, locale)}
                    </p>
                </section>
            </div>
        </div>
    );
}
