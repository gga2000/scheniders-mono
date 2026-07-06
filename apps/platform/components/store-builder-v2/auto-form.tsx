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
    RotateCcw,
    X,
} from "lucide-react";
import { z } from "zod";
import type { Breakpoint, LocaleCode, SectionInstance } from "@scheniders/shared";
import {
    FIELD_GROUPS_ORDER,
    getFieldGroup,
    hasFieldGroups,
    isFieldVisible,
    type FieldGroup,
} from "@/lib/section-field-groups";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { useEditorMode } from "@/lib/editor-mode-context";
import {
    isFieldEnabledBySiblings,
} from "@/lib/section-field-meta";
import { getManifestEntry } from "@/lib/sections-manifest";
import {
} from "@/lib/responsive-overrides";
import {
    FieldRenderer,
    type RenderFieldAdornment,
} from "./auto-form-fields";
import { BreakpointAdornment } from "./auto-form-breakpoints";
import { unwrap, type FieldShape } from "./auto-form-schema";

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

    const { mode } = useEditorMode();
    const chromeLocale = useResolvedEditorLocale(activeLocale);

    // Build the per-top-level-field breakpoint adornment renderer.
    // Skipped (returns null) for callers that don't pass instance + active
    // breakpoint, so existing flat-render call sites stay byte-identical.
    // Simple mode never shows breakpoint adornments — per-device overrides
    // are an Advanced concern.
    const renderAdornment = useMemo<RenderFieldAdornment | undefined>(() => {
        if (mode !== "advanced") return undefined;
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
    }, [mode, sectionInstance, onInstanceChange, activeBreakpoint]);

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
            // Simple mode drops logic-group fields (and per-section
            // overrides) entirely — the whole Logic accordion disappears
            // because its bucket stays empty.
            if (!isFieldVisible(mode, sectionType, key)) continue;
            buckets[getFieldGroup(sectionType, key)].push(key);
        }
        return { shape, buckets };
    }, [schema, sectionType, mode]);

    // C2: section-level "Reset to default". Defaults come from the section's
    // own definition (zero drift via the manifest). Shown only when the current
    // props actually differ from the defaults. Reset is undoable (the caller
    // routes through setConfig), so no confirm dialog is needed.
    const sectionDefaults = useMemo<Record<string, unknown> | undefined>(() => {
        if (!sectionType) return undefined;
        const d = getManifestEntry(sectionType)?.defaultProps as
            | Record<string, unknown>
            | undefined;
        return d;
    }, [sectionType]);
    const dirtyVsDefault = useMemo<boolean>(() => {
        if (!sectionDefaults) return false;
        try {
            return JSON.stringify(value) !== JSON.stringify(sectionDefaults);
        } catch {
            return false;
        }
    }, [sectionDefaults, value]);
    const resetHeader =
        sectionDefaults && dirtyVsDefault ? (
            <div className="flex justify-end">
                <button
                    type="button"
                    data-testid="auto-form-reset-default"
                    title={tx(STRINGS.auto_form.reset_title, chromeLocale)}
                    onClick={() =>
                        onChange(
                            // Clone so callers can't mutate the shared default.
                            JSON.parse(JSON.stringify(sectionDefaults)) as T,
                        )
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    {tx(STRINGS.auto_form.reset, chromeLocale)}
                </button>
            </div>
        ) : null;

    if (grouped) {
        return (
            <>
                {resetHeader}
                <GroupedFormRenderer
                    shape={grouped.shape}
                    buckets={grouped.buckets}
                    value={value as unknown as Record<string, unknown>}
                    onChange={(next) => onChange(next as T)}
                    tenantId={tenantId}
                    activeLocale={activeLocale ?? "en"}
                    renderAdornment={renderAdornment}
                />
            </>
        );
    }

    return (
        <>
            {resetHeader}
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
        </>
    );
}


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
                            {fields
                                // UX-18: dependents of a "<base>_kind" enum hide
                                // while the kind is "none" — evaluated per render
                                // so flipping the kind reveals them instantly.
                                .filter((key) => isFieldEnabledBySiblings(key, p.value))
                                .map((key) => (
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
/* Re-exports                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export { X as AutoFormCloseIcon };
