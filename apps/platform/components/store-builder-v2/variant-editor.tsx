"use client";

// =====================================================================
// VariantEditor — per-variant detail editor (modal/sheet)
// =====================================================================
// Edits ONE variant on a section instance. Three blocks:
//
// 1. Conditions     — list of conditions with a "+ Add condition" affordance
//                     (reuses VariantAddWizard in `addConditionMode`)
// 2. Overrides      — per-FIELD-PATH list. A "+ Override field" picker
//                     enumerates every leaf path in the section schema
//                     (e.g. `title_i18n`, `cta_label_i18n`, `pills`). Each
//                     overridden path renders an inline AutoForm control
//                     bound to that path in the override object.
// 3. Priority + enabled toggle.
//
// Array semantics: arrays REPLACE the base array wholesale (per the
// resolver's array-replace deep-merge contract). The UI shows a hint
// that says "Array replaces base entirely" for clarity.
// =====================================================================

import {
    useCallback,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import { ArrowDownUp, Plus, X } from "lucide-react";
import { z } from "zod";
import type {
    AudienceSegment,
    Experiment,
    LocaleCode,
    Variant,
    VariantCondition,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { AutoForm } from "./auto-form";
import {
    VariantAddWizard,
    type VariantKind,
} from "./variant-add-wizard";
import { VARIANT_KIND_EMOJI, VARIANT_KIND_LABEL } from "./variant-list";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { summarizeVariantConditions } from "@/lib/variant-summary";
import {
    getAtPath,
    hasOverrideAtPath,
    humanPath,
    listOverridablePaths,
    schemaAtPath,
    setAtPath,
    unsetAtPath,
    type OverridablePath,
} from "./variant-override-paths";

// Re-export for backwards compatibility with existing test imports.
export {
    getAtPath,
    hasOverrideAtPath,
    listOverridablePaths,
    setAtPath,
    summarizeOverrides,
    unsetAtPath,
    type OverridablePath,
} from "./variant-override-paths";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface VariantEditorProps {
    open: boolean;
    variant: Variant;
    /** Section schema — used to render the override controls. */
    schema: z.ZodType<unknown>;
    /** Section base props — used to display the "inherited" preview. */
    base: Record<string, unknown>;
    onChange: (next: Variant) => void;
    onClose: () => void;
    experiments?: Experiment[];
    segments?: AudienceSegment[];
    tenantId?: string;
    /** Active editor locale — forwarded to AutoForm so I18nStringInput shows it expanded. */
    activeLocale?: LocaleCode;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */


/**
 * Describe a condition in human terms — now delegates to the shared
 * `summarizeVariantConditions` helper so the editor and the list row
 * stay in sync.
 */
function summarizeCondition(
    c: VariantCondition,
    locale: "en" | "ar" | "ku",
    experiments: Experiment[],
    segments: AudienceSegment[],
): string {
    return summarizeVariantConditions([c], locale, { experiments, segments });
}

/* ─────────────────────────────────────────────────────────────────── */
/* Schema walker / path helpers live in ./variant-override-paths so     */
/* lightweight consumers (e.g. variant-list) can use them without       */
/* pulling in AutoForm.                                                  */
/* ─────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────── */
/* Editor                                                               */
/* ─────────────────────────────────────────────────────────────────── */

export function VariantEditor(props: VariantEditorProps): ReactElement | null {
    const {
        open,
        variant,
        schema,
        base,
        onChange,
        onClose,
        experiments = [],
        segments = [],
        tenantId,
        activeLocale = "en",
    } = props;

    const locale = useEditorLocale();
    const allPaths = useMemo(() => listOverridablePaths(schema), [schema]);

    const [addConditionKind, setAddConditionKind] = useState<VariantKind | null>(null);
    const [pickerOpen, setPickerOpen] = useState<boolean>(false);

    const handleAddCondition = useCallback(
        (c: VariantCondition): void => {
            onChange({ ...variant, conditions: [...variant.conditions, c] });
            setAddConditionKind(null);
        },
        [onChange, variant],
    );

    const handleRemoveCondition = useCallback(
        (index: number): void => {
            const next = variant.conditions.slice();
            next.splice(index, 1);
            onChange({ ...variant, conditions: next });
        },
        [onChange, variant],
    );

    const handleLabel = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>): void => {
            onChange({ ...variant, label: e.target.value });
        },
        [onChange, variant],
    );

    const handlePriority = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>): void => {
            const n = Number(e.target.value);
            onChange({ ...variant, priority: Number.isFinite(n) ? n : variant.priority });
        },
        [onChange, variant],
    );

    const handleEnabledToggle = useCallback((): void => {
        const next = variant.enabled === false ? true : false;
        onChange({ ...variant, enabled: next });
    }, [onChange, variant]);

    /** Add an override at `path`, seeded with the base value. */
    const addOverride = useCallback(
        (path: string): void => {
            const seed = getAtPath(base, path);
            const nextOverride = setAtPath(
                variant.override as Record<string, unknown>,
                path,
                // Clone arrays/objects so editing the override doesn't mutate base.
                seed != null && typeof seed === "object"
                    ? JSON.parse(JSON.stringify(seed))
                    : seed,
            );
            onChange({ ...variant, override: nextOverride });
            setPickerOpen(false);
        },
        [base, onChange, variant],
    );

    /** Remove a single overridden path. */
    const removeOverride = useCallback(
        (path: string): void => {
            const nextOverride = unsetAtPath(
                variant.override as Record<string, unknown>,
                path,
            );
            onChange({ ...variant, override: nextOverride });
        },
        [onChange, variant],
    );

    /** Update the value at an overridden path. */
    const setOverrideValue = useCallback(
        (path: string, value: unknown): void => {
            const nextOverride = setAtPath(
                variant.override as Record<string, unknown>,
                path,
                value,
            );
            onChange({ ...variant, override: nextOverride });
        },
        [onChange, variant],
    );

    // Active override paths — derived from variant.override.
    const overriddenPaths = useMemo(() => {
        const out: OverridablePath[] = [];
        for (const p of allPaths) {
            if (hasOverrideAtPath(variant.override as Record<string, unknown>, p.path)) {
                out.push(p);
            }
        }
        return out;
    }, [allPaths, variant.override]);

    const availablePaths = useMemo(() => {
        const taken = new Set(overriddenPaths.map((p) => p.path));
        return allPaths.filter((p) => !taken.has(p.path));
    }, [allPaths, overriddenPaths]);

    if (!open) return null;

    const enabled = variant.enabled !== false;
    const overrideRecord = variant.override as Record<string, unknown>;

    return (
        <div
            data-testid="variant-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit variant ${variant.label}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={onClose}
                data-testid="variant-editor-backdrop"
                className="absolute inset-0 cursor-default"
            />
            <div
                className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-(--card-border) bg-(--card-bg) shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between gap-3 border-b border-(--card-border) px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold tracking-tight">
                            {variant.label || t(STRINGS.variant.untitled, locale)}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.variant.editor_close, locale)}
                        data-testid="variant-editor-close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {/* Label */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="variant-editor-label">
                            {t(STRINGS.variant.editor_label_field, locale)}
                        </label>
                        <input
                            id="variant-editor-label"
                            type="text"
                            data-testid="variant-editor-label"
                            value={variant.label}
                            onChange={handleLabel}
                            className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                    </div>

                    {/* When (was: Conditions) */}
                    <section className="mt-4" data-testid="variant-editor-conditions">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                                {t(STRINGS.variant.editor_conditions_heading, locale)}
                            </h3>
                            <ConditionAddMenu
                                onPickKind={(k) => setAddConditionKind(k)}
                            />
                        </div>
                        {variant.conditions.length === 0 ? (
                            <div
                                data-testid="variant-editor-conditions-empty"
                                className="rounded-md border border-dashed border-(--card-border) px-3 py-3 text-center text-[11px] text-foreground/80"
                            >
                                {t(STRINGS.variant.editor_conditions_empty, locale)}
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-1.5">
                                {variant.conditions.map((c, i) => (
                                    <li
                                        key={`${c.kind}-${i}`}
                                        data-testid={`variant-editor-condition-${i}`}
                                        className="flex items-center gap-2 rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-1.5"
                                    >
                                        <span aria-hidden="true" className="text-base">
                                            {VARIANT_KIND_EMOJI[c.kind]}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                                                {VARIANT_KIND_LABEL[c.kind]}
                                            </div>
                                            <div className="truncate text-sm">
                                                {summarizeCondition(c, locale, experiments, segments)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={`Remove ${c.kind} condition`}
                                            data-testid={`variant-editor-condition-${i}-remove`}
                                            onClick={() => handleRemoveCondition(i)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10"
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Different values (was: Overrides) */}
                    <section className="mt-4" data-testid="variant-editor-overrides">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                                {t(STRINGS.variant.editor_overrides_heading, locale)}
                            </h3>
                            <OverrideFieldPicker
                                open={pickerOpen}
                                onToggle={() => setPickerOpen((v) => !v)}
                                onClose={() => setPickerOpen(false)}
                                paths={availablePaths}
                                onPick={addOverride}
                            />
                        </div>
                        <p className="mb-2 text-[11px] text-foreground/80">
                            {t(STRINGS.variant.editor_overrides_hint, locale)}
                        </p>

                        {overriddenPaths.length === 0 ? (
                            <div
                                data-testid="variant-editor-overrides-empty"
                                className="rounded-md border border-dashed border-(--card-border) px-3 py-3 text-center text-[11px] text-foreground/80"
                            >
                                {t(STRINGS.variant.editor_overrides_empty, locale)}
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {overriddenPaths.map((p) => {
                                    const fieldSchema = schemaAtPath(schema, p.path);
                                    return (
                                        <OverridePathRow
                                            key={p.path}
                                            path={p.path}
                                            kind={p.kind}
                                            fieldSchema={fieldSchema}
                                            value={getAtPath(overrideRecord, p.path)}
                                            onChange={(v) => setOverrideValue(p.path, v)}
                                            onRemove={() => removeOverride(p.path)}
                                            tenantId={tenantId}
                                            activeLocale={activeLocale}
                                        />
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {/* Priority + enabled */}
                    <section className="mt-4 grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label
                                className="flex items-center gap-1 text-sm font-medium"
                                htmlFor="variant-editor-priority"
                            >
                                <ArrowDownUp
                                    className="h-3.5 w-3.5 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                {t(STRINGS.variant.editor_priority, locale)}
                            </label>
                            <input
                                id="variant-editor-priority"
                                type="number"
                                data-testid="variant-editor-priority"
                                value={variant.priority}
                                onChange={handlePriority}
                                className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                {t(STRINGS.variant.editor_priority_hint, locale)}
                            </p>
                        </div>
                        <div className="flex flex-col items-stretch gap-1.5">
                            <span className="text-sm font-medium">
                                {t(STRINGS.variant.editor_enabled, locale)}
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                data-testid="variant-editor-enabled"
                                onClick={handleEnabledToggle}
                                className={cn(
                                    "relative inline-flex h-10 w-full items-center justify-between rounded-xl border border-(--card-border) px-3 text-sm font-medium",
                                    enabled ? "bg-emerald-500/10 text-emerald-700" : "bg-muted/40 text-muted-foreground",
                                )}
                            >
                                <span>{enabled ? "On" : "Off"}</span>
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "inline-block h-2.5 w-2.5 rounded-full",
                                        enabled ? "bg-emerald-500" : "border border-muted-foreground/40",
                                    )}
                                />
                            </button>
                        </div>
                    </section>
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-(--card-border) bg-muted/20 px-4 py-3">
                    <button
                        type="button"
                        data-testid="variant-editor-done"
                        onClick={onClose}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Done
                    </button>
                </footer>
            </div>

            {addConditionKind !== null && (
                <VariantAddWizard
                    open
                    onClose={() => setAddConditionKind(null)}
                    onAdd={() => undefined}
                    existingVariantCount={0}
                    experiments={experiments}
                    segments={segments}
                    addConditionMode={{
                        kind: addConditionKind,
                        onAddCondition: handleAddCondition,
                    }}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Condition "+ Add" menu                                                */
/* ─────────────────────────────────────────────────────────────────── */

function ConditionAddMenu({
    onPickKind,
}: {
    onPickKind: (kind: VariantKind) => void;
}): ReactElement {
    const locale = useEditorLocale();
    const [open, setOpen] = useState<boolean>(false);
    const close = useCallback(() => setOpen(false), []);
    const KINDS: VariantKind[] = [
        "locale",
        "breakpoint",
        "time_window",
        "audience",
        "ab_test",
        "governorate",
        "product",
        "category",
        "page",
    ];
    return (
        <div className="relative">
            <button
                type="button"
                data-testid="variant-editor-add-condition"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t(STRINGS.variant.editor_add_condition, locale)}
            </button>
            {open && (
                <>
                    <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={close}
                        className="fixed inset-0 z-40 cursor-default"
                    />
                    <div
                        role="menu"
                        data-testid="variant-editor-add-condition-menu"
                        className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border border-(--card-border) bg-(--card-bg) shadow-lg"
                    >
                        {KINDS.map((k) => (
                            <button
                                key={k}
                                type="button"
                                role="menuitem"
                                data-testid={`variant-editor-add-condition-${k}`}
                                onClick={() => {
                                    close();
                                    onPickKind(k);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
                            >
                                <span aria-hidden="true">{VARIANT_KIND_EMOJI[k]}</span>
                                <span>{VARIANT_KIND_LABEL[k]}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* "+ Override field" picker                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface OverrideFieldPickerProps {
    open: boolean;
    onToggle: () => void;
    onClose: () => void;
    paths: OverridablePath[];
    onPick: (path: string) => void;
}

function OverrideFieldPicker(p: OverrideFieldPickerProps): ReactElement {
    const locale = useEditorLocale();
    const disabled = p.paths.length === 0;
    return (
        <div className="relative">
            <button
                type="button"
                data-testid="variant-editor-add-override"
                aria-haspopup="menu"
                aria-expanded={p.open}
                disabled={disabled}
                onClick={p.onToggle}
                className={cn(
                    "inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted",
                    disabled && "cursor-not-allowed opacity-50",
                )}
                title={disabled ? t(STRINGS.variant.editor_override_disabled_hint, locale) : undefined}
            >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t(STRINGS.variant.editor_override_field_button, locale)}
            </button>
            {p.open && !disabled && (
                <>
                    <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={p.onClose}
                        className="fixed inset-0 z-40 cursor-default"
                    />
                    <div
                        role="menu"
                        data-testid="variant-editor-add-override-menu"
                        className="absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-(--card-border) bg-(--card-bg) shadow-lg"
                    >
                        {p.paths.map((opt) => (
                            <button
                                key={opt.path}
                                type="button"
                                role="menuitem"
                                data-testid={`variant-editor-add-override-${opt.path}`}
                                onClick={() => p.onPick(opt.path)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
                            >
                                <span className="truncate">{humanPath(opt.path)}</span>
                                {opt.kind !== "leaf" && (
                                    <span
                                        className={cn(
                                            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                                            opt.kind === "i18n"
                                                ? "bg-blue-500/10 text-blue-700"
                                                : "bg-amber-500/10 text-amber-700",
                                        )}
                                    >
                                        {opt.kind}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* One override row — renders the inline AutoForm control                */
/* ─────────────────────────────────────────────────────────────────── */

interface OverridePathRowProps {
    path: string;
    kind: OverridablePath["kind"];
    fieldSchema: z.ZodType<unknown> | null;
    value: unknown;
    onChange: (next: unknown) => void;
    onRemove: () => void;
    tenantId?: string;
    activeLocale?: LocaleCode;
}

function OverridePathRow(p: OverridePathRowProps): ReactElement {
    const label = humanPath(p.path);

    // Wrap the field's schema in a single-key object so AutoForm can render
    // it through its existing infrastructure. Use the last segment as the
    // key so the auto-form testids look like the original field key.
    const lastSeg = p.path.split(".").pop() ?? "value";
    const wrappedSchema = useMemo(() => {
        if (!p.fieldSchema) return null;
        return z.object({
            [lastSeg]: p.fieldSchema,
        } as Record<string, z.ZodType<unknown>>);
    }, [p.fieldSchema, lastSeg]);

    return (
        <li
            data-testid={`variant-editor-field-${p.path}`}
            data-overridden="true"
            className="rounded-md border border-(--card-border) bg-(--card-bg) p-2.5"
        >
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <span
                        aria-label="Overridden"
                        title="Overridden"
                        data-testid={`variant-editor-field-${p.path}-dot`}
                        className="inline-block h-2 w-2 rounded-full bg-amber-500"
                    />
                    {p.kind === "array" && (
                        <span
                            data-testid={`variant-editor-field-${p.path}-array-hint`}
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700"
                            title="Array overrides replace base entirely"
                        >
                            Replaces base
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label={`Remove override on ${label}`}
                    data-testid={`variant-editor-field-${p.path}-remove`}
                    onClick={p.onRemove}
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-(--card-border) bg-muted/40 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Remove
                </button>
            </div>
            {p.kind === "array" && (
                <p className="mb-1.5 text-[11px] italic text-muted-foreground">
                    Array replaces base entirely.
                </p>
            )}
            <div data-testid={`variant-editor-field-${p.path}-control`}>
                {wrappedSchema ? (
                    <AutoForm
                        schema={wrappedSchema}
                        value={{ [lastSeg]: p.value }}
                        onChange={(v) => {
                            const obj = v as Record<string, unknown>;
                            p.onChange(obj[lastSeg]);
                        }}
                        tenantId={p.tenantId}
                        activeLocale={p.activeLocale}
                    />
                ) : (
                    <p className="text-[11px] italic text-muted-foreground">
                        Field schema not resolvable from path.
                    </p>
                )}
            </div>
        </li>
    );
}
