"use client";

// =====================================================================
// AutoForm — schema-driven form renderer
// =====================================================================
// Walks a Zod schema and renders the appropriate editor controls so the
// merchant can edit a section's typed `base` props without us hand-
// coding a form per section. Recursive: objects nest, arrays repeat,
// I18nString objects route to <I18nStringInput />.
//
// Field shape detection lives in `inferField()` — each branch returns
// a small descriptor the renderer switches on. `.describe()` hints from
// the storefront schemas refine the default control choice (e.g.
// `.describe("image")` upgrades a plain string input into an uploader).
// =====================================================================

import {
    useCallback,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import {
    ChevronDown,
    ChevronRight,
    GripVertical,
    Image as ImageIcon,
    Loader2,
    Plus,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { z } from "zod";
import {
    Monitor as MonitorIcon,
    Smartphone as SmartphoneIcon,
    Tablet as TabletIcon,
} from "lucide-react";
import type { Breakpoint, I18nString, LocaleCode, SectionInstance } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import {
    FIELD_GROUPS_ORDER,
    getFieldGroup,
    hasFieldGroups,
    type FieldGroup,
} from "@/lib/section-field-groups";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import {
    clearBreakpointOverride,
    getBreakpointOverride,
    hasBreakpointOverride,
    setBreakpointOverride,
} from "@/lib/responsive-overrides";
import { I18nStringInput } from "./i18n-string-input";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface AutoFormProps<T> {
    schema: z.ZodType<T>;
    value: T;
    onChange: (next: T) => void;
    /** Path prefix used for labels (defaults to []). */
    labelPath?: string[];
    /** Tenant id — used by image-upload fields. Optional in tests. */
    tenantId?: string;
    /**
     * Active editor locale — forwarded to every I18nStringInput so that
     * the locale the user is currently previewing is the one expanded
     * by default. Defaults to "en".
     */
    activeLocale?: LocaleCode;
    /**
     * If provided AND a matching entry exists in `FIELD_GROUPS`, the
     * form renders three collapsible groups (Essentials/Style/Logic).
     * Otherwise it renders flat (back-compat for callers that don't
     * carry section-type context, e.g. variant override editors).
     */
    sectionType?: string;
    /**
     * Optional — when supplied alongside `onInstanceChange`, every
     * top-level scalar / i18n field gets a 3-icon "breakpoint adornment"
     * (mobile / tablet / desktop) next to its label. Clicking an icon
     * opens an inline override sub-form that writes through to a
     * `{kind:"breakpoint",values:[bp]}` shortcut variant on the section.
     */
    sectionInstance?: SectionInstance;
    onInstanceChange?: (next: SectionInstance) => void;
    /** Currently-active editor breakpoint — drives icon highlight. */
    activeBreakpoint?: Breakpoint;
}

export function AutoForm<T>(props: AutoFormProps<T>): ReactElement {
    const {
        schema,
        value,
        onChange,
        labelPath,
        tenantId,
        activeLocale,
        sectionType,
        sectionInstance,
        onInstanceChange,
        activeBreakpoint,
    } = props;

    // Build the per-top-level-field breakpoint adornment renderer.
    // Skipped (returns null) for callers that don't pass instance + active
    // breakpoint, so existing flat-render call sites stay byte-identical.
    const renderAdornment = useMemo<RenderFieldAdornment | undefined>(() => {
        if (!sectionInstance || !onInstanceChange || !activeBreakpoint) return undefined;
        return (fieldKey: string, fieldKind: FieldShape["kind"]) => (
            <BreakpointAdornment
                fieldKey={fieldKey}
                fieldKind={fieldKind}
                instance={sectionInstance}
                onInstanceChange={onInstanceChange}
                activeBreakpoint={activeBreakpoint}
            />
        );
    }, [sectionInstance, onInstanceChange, activeBreakpoint]);

    // If the schema's root is a Zod object AND we have group metadata
    // for this section type, render grouped accordions. Otherwise fall
    // through to the existing flat renderer.
    const grouped = useMemo<GroupedRender | null>(() => {
        if (!sectionType || !hasFieldGroups(sectionType)) return null;
        const { schema: inner } = unwrap(schema as unknown as z.ZodType<unknown>);
        const def = (inner._def as { type?: string }).type;
        if (def !== "object") return null;
        const shape = (inner as unknown as { shape: Record<string, z.ZodType<unknown>> })
            .shape;
        const buckets: Record<FieldGroup, string[]> = {
            essential: [],
            style: [],
            logic: [],
        };
        for (const key of Object.keys(shape)) {
            buckets[getFieldGroup(sectionType, key)].push(key);
        }
        return { shape, buckets };
    }, [schema, sectionType]);

    if (grouped) {
        return (
            <GroupedFormRenderer
                shape={grouped.shape}
                buckets={grouped.buckets}
                value={value as unknown as Record<string, unknown>}
                onChange={(next) => onChange(next as T)}
                tenantId={tenantId}
                activeLocale={activeLocale ?? "en"}
                renderAdornment={renderAdornment}
            />
        );
    }

    return (
        <FieldRenderer
            schema={schema as unknown as z.ZodType<unknown>}
            value={value as unknown}
            onChange={(next) => onChange(next as T)}
            labelPath={labelPath ?? []}
            fieldKey="root"
            tenantId={tenantId}
            activeLocale={activeLocale ?? "en"}
            renderAdornment={renderAdornment}
            isTopLevel
        />
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Adornment renderer type                                              */
/* ─────────────────────────────────────────────────────────────────── */

type RenderFieldAdornment = (
    fieldKey: string,
    fieldKind: FieldShape["kind"],
) => ReactElement | null;

interface GroupedRender {
    shape: Record<string, z.ZodType<unknown>>;
    buckets: Record<FieldGroup, string[]>;
}

interface GroupedFormRendererProps {
    shape: Record<string, z.ZodType<unknown>>;
    buckets: Record<FieldGroup, string[]>;
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
    tenantId?: string;
    activeLocale: LocaleCode;
    renderAdornment?: RenderFieldAdornment;
}

function GroupedFormRenderer(p: GroupedFormRendererProps): ReactElement {
    const locale = useResolvedEditorLocale(p.activeLocale);

    const handleField = useCallback(
        (key: string, next: unknown): void => {
            const merged = { ...p.value, [key]: next };
            if (next === undefined) {
                delete merged[key];
            }
            p.onChange(merged);
        },
        [p],
    );

    const labelFor: Record<FieldGroup, string> = {
        essential: tx(STRINGS.section_edit.group_essentials, locale),
        style: tx(STRINGS.section_edit.group_style, locale),
        logic: tx(STRINGS.section_edit.group_logic, locale),
    };

    return (
        <div className="flex flex-col gap-2" data-testid="auto-form-grouped">
            {FIELD_GROUPS_ORDER.map((group) => {
                const fields = p.buckets[group];
                if (fields.length === 0) return null;
                return (
                    <GroupAccordion
                        key={group}
                        group={group}
                        label={labelFor[group]}
                        defaultOpen={group === "essential"}
                    >
                        <div className="flex flex-col gap-3 px-3 py-3">
                            {fields.map((key) => (
                                <FieldRenderer
                                    key={key}
                                    schema={p.shape[key]}
                                    value={p.value?.[key]}
                                    onChange={(v) => handleField(key, v)}
                                    // Namespace under the group so testIds
                                    // stay collision-free and inspectable.
                                    labelPath={[group]}
                                    fieldKey={key}
                                    tenantId={p.tenantId}
                                    activeLocale={p.activeLocale}
                                    renderAdornment={p.renderAdornment}
                                    isTopLevel
                                />
                            ))}
                        </div>
                    </GroupAccordion>
                );
            })}
        </div>
    );
}

interface GroupAccordionProps {
    group: FieldGroup;
    label: string;
    defaultOpen: boolean;
    children: React.ReactNode;
}

function GroupAccordion(p: GroupAccordionProps): ReactElement {
    const [open, setOpen] = useState<boolean>(p.defaultOpen);
    return (
        <section
            data-testid={`auto-form-group-${p.group}`}
            data-open={open ? "true" : "false"}
            className="overflow-hidden rounded-xl border border-(--card-border) bg-(--card-bg)"
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid={`auto-form-group-${p.group}-toggle`}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/3"
            >
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                    {p.label}
                </span>
                {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
            </button>
            {open && (
                <div
                    data-testid={`auto-form-group-${p.group}-body`}
                    className="border-t border-(--card-border)"
                >
                    {p.children}
                </div>
            )}
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Field shape introspection                                            */
/* ─────────────────────────────────────────────────────────────────── */

type FieldShape =
    | { kind: "string"; hint?: string; isUrl?: boolean }
    | { kind: "number"; min?: number; max?: number; integer?: boolean }
    | { kind: "boolean" }
    | { kind: "enum"; options: string[] }
    | { kind: "literal"; value: unknown }
    | { kind: "array"; element: z.ZodType<unknown> }
    | { kind: "object"; shape: Record<string, z.ZodType<unknown>> }
    | { kind: "i18n_string" }
    | { kind: "unknown" };

interface UnwrappedSchema {
    schema: z.ZodType<unknown>;
    optional: boolean;
    description?: string;
}

/** Unwrap `.optional()` / `.nullable()` and surface `.describe()` text. */
function unwrap(schema: z.ZodType<unknown>): UnwrappedSchema {
    let current: z.ZodType<unknown> = schema;
    let optional = false;
    let description: string | undefined = current.description;

    // z.optional / z.nullable / z.default produce wrappers with an inner
    // type. Walk through them until we hit something concrete.
    let safety = 0;
    while (safety++ < 8) {
        const defAny = current._def as { type?: string; innerType?: z.ZodType<unknown> };
        if (
            (defAny.type === "optional" ||
                defAny.type === "nullable" ||
                defAny.type === "default") &&
            defAny.innerType
        ) {
            optional = optional || defAny.type === "optional";
            current = defAny.innerType;
            if (!description) description = current.description;
            continue;
        }
        break;
    }

    return { schema: current, optional, description };
}

function isI18nStringShape(shape: Record<string, z.ZodType<unknown>>): boolean {
    const keys = Object.keys(shape).sort().join(",");
    // Match the shape from apps/storefront/sections/_schema.ts — an object
    // with locale keys (en/ar/ku) where every value is an optional string.
    const expected = ["ar", "en", "ku"].sort().join(",");
    if (keys !== expected) return false;
    for (const k of Object.keys(shape)) {
        const inner = unwrap(shape[k]);
        const t = (inner.schema._def as { type?: string }).type;
        if (t !== "string") return false;
    }
    return true;
}

function inferField(schema: z.ZodType<unknown>): {
    field: FieldShape;
    optional: boolean;
    description?: string;
} {
    const { schema: inner, optional, description } = unwrap(schema);
    const def = inner._def as unknown as Record<string, unknown>;
    const t = def.type as string | undefined;

    switch (t) {
        case "string": {
            // Detect URL via the .url() format check.
            const checks = (def.checks ?? []) as Array<{
                _def?: { format?: string };
                def?: { format?: string };
            }>;
            const isUrl = checks.some((c) => {
                const fmt = c._def?.format ?? c.def?.format;
                return fmt === "url";
            });
            return {
                field: { kind: "string", hint: description, isUrl },
                optional,
                description,
            };
        }
        case "number": {
            const checks = (def.checks ?? []) as Array<{
                _def?: { check?: string; value?: number; inclusive?: boolean };
                def?: { check?: string; value?: number; inclusive?: boolean };
            }>;
            let min: number | undefined;
            let max: number | undefined;
            for (const c of checks) {
                const d = c._def ?? c.def ?? {};
                if (d.check === "greater_than" && typeof d.value === "number") {
                    min = d.inclusive ? d.value : d.value + 1;
                } else if (d.check === "less_than" && typeof d.value === "number") {
                    max = d.inclusive ? d.value : d.value - 1;
                }
            }
            // `minValue` / `maxValue` fallback for v4 helpers if present.
            const innerAny = inner as unknown as { minValue?: number; maxValue?: number };
            if (min === undefined && typeof innerAny.minValue === "number") min = innerAny.minValue;
            if (max === undefined && typeof innerAny.maxValue === "number") max = innerAny.maxValue;
            return {
                field: { kind: "number", min, max },
                optional,
                description,
            };
        }
        case "boolean":
            return { field: { kind: "boolean" }, optional, description };
        case "enum": {
            const entries = def.entries as Record<string, string> | undefined;
            const opts = entries
                ? Object.values(entries)
                : ((def.options ?? []) as string[]);
            return {
                field: { kind: "enum", options: opts },
                optional,
                description,
            };
        }
        case "literal": {
            const values = def.values as unknown[] | undefined;
            return {
                field: { kind: "literal", value: values?.[0] },
                optional,
                description,
            };
        }
        case "array": {
            const element = def.element as z.ZodType<unknown>;
            return {
                field: { kind: "array", element },
                optional,
                description,
            };
        }
        case "object": {
            const shape = (inner as unknown as { shape: Record<string, z.ZodType<unknown>> })
                .shape;
            if (isI18nStringShape(shape)) {
                return { field: { kind: "i18n_string" }, optional, description };
            }
            return {
                field: { kind: "object", shape },
                optional,
                description,
            };
        }
        default:
            return { field: { kind: "unknown" }, optional, description };
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Renderer                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface FieldRendererProps {
    schema: z.ZodType<unknown>;
    value: unknown;
    onChange: (next: unknown) => void;
    labelPath: string[];
    fieldKey: string;
    tenantId?: string;
    /** Active editor locale — propagated down to I18nStringInput. */
    activeLocale?: LocaleCode;
    /** If true, this is a top-level form — render flat (no card wrapper). */
    inline?: boolean;
    /**
     * When set + `isTopLevel`, the renderer emits the adornment ABOVE the
     * field control. Only top-level scalars and `_i18n` fields qualify
     * (arrays / nested objects are skipped per the audit's Phase-3b
     * scope to keep the surface simple).
     */
    renderAdornment?: RenderFieldAdornment;
    isTopLevel?: boolean;
}

function FieldRenderer(props: FieldRendererProps): ReactElement {
    const {
        schema,
        value,
        onChange,
        labelPath,
        fieldKey,
        tenantId,
        activeLocale,
        renderAdornment,
        isTopLevel,
    } = props;
    const { field, optional } = useMemo(() => inferField(schema), [schema]);
    const label = humanLabel(fieldKey);
    const path = labelPath.concat(fieldKey);
    const testIdBase = `auto-form-${path.join(".")}`;

    const adornment = useMemo(() => {
        if (!renderAdornment || !isTopLevel) return null;
        // Only show the adornment for fields we know how to override
        // cleanly: scalars + i18n. Arrays / nested objects intentionally
        // skipped (per audit Phase-3b scope).
        const eligible =
            field.kind === "string" ||
            field.kind === "number" ||
            field.kind === "boolean" ||
            field.kind === "enum" ||
            field.kind === "i18n_string";
        if (!eligible) return null;
        return renderAdornment(fieldKey, field.kind);
    }, [renderAdornment, isTopLevel, field.kind, fieldKey]);

    const wrap = (control: ReactElement): ReactElement => {
        if (!adornment) return control;
        return (
            <div
                className="space-y-1"
                data-testid={`${testIdBase}-with-adornment`}
            >
                {adornment}
                {control}
            </div>
        );
    };

    // Optional + currently unset → show "Set" affordance.
    if (optional && value === undefined && field.kind !== "i18n_string") {
        return wrap(
            <div
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-(--card-border) px-3 py-2"
                data-testid={`${testIdBase}-unset`}
            >
                <span className="text-sm text-muted-foreground">{label}</span>
                <button
                    type="button"
                    data-testid={`${testIdBase}-set`}
                    onClick={() => onChange(defaultValueForField(field))}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" /> Set
                </button>
            </div>,
        );
    }

    let control: ReactElement;
    switch (field.kind) {
        case "string":
            control = (
                <StringControl
                    label={label}
                    value={(value as string | undefined) ?? ""}
                    onChange={(v) => onChange(v === "" && optional ? undefined : v)}
                    hint={field.hint}
                    isUrl={field.isUrl}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    tenantId={tenantId}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "number":
            control = (
                <NumberControl
                    label={label}
                    value={value as number | undefined}
                    onChange={(v) => onChange(v)}
                    min={field.min}
                    max={field.max}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "boolean":
            control = (
                <BooleanControl
                    label={label}
                    value={value as boolean | undefined}
                    onChange={onChange}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "enum":
            control = (
                <EnumControl
                    label={label}
                    value={(value as string | undefined) ?? ""}
                    options={field.options}
                    onChange={onChange}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "literal":
            control = (
                <input
                    type="hidden"
                    data-testid={`${testIdBase}-literal`}
                    value={String(field.value ?? "")}
                    readOnly
                />
            );
            break;
        case "i18n_string":
            control = (
                <I18nStringInput
                    label={label}
                    value={(value as I18nString | undefined) ?? {}}
                    onChange={(next) => onChange(next)}
                    testIdPrefix={testIdBase}
                    activeLocale={activeLocale}
                />
            );
            break;
        case "array":
            control = (
                <ArrayControl
                    label={label}
                    value={(value as unknown[] | undefined) ?? []}
                    element={field.element}
                    onChange={onChange}
                    labelPath={path}
                    tenantId={tenantId}
                    activeLocale={activeLocale}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "object":
            control = (
                <ObjectControl
                    label={label}
                    shape={field.shape}
                    value={(value as Record<string, unknown> | undefined) ?? {}}
                    onChange={onChange}
                    labelPath={path}
                    tenantId={tenantId}
                    activeLocale={activeLocale}
                    testIdBase={testIdBase}
                />
            );
            break;
        default:
            control = (
                <div className="text-xs text-muted-foreground" data-testid={`${testIdBase}-unknown`}>
                    Unsupported field: {label}
                </div>
            );
    }
    return wrap(control);
}

function humanLabel(key: string): string {
    if (!key || key === "root") return "";
    return key
        .replace(/_i18n$/g, "")
        .replace(/_/g, " ")
        .replace(/\bid\b/gi, "ID")
        .replace(/\bcta\b/gi, "CTA")
        .replace(/\burl\b/gi, "URL")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultValueForField(field: FieldShape): unknown {
    switch (field.kind) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        case "enum":
            return field.options[0] ?? "";
        case "array":
            return [];
        case "object":
            return {};
        case "i18n_string":
            return {};
        default:
            return undefined;
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Controls                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface FieldHeaderProps {
    label: string;
    onClear?: () => void;
    testIdBase: string;
}

function FieldHeader({ label, onClear, testIdBase }: FieldHeaderProps): ReactElement {
    return (
        <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">{label}</label>
            {onClear && (
                <button
                    type="button"
                    data-testid={`${testIdBase}-clear`}
                    onClick={onClear}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                    Clear
                </button>
            )}
        </div>
    );
}

interface StringControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    hint?: string;
    isUrl?: boolean;
    optional: boolean;
    onClear?: () => void;
    tenantId?: string;
    testIdBase: string;
}

function StringControl(p: StringControlProps): ReactElement {
    if (p.hint === "image") {
        return (
            <ImageControl
                label={p.label}
                value={p.value}
                onChange={p.onChange}
                tenantId={p.tenantId}
                onClear={p.onClear}
                testIdBase={p.testIdBase}
            />
        );
    }
    if (p.hint === "color") {
        return (
            <ColorControl
                label={p.label}
                value={p.value}
                onChange={p.onChange}
                onClear={p.onClear}
                testIdBase={p.testIdBase}
            />
        );
    }
    if (p.hint === "multiline") {
        return (
            <div className="space-y-1.5">
                <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
                <textarea
                    data-testid={`${p.testIdBase}-textarea`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    rows={3}
                    className={cn(
                        "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                        "transition-colors resize-y min-h-[88px]",
                    )}
                />
            </div>
        );
    }
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <input
                type={p.isUrl ? "url" : "text"}
                data-testid={`${p.testIdBase}-input`}
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
                className={cn(
                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    "transition-colors",
                )}
            />
        </div>
    );
}

interface ColorControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    onClear?: () => void;
    testIdBase: string;
}

function ColorControl(p: ColorControlProps): ReactElement {
    const hex = p.value || "#000000";
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    data-testid={`${p.testIdBase}-color`}
                    value={hex}
                    onChange={(e) => p.onChange(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-(--card-border) bg-transparent"
                    aria-label={`${p.label} color`}
                />
                <input
                    type="text"
                    data-testid={`${p.testIdBase}-hex`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    placeholder="#000000"
                    className={cn(
                        "flex-1 rounded-xl border border-(--card-border) bg-background px-3.5 py-2 font-mono text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    )}
                />
            </div>
        </div>
    );
}

interface ImageControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    tenantId?: string;
    onClear?: () => void;
    testIdBase: string;
}

function ImageControl(p: ImageControlProps): ReactElement {
    const [uploading, setUploading] = useState<boolean>(false);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!p.tenantId) {
                toast.error("Missing tenant context for upload");
                return;
            }
            const max = 4 * 1024 * 1024;
            if (file.size > max) {
                toast.error(`${p.label} must be under 4MB`);
                return;
            }
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            const path = `${p.tenantId}/section-${Date.now()}.${ext}`;
            setUploading(true);
            try {
                const { error } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file, { upsert: true });
                if (error) throw error;
                const {
                    data: { publicUrl },
                } = supabase.storage.from("tenant-assets").getPublicUrl(path);
                p.onChange(publicUrl);
                toast.success(`${p.label} uploaded`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Upload failed";
                toast.error("Upload failed", msg);
            } finally {
                setUploading(false);
            }
        },
        [p],
    );

    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <div className="flex items-stretch gap-3">
                <div
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-(--card-border) bg-muted/30"
                    data-testid={`${p.testIdBase}-preview`}
                >
                    {p.value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.value} alt={p.label} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" aria-hidden="true" />
                        </div>
                    )}
                </div>
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
                        className="sr-only"
                        data-testid={`${p.testIdBase}-upload`}
                        onChange={handleUpload}
                    />
                </label>
            </div>
            <input
                type="url"
                data-testid={`${p.testIdBase}-url`}
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
                placeholder="https://… or paste an image URL"
                className={cn(
                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                )}
            />
        </div>
    );
}

interface NumberControlProps {
    label: string;
    value: number | undefined;
    onChange: (next: number | undefined) => void;
    min?: number;
    max?: number;
    optional: boolean;
    onClear?: () => void;
    testIdBase: string;
}

function NumberControl(p: NumberControlProps): ReactElement {
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <input
                type="number"
                data-testid={`${p.testIdBase}-input`}
                value={p.value ?? ""}
                min={p.min}
                max={p.max}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                        p.onChange(p.optional ? undefined : 0);
                        return;
                    }
                    const n = Number(raw);
                    if (Number.isFinite(n)) p.onChange(n);
                }}
                className={cn(
                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                )}
            />
            {(p.min !== undefined || p.max !== undefined) && (
                <p className="text-[11px] text-muted-foreground">
                    {p.min !== undefined && p.max !== undefined
                        ? `Range: ${p.min}–${p.max}`
                        : p.min !== undefined
                          ? `Min: ${p.min}`
                          : `Max: ${p.max}`}
                </p>
            )}
        </div>
    );
}

interface BooleanControlProps {
    label: string;
    value: boolean | undefined;
    onChange: (next: boolean) => void;
    testIdBase: string;
}

function BooleanControl(p: BooleanControlProps): ReactElement {
    const on = !!p.value;
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) px-3 py-2">
            <label className="text-sm font-medium">{p.label}</label>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                data-testid={`${p.testIdBase}-switch`}
                onClick={() => p.onChange(!on)}
                className={cn(
                    "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                    on ? "bg-primary" : "bg-muted",
                )}
            >
                <span
                    className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-[18px]" : "translate-x-0.5",
                    )}
                />
            </button>
        </div>
    );
}

interface EnumControlProps {
    label: string;
    value: string;
    options: string[];
    onChange: (next: string) => void;
    optional: boolean;
    onClear?: () => void;
    testIdBase: string;
}

function EnumControl(p: EnumControlProps): ReactElement {
    const useSegmented = p.options.length > 0 && p.options.length <= 4;
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            {useSegmented ? (
                <div
                    role="radiogroup"
                    aria-label={p.label}
                    data-testid={`${p.testIdBase}-segmented`}
                    className="inline-flex w-full rounded-xl border border-(--card-border) bg-(--card-bg) p-1"
                >
                    {p.options.map((opt) => {
                        const active = opt === p.value;
                        return (
                            <button
                                key={opt}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                data-testid={`${p.testIdBase}-option-${opt}`}
                                onClick={() => p.onChange(opt)}
                                className={cn(
                                    "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                                    active
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                                )}
                            >
                                {humanLabel(opt)}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <select
                    data-testid={`${p.testIdBase}-select`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    className={cn(
                        "w-full rounded-xl border border-(--card-border) bg-background px-3 py-2.5 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    )}
                >
                    {p.options.map((opt) => (
                        <option key={opt} value={opt}>
                            {humanLabel(opt)}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}

interface ArrayControlProps {
    label: string;
    value: unknown[];
    element: z.ZodType<unknown>;
    onChange: (next: unknown[]) => void;
    labelPath: string[];
    tenantId?: string;
    activeLocale?: LocaleCode;
    testIdBase: string;
}

function ArrayControl(p: ArrayControlProps): ReactElement {
    const handleAdd = useCallback((): void => {
        const { field } = inferField(p.element);
        const fresh = defaultValueForField(field);
        p.onChange([...p.value, fresh]);
    }, [p]);

    const handleRemove = useCallback(
        (index: number): void => {
            const next = p.value.slice();
            next.splice(index, 1);
            p.onChange(next);
        },
        [p],
    );

    const handleMove = useCallback(
        (from: number, to: number): void => {
            if (to < 0 || to >= p.value.length) return;
            const next = p.value.slice();
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            p.onChange(next);
        },
        [p],
    );

    const updateItem = useCallback(
        (index: number, val: unknown): void => {
            const next = p.value.slice();
            next[index] = val;
            p.onChange(next);
        },
        [p],
    );

    return (
        <div className="space-y-2" data-testid={`${p.testIdBase}-array`}>
            <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">
                    {p.label}{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">
                        ({p.value.length})
                    </span>
                </label>
                <button
                    type="button"
                    data-testid={`${p.testIdBase}-add`}
                    onClick={handleAdd}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" /> Add
                </button>
            </div>
            {p.value.length === 0 ? (
                <div
                    data-testid={`${p.testIdBase}-empty`}
                    className="rounded-xl border border-dashed border-(--card-border) px-3 py-4 text-center text-[11px] text-muted-foreground"
                >
                    No items yet
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {p.value.map((item, i) => (
                        <li
                            key={i}
                            data-testid={`${p.testIdBase}-item-${i}`}
                            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-2"
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <GripVertical className="h-3 w-3" aria-hidden="true" />
                                    Item {i + 1}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        aria-label="Move up"
                                        data-testid={`${p.testIdBase}-item-${i}-up`}
                                        disabled={i === 0}
                                        onClick={() => handleMove(i, i - 1)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Move down"
                                        data-testid={`${p.testIdBase}-item-${i}-down`}
                                        disabled={i === p.value.length - 1}
                                        onClick={() => handleMove(i, i + 1)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Remove item"
                                        data-testid={`${p.testIdBase}-item-${i}-remove`}
                                        onClick={() => handleRemove(i)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <FieldRenderer
                                schema={p.element}
                                value={item}
                                onChange={(v) => updateItem(i, v)}
                                labelPath={p.labelPath}
                                fieldKey={`item_${i}`}
                                tenantId={p.tenantId}
                                activeLocale={p.activeLocale}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

interface ObjectControlProps {
    label: string;
    shape: Record<string, z.ZodType<unknown>>;
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
    labelPath: string[];
    tenantId?: string;
    activeLocale?: LocaleCode;
    testIdBase: string;
}

function ObjectControl(p: ObjectControlProps): ReactElement {
    const fields = Object.keys(p.shape);
    const isRoot = p.testIdBase === "auto-form-root";
    const isInline = fields.length < 2;
    const [open, setOpen] = useState<boolean>(true);

    const handleField = useCallback(
        (key: string, next: unknown): void => {
            const merged = { ...p.value, [key]: next };
            // Strip undefined keys for cleanliness when the field is optional
            // and the user cleared it.
            if (next === undefined) {
                delete merged[key];
            }
            p.onChange(merged);
        },
        [p],
    );

    const body = (
        <div className="flex flex-col gap-3">
            {fields.map((key) => (
                <FieldRenderer
                    key={key}
                    schema={p.shape[key]}
                    value={p.value[key]}
                    onChange={(v) => handleField(key, v)}
                    labelPath={p.labelPath}
                    fieldKey={key}
                    tenantId={p.tenantId}
                    activeLocale={p.activeLocale}
                />
            ))}
        </div>
    );

    if (isRoot) return body;
    if (isInline) return body;

    return (
        <section
            data-testid={`${p.testIdBase}-object`}
            className="rounded-xl border border-(--card-border) bg-(--card-bg)"
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid={`${p.testIdBase}-toggle`}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
                <span className="text-sm font-semibold">{p.label}</span>
                {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
            </button>
            {open && (
                <div className="border-t border-(--card-border) px-3 py-3">{body}</div>
            )}
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Breakpoint adornment                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface BreakpointAdornmentProps {
    fieldKey: string;
    fieldKind: FieldShape["kind"];
    instance: SectionInstance;
    onInstanceChange: (next: SectionInstance) => void;
    activeBreakpoint: Breakpoint;
}

const BP_ORDER: Breakpoint[] = ["mobile", "tablet", "desktop"];

function BpIcon({
    breakpoint,
    className,
}: {
    breakpoint: Breakpoint;
    className?: string;
}): ReactElement {
    const cls = cn("h-3.5 w-3.5", className);
    if (breakpoint === "mobile") return <SmartphoneIcon className={cls} aria-hidden="true" />;
    if (breakpoint === "tablet") return <TabletIcon className={cls} aria-hidden="true" />;
    return <MonitorIcon className={cls} aria-hidden="true" />;
}

function BreakpointAdornment(p: BreakpointAdornmentProps): ReactElement {
    const [openBp, setOpenBp] = useState<Breakpoint | null>(null);

    const baseValue = (p.instance.base as Record<string, unknown>)?.[p.fieldKey];

    const handleToggle = useCallback(
        (bp: Breakpoint): void => {
            // Open the per-breakpoint editor whether or not an override
            // already exists — clicking again toggles it back closed.
            setOpenBp((cur) => (cur === bp ? null : bp));
        },
        [],
    );

    const handleSet = useCallback(
        (bp: Breakpoint, value: unknown): void => {
            p.onInstanceChange(
                setBreakpointOverride(p.instance, bp, p.fieldKey, value),
            );
        },
        [p],
    );

    const handleClear = useCallback(
        (bp: Breakpoint): void => {
            p.onInstanceChange(
                clearBreakpointOverride(p.instance, bp, p.fieldKey),
            );
            setOpenBp(null);
        },
        [p],
    );

    return (
        <div
            data-testid={`bp-adornment-${p.fieldKey}`}
            className="flex flex-col gap-1"
        >
            <div className="flex items-center justify-end gap-1">
                {BP_ORDER.map((bp) => {
                    const hasOverride = hasBreakpointOverride(p.instance, bp, p.fieldKey);
                    const isActive = p.activeBreakpoint === bp;
                    const isOpen = openBp === bp;
                    return (
                        <button
                            key={bp}
                            type="button"
                            data-testid={`bp-adornment-${p.fieldKey}-${bp}`}
                            data-has-override={hasOverride ? "true" : "false"}
                            aria-pressed={isOpen}
                            aria-label={`${bp} override for ${p.fieldKey}`}
                            onClick={() => handleToggle(bp)}
                            className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                                hasOverride
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-(--card-border) bg-(--card-bg) text-muted-foreground hover:text-foreground",
                                isOpen && "ring-2 ring-primary/30",
                                isActive && !hasOverride && "text-foreground",
                            )}
                            title={
                                hasOverride
                                    ? `${bp} override active`
                                    : `Add ${bp} override`
                            }
                        >
                            <BpIcon breakpoint={bp} />
                        </button>
                    );
                })}
            </div>
            {openBp && (
                <BreakpointOverrideEditor
                    breakpoint={openBp}
                    fieldKey={p.fieldKey}
                    fieldKind={p.fieldKind}
                    baseValue={baseValue}
                    currentValue={getBreakpointOverride(p.instance, openBp, p.fieldKey)}
                    onSet={(v) => handleSet(openBp, v)}
                    onClear={() => handleClear(openBp)}
                />
            )}
        </div>
    );
}

interface BreakpointOverrideEditorProps {
    breakpoint: Breakpoint;
    fieldKey: string;
    fieldKind: FieldShape["kind"];
    baseValue: unknown;
    currentValue: unknown;
    onSet: (value: unknown) => void;
    onClear: () => void;
}

function BreakpointOverrideEditor(p: BreakpointOverrideEditorProps): ReactElement {
    const isSet = p.currentValue !== undefined;

    let editor: ReactElement;
    switch (p.fieldKind) {
        case "string":
            editor = (
                <input
                    type="text"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-input`}
                    defaultValue={(p.currentValue as string | undefined) ?? ""}
                    placeholder={
                        typeof p.baseValue === "string" ? p.baseValue : ""
                    }
                    onBlur={(e) => {
                        const v = e.target.value;
                        if (v.length === 0) {
                            p.onClear();
                        } else {
                            p.onSet(v);
                        }
                    }}
                    className="w-full rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            );
            break;
        case "number":
            editor = (
                <input
                    type="number"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-input`}
                    defaultValue={(p.currentValue as number | undefined) ?? ""}
                    onBlur={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                            p.onClear();
                            return;
                        }
                        const n = Number(v);
                        if (Number.isFinite(n)) p.onSet(n);
                    }}
                    className="w-full rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            );
            break;
        case "boolean":
            editor = (
                <button
                    type="button"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-toggle`}
                    onClick={() => p.onSet(!Boolean(p.currentValue ?? p.baseValue))}
                    className="rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs font-semibold"
                >
                    {String(p.currentValue ?? p.baseValue ?? false)}
                </button>
            );
            break;
        case "i18n_string": {
            const cur = (p.currentValue as Record<string, string> | undefined) ?? {};
            editor = (
                <input
                    type="text"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-i18n-en`}
                    defaultValue={cur.en ?? ""}
                    placeholder={
                        (p.baseValue as Record<string, string> | undefined)?.en ?? ""
                    }
                    onBlur={(e) => {
                        const v = e.target.value;
                        if (v.length === 0) {
                            p.onClear();
                        } else {
                            p.onSet({ ...cur, en: v });
                        }
                    }}
                    className="w-full rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            );
            break;
        }
        default:
            editor = (
                <span className="text-[11px] text-muted-foreground">
                    Override unavailable for this field type.
                </span>
            );
    }

    return (
        <div
            data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}`}
            className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2"
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {p.breakpoint} override
                </span>
                {isSet && (
                    <button
                        type="button"
                        data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-clear`}
                        onClick={p.onClear}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        Use base value
                    </button>
                )}
            </div>
            {editor}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Re-exports                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export { X as AutoFormCloseIcon };
