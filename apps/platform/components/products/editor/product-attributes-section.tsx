"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tags, X } from "lucide-react";
import type { ProductAttributeDef } from "@scheniders/shared";
import { useAttributeDefsQuery } from "@/hooks/use-product-attributes-query";
import {
    useProductAttributeValuesQuery,
    useSetProductAttributeValue,
    useClearProductAttributeValue,
} from "@/hooks/use-product-attribute-values";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/** Pick the merchant's own label, falling back across languages. */
function label(i18n: Record<string, string> | undefined, lang: string, fallback = ""): string {
    if (!i18n) return fallback;
    return (lang === "ar" ? i18n.ar ?? i18n.en : i18n.en ?? i18n.ar) ?? fallback;
}

const inputCls =
    "w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20";

/**
 * Values for ONE attribute. Each kind gets the control that suits it, and
 * every control writes through the same save/clear pair — an empty control
 * deletes the row rather than storing a blank, so "no value" and "the empty
 * string" cannot drift apart.
 */
function AttributeField({
    def,
    value,
    onDraft,
    onSave,
    onClear,
}: {
    def: ProductAttributeDef;
    value: unknown;
    /** Local-only update, for controls that change continuously. */
    onDraft: (v: unknown) => void;
    onSave: (v: unknown) => void;
    onClear: () => void;
}) {
    const { t, language } = useLanguage();
    const name = label(def.name_i18n, language, def.key);

    switch (def.kind) {
        case "enum": {
            const current = typeof value === "string" ? value : null;
            return (
                <Field name={name} onClear={current ? onClear : undefined}>
                    <div className="flex flex-wrap gap-2">
                        {def.options.map((o) => (
                            <button
                                key={o.value}
                                type="button"
                                aria-pressed={current === o.value}
                                onClick={() => (current === o.value ? onClear() : onSave(o.value))}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                                    current === o.value
                                        ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                        : "border-[var(--card-border)] hover:bg-[var(--background)]",
                                )}
                            >
                                {label(o.label_i18n, language, o.value)}
                            </button>
                        ))}
                    </div>
                </Field>
            );
        }

        case "range": {
            const current = typeof value === "number" ? value : null;
            const unit = label(def.unit_i18n, language);
            const step = (def.range_max - def.range_min) / 100 < 0.5 ? 0.1 : 0.5;
            return (
                <Field name={name} onClear={current !== null ? onClear : undefined}>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            className="flex-1 accent-[var(--ink)]"
                            min={def.range_min}
                            max={def.range_max}
                            step={step}
                            value={current ?? def.range_min}
                            aria-label={name}
                            // Dragging updates locally; the write happens when
                            // the merchant lets go. Saving per frame would be a
                            // request per pixel.
                            onChange={(e) => onDraft(Number(e.target.value))}
                            onPointerUp={(e) => onSave(Number(e.currentTarget.value))}
                            onKeyUp={(e) => onSave(Number(e.currentTarget.value))}
                            onBlur={(e) => onSave(Number(e.currentTarget.value))}
                        />
                        <span className="text-sm tabular-nums w-24 text-right text-muted">
                            {current === null ? t("attributes.value.unset") : `${current} ${unit}`.trim()}
                        </span>
                    </div>
                </Field>
            );
        }

        case "boolean": {
            const current = typeof value === "boolean" ? value : null;
            return (
                <Field name={name} onClear={current !== null ? onClear : undefined}>
                    <div className="flex gap-2">
                        {[true, false].map((v) => (
                            <button
                                key={String(v)}
                                type="button"
                                aria-pressed={current === v}
                                onClick={() => onSave(v)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                                    current === v
                                        ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                        : "border-[var(--card-border)] hover:bg-[var(--background)]",
                                )}
                            >
                                {t(v ? "common.yes" : "common.no")}
                            </button>
                        ))}
                    </div>
                </Field>
            );
        }

        case "text": {
            const current = (value ?? {}) as Record<string, string>;
            const write = (lang: "ar" | "en", text: string) => {
                const next = { ...current, [lang]: text };
                const any = Object.values(next).some((s) => s.trim().length > 0);
                if (any) onSave(next);
                else onClear();
            };
            return (
                <Field name={name}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                            className={inputCls}
                            defaultValue={current.ar ?? ""}
                            onBlur={(e) => write("ar", e.target.value)}
                            placeholder={t("attributes.nameAr")}
                            aria-label={`${name} — ${t("attributes.nameAr")}`}
                        />
                        <input
                            className={inputCls}
                            defaultValue={current.en ?? ""}
                            onBlur={(e) => write("en", e.target.value)}
                            placeholder={t("attributes.nameEn")}
                            aria-label={`${name} — ${t("attributes.nameEn")}`}
                        />
                    </div>
                </Field>
            );
        }

        case "group_list": {
            const current = (value ?? {}) as Record<string, string[]>;
            const write = (key: string, raw: string) => {
                const items = raw.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
                const next = { ...current };
                if (items.length > 0) next[key] = items;
                else delete next[key];
                if (Object.keys(next).length > 0) onSave(next);
                else onClear();
            };
            return (
                <Field name={name}>
                    <div className="space-y-2">
                        {def.group_keys.map((g) => (
                            <div key={g.key} className="grid grid-cols-[7rem_1fr] gap-2 items-center">
                                <span className="text-sm text-muted truncate">{label(g.label_i18n, language, g.key)}</span>
                                <input
                                    className={inputCls}
                                    defaultValue={(current[g.key] ?? []).join("، ")}
                                    onBlur={(e) => write(g.key, e.target.value)}
                                    placeholder={t("attributes.value.listPlaceholder")}
                                    aria-label={`${name} — ${label(g.label_i18n, language, g.key)}`}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">{t("attributes.value.listHelp")}</p>
                </Field>
            );
        }
    }
}

function Field({
    name,
    onClear,
    children,
}: {
    name: string;
    onClear?: () => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{name}</span>
                {onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                    >
                        <X className="w-3 h-3" />
                        {t("attributes.value.clear")}
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}

export function ProductAttributesSection({ productId }: { productId: string }) {
    const { t } = useLanguage();
    const { data: defs = [] } = useAttributeDefsQuery();
    const { data: rows = [] } = useProductAttributeValuesQuery(productId);
    const setValue = useSetProductAttributeValue(productId);
    const clearValue = useClearProductAttributeValue(productId);
    const [error, setError] = useState<string | null>(null);

    // Optimistic local view: the controls must respond on the tap, not after
    // the round-trip, or a slider feels broken on a slow connection.
    const [local, setLocal] = useState<Record<string, unknown>>({});
    useEffect(() => {
        setLocal(Object.fromEntries(rows.map((r) => [r.attribute_def_id, r.value])));
    }, [rows]);

    if (defs.length === 0) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Tags className="w-4 h-4" />
                    {t("attributes.title")}
                </h2>
                <p className="mt-3 text-sm text-muted">
                    {t("attributes.value.noTaxonomy")}{" "}
                    <Link href="/products?tab=attributes" className="underline hover:no-underline">
                        {t("attributes.value.defineThem")}
                    </Link>
                </p>
            </div>
        );
    }

    const run = (p: Promise<unknown>) => {
        setError(null);
        p.catch((e) => setError(e instanceof Error ? e.message : String(e)));
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Tags className="w-4 h-4" />
                    {t("attributes.title")}
                </h2>
                <Link href="/products?tab=attributes" className="text-xs text-muted underline hover:no-underline">
                    {t("attributes.value.manage")}
                </Link>
            </div>

            <div className="space-y-5">
                {defs.map((def) => (
                    <AttributeField
                        key={def.id}
                        def={def}
                        value={local[def.id]}
                        onDraft={(v) => setLocal((s) => ({ ...s, [def.id]: v }))}
                        onSave={(v) => {
                            setLocal((s) => ({ ...s, [def.id]: v }));
                            run(setValue.mutateAsync({ defId: def.id, value: v }));
                        }}
                        onClear={() => {
                            setLocal((s) => {
                                const next = { ...s };
                                delete next[def.id];
                                return next;
                            });
                            run(clearValue.mutateAsync(def.id));
                        }}
                    />
                ))}
            </div>

            {error && (
                <p role="alert" className="text-sm text-red-500 break-words">
                    {error}
                </p>
            )}
        </div>
    );
}
