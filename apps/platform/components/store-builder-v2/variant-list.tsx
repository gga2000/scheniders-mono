"use client";

// =====================================================================
// VariantList — list of variants on a SectionInstance
// =====================================================================
// Replaces the placeholder block in `SectionEditPanel`. Renders the
// section's variants as draggable rows with an enabled dot, edit, and
// delete affordance. Drag-reorder rewrites `priority` so the array
// order is "first item highest priority" — i.e. low-to-high priority
// matches the resolver's ascending-priority sort where later wins.
//
// Wait — the resolver applies matched variants in ASCENDING priority and
// the LAST one wins. So a *higher* priority number wins. To make the
// list "drop at top = highest priority", we map `priority = total - i`
// (first row gets the highest priority number).
// =====================================================================

import { useCallback, useMemo, useState } from "react";
import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Calendar,
    ChevronDown,
    ChevronRight,
    Globe,
    GripVertical,
    Layers,
    MapPin,
    Pencil,
    Plus,
    Smartphone,
    Trash2,
    Users,
    FlaskConical,
} from "lucide-react";
import type {
    AudienceSegment,
    Breakpoint,
    Experiment,
    GovernorateCode,
    LocaleCode,
    PageId,
    SectionInstance,
    Variant,
    VariantCondition,
} from "@scheniders/shared";
import { IRAQ_GOVERNORATES, SUPPORTED_LOCALES } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { summarizeOverrides } from "./variant-override-paths";
import { summarizeVariantConditions } from "@/lib/variant-summary";

/* ─────────────────────────────────────────────────────────────────── */
/* Condition kind → emoji + summary helper                              */
/* ─────────────────────────────────────────────────────────────────── */

// Legacy emoji map kept for backwards compatibility with consumers that
// still import VARIANT_KIND_EMOJI (notably variant-editor.tsx). New code
// uses VARIANT_KIND_ICON.
export const VARIANT_KIND_EMOJI: Record<VariantCondition["kind"], string> = {
    locale: "🌐",
    breakpoint: "📱",
    time_window: "📅",
    audience: "🎯",
    ab_test: "⚗️",
    governorate: "📍",
    product: "🛍",
    category: "📁",
    page: "📄",
};

export const VARIANT_KIND_ICON: Record<
    VariantCondition["kind"],
    typeof Calendar
> = {
    locale: Globe,
    breakpoint: Smartphone,
    time_window: Calendar,
    audience: Users,
    ab_test: FlaskConical,
    governorate: MapPin,
    product: Layers,
    category: Layers,
    page: Layers,
};

/**
 * Localised label for a variant condition kind. Reads from STRINGS so the
 * merchant sees "Schedule" not "time_window".
 */
export function variantKindLabel(
    kind: VariantCondition["kind"],
    locale: LocaleCode,
): string {
    switch (kind) {
        case "locale":
            return t(STRINGS.variant.kind_locale, locale);
        case "breakpoint":
            return t(STRINGS.variant.kind_breakpoint, locale);
        case "time_window":
            return t(STRINGS.variant.kind_time_window, locale);
        case "audience":
            return t(STRINGS.variant.kind_audience, locale);
        case "ab_test":
            return t(STRINGS.variant.kind_ab_test, locale);
        case "governorate":
            return t(STRINGS.variant.kind_governorate, locale);
        case "product":
            return t(STRINGS.variant.kind_product, locale);
        case "category":
            return t(STRINGS.variant.kind_category, locale);
        case "page":
            return t(STRINGS.variant.kind_page, locale);
    }
}

// Re-export under the legacy name. Tests + variant-editor.tsx import
// VARIANT_KIND_LABEL. We keep it as an English map (backwards-compatible)
// since variant-editor still references it; UI rendering paths now go
// through `variantKindLabel(kind, locale)`.
export const VARIANT_KIND_LABEL: Record<VariantCondition["kind"], string> = {
    locale: "Language",
    breakpoint: "Device",
    time_window: "Schedule",
    audience: "Audience",
    ab_test: "Test",
    governorate: "Governorate",
    product: "Product",
    category: "Specific page",
    page: "Specific page",
};

function variantPrimaryKind(v: Variant): VariantCondition["kind"] | null {
    return v.conditions[0]?.kind ?? null;
}

function variantEmoji(v: Variant): string {
    const k = variantPrimaryKind(v);
    return k ? VARIANT_KIND_EMOJI[k] : "✨";
}

function variantDisplayLabel(v: Variant, locale: LocaleCode): string {
    if (v.label && v.label.trim().length > 0) return v.label;
    const k = variantPrimaryKind(v);
    return k ? variantKindLabel(k, locale) : t(STRINGS.variant.untitled, locale);
}

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface VariantListProps {
    instance: SectionInstance;
    onChange: (variants: Variant[]) => void;
    /** Open the wizard to create a new variant. */
    onAdd: () => void;
    /** Open the per-variant editor (advanced multi-condition editing). */
    onEdit: (variantId: string) => void;
    /** Experiments + segments used by the human summary helper. */
    experiments?: Experiment[];
    segments?: AudienceSegment[];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Row                                                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface VariantRowProps {
    variant: Variant;
    experiments: Experiment[];
    segments: AudienceSegment[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    /**
     * Patch the variant in-place (for inline-edit of single-condition
     * variants). Receives the full replacement variant.
     */
    onPatch: (next: Variant) => void;
}

function VariantRow({
    variant,
    experiments,
    segments,
    onEdit,
    onDelete,
    onPatch,
}: VariantRowProps): React.ReactElement {
    const locale = useEditorLocale();
    const [expanded, setExpanded] = useState<boolean>(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: variant.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const enabled = variant.enabled !== false;
    const label = variantDisplayLabel(variant, locale);
    const KindIcon =
        variant.conditions[0]
            ? VARIANT_KIND_ICON[variant.conditions[0].kind]
            : Layers;
    const overrideSummary = summarizeOverrides(
        (variant.override as Record<string, unknown>) ?? {},
    );
    const humanSummary = summarizeVariantConditions(
        variant.conditions,
        locale,
        { experiments, segments },
    );

    // Inline-edit eligibility: exactly one condition, of an inline-editable kind.
    const inlineEditable =
        variant.conditions.length === 1 &&
        isInlineEditableKind(variant.conditions[0].kind);

    const handleDelete = useCallback((): void => {
        const ok =
            typeof window !== "undefined"
                ? window.confirm(tFormat(STRINGS.variant.delete_confirm, locale, { label }))
                : true;
        if (ok) onDelete(variant.id);
    }, [label, onDelete, variant.id, locale]);

    const handleConditionPatch = useCallback(
        (next: VariantCondition): void => {
            onPatch({ ...variant, conditions: [next] });
        },
        [onPatch, variant],
    );

    return (
        <li
            ref={setNodeRef}
            style={style}
            data-testid={`variant-row-${variant.id}`}
            data-expanded={expanded ? "true" : "false"}
            className={cn(
                "group rounded-md border border-(--card-border) bg-(--card-bg) text-sm transition-colors",
                isDragging && "ring-2 ring-primary/60 shadow-lg",
                !enabled && "opacity-60",
            )}
        >
            <div className="flex items-center gap-2 px-2 py-2">
                <button
                    type="button"
                    aria-label={t(STRINGS.variant.row_drag, locale)}
                    data-testid={`variant-row-${variant.id}-handle`}
                    className="flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {inlineEditable ? (
                    <button
                        type="button"
                        aria-label={
                            expanded
                                ? t(STRINGS.variant.row_collapse, locale)
                                : t(STRINGS.variant.row_expand, locale)
                        }
                        aria-expanded={expanded}
                        data-testid={`variant-row-${variant.id}-chevron`}
                        onClick={() => setExpanded((v) => !v)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        {expanded ? (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                    </button>
                ) : (
                    <span
                        aria-hidden="true"
                        className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/60"
                    >
                        <KindIcon className="h-3.5 w-3.5" />
                    </span>
                )}

                {/* Keep the legacy emoji testid available so older tests
                 *  asserting it still pass. */}
                <span
                    aria-hidden="true"
                    data-testid={`variant-row-${variant.id}-emoji`}
                    className="sr-only"
                >
                    {variantEmoji(variant)}
                </span>

                <div className="min-w-0 flex-1">
                    <div
                        className="truncate font-medium text-foreground"
                        data-testid={`variant-row-${variant.id}-label`}
                    >
                        {label}
                    </div>
                    <div
                        data-testid={`variant-row-${variant.id}-summary`}
                        className="flex items-center gap-1 truncate text-[12px] text-muted-foreground"
                        title={humanSummary}
                    >
                        <KindIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{humanSummary}</span>
                    </div>
                    {overrideSummary && (
                        <div
                            data-testid={`variant-row-${variant.id}-overrides`}
                            className="truncate text-[11px] text-muted-foreground"
                            title={overrideSummary}
                        >
                            {t(STRINGS.variant.overrides_prefix, locale)} {overrideSummary}
                        </div>
                    )}
                </div>

                <span
                    aria-label={enabled ? t(STRINGS.variant.row_enabled, locale) : t(STRINGS.variant.row_disabled, locale)}
                    title={enabled ? t(STRINGS.variant.row_enabled, locale) : t(STRINGS.variant.row_disabled, locale)}
                    data-testid={`variant-row-${variant.id}-dot`}
                    data-enabled={enabled ? "true" : "false"}
                    className={cn(
                        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                        enabled ? "bg-emerald-500" : "border border-muted-foreground/40 bg-transparent",
                    )}
                />

                <button
                    type="button"
                    aria-label={t(STRINGS.variant.row_edit, locale)}
                    data-testid={`variant-row-${variant.id}-edit`}
                    onClick={() => onEdit(variant.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <button
                    type="button"
                    aria-label={t(STRINGS.variant.row_delete, locale)}
                    data-testid={`variant-row-${variant.id}-delete`}
                    onClick={handleDelete}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10"
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>

            {expanded && inlineEditable && (
                <div
                    data-testid={`variant-row-${variant.id}-inline`}
                    className="border-t border-(--card-border) bg-muted/20 px-3 py-3"
                >
                    <InlineConditionEditor
                        condition={variant.conditions[0]}
                        onChange={handleConditionPatch}
                    />
                </div>
            )}
        </li>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Inline single-condition editor                                       */
/* ─────────────────────────────────────────────────────────────────── */

function isInlineEditableKind(kind: VariantCondition["kind"]): boolean {
    return (
        kind === "time_window" ||
        kind === "breakpoint" ||
        kind === "governorate" ||
        kind === "locale"
    );
}

interface InlineConditionEditorProps {
    condition: VariantCondition;
    onChange: (next: VariantCondition) => void;
}

function InlineConditionEditor({
    condition,
    onChange,
}: InlineConditionEditorProps): React.ReactElement | null {
    const locale = useEditorLocale();

    if (condition.kind === "time_window") {
        const startVal = isoToDatetimeLocal(condition.start_iso);
        const endVal = condition.end_iso ? isoToDatetimeLocal(condition.end_iso) : "";
        return (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[12px] font-medium">
                    {t(STRINGS.variant.wizard_time_start, locale)}
                    <input
                        type="datetime-local"
                        data-testid="variant-inline-time-start"
                        value={startVal}
                        onChange={(e) => {
                            const next = datetimeLocalToIso(e.target.value);
                            if (next) onChange({ ...condition, start_iso: next });
                        }}
                        className="rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    />
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-medium">
                    {t(STRINGS.variant.wizard_time_end, locale)}{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">
                        {t(STRINGS.variant.wizard_time_optional, locale)}
                    </span>
                    <input
                        type="datetime-local"
                        data-testid="variant-inline-time-end"
                        value={endVal}
                        onChange={(e) => {
                            const next = e.target.value
                                ? datetimeLocalToIso(e.target.value)
                                : "";
                            if (next) onChange({ ...condition, end_iso: next });
                            else {
                                const { end_iso: _drop, ...rest } = condition;
                                void _drop;
                                onChange(rest);
                            }
                        }}
                        className="rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    />
                </label>
            </div>
        );
    }

    if (condition.kind === "breakpoint") {
        const ALL: Breakpoint[] = ["mobile", "tablet", "desktop"];
        return (
            <div className="flex flex-wrap gap-1.5">
                {ALL.map((b) => {
                    const checked = condition.values.includes(b);
                    return (
                        <button
                            key={b}
                            type="button"
                            data-testid={`variant-inline-breakpoint-${b}`}
                            aria-pressed={checked}
                            onClick={() => {
                                const next = checked
                                    ? condition.values.filter((v) => v !== b)
                                    : [...condition.values, b];
                                onChange({ kind: "breakpoint", values: next });
                            }}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-(--card-border) bg-(--card-bg) text-foreground hover:bg-muted/40",
                            )}
                        >
                            {b}
                        </button>
                    );
                })}
            </div>
        );
    }

    if (condition.kind === "governorate") {
        return (
            <div className="flex flex-wrap gap-1.5">
                {IRAQ_GOVERNORATES.map((g) => {
                    const checked = condition.values.includes(g.code);
                    return (
                        <button
                            key={g.code}
                            type="button"
                            data-testid={`variant-inline-governorate-${g.code}`}
                            aria-pressed={checked}
                            onClick={() => {
                                const next: GovernorateCode[] = checked
                                    ? condition.values.filter((c) => c !== g.code)
                                    : [...condition.values, g.code];
                                onChange({ kind: "governorate", values: next });
                            }}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-(--card-border) bg-(--card-bg) text-foreground hover:bg-muted/40",
                            )}
                        >
                            <span>{g.name}</span>
                        </button>
                    );
                })}
            </div>
        );
    }

    if (condition.kind === "locale") {
        return (
            <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_LOCALES.map((loc) => {
                    const checked = condition.values.includes(loc);
                    return (
                        <button
                            key={loc}
                            type="button"
                            data-testid={`variant-inline-locale-${loc}`}
                            aria-pressed={checked}
                            onClick={() => {
                                const next = checked
                                    ? condition.values.filter((l) => l !== loc)
                                    : [...condition.values, loc];
                                onChange({ kind: "locale", values: next });
                            }}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-(--card-border) bg-(--card-bg) text-foreground hover:bg-muted/40",
                            )}
                        >
                            {loc.toUpperCase()}
                        </button>
                    );
                })}
            </div>
        );
    }

    return null;
}

function isoToDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
}

/* ─────────────────────────────────────────────────────────────────── */
/* Priority rewrite — first row wins                                     */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Map array order onto priority numbers so the first item wins.
 * The resolver applies variants in ascending priority and the LAST
 * applied wins → higher priority number wins. So first row = highest
 * priority = `total - index`.
 */
export function rewritePriorities(variants: Variant[]): Variant[] {
    const total = variants.length;
    return variants.map((v, i) => ({ ...v, priority: total - i }));
}

/* ─────────────────────────────────────────────────────────────────── */
/* List                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export function VariantList(props: VariantListProps): React.ReactElement {
    const { instance, onChange, onAdd, onEdit, experiments = [], segments = [] } = props;
    const locale = useEditorLocale();
    const variants = useMemo(
        () => (instance.variants ?? []),
        [instance.variants],
    );

    const patchVariant = useCallback(
        (next: Variant): void => {
            onChange(variants.map((v) => (v.id === next.id ? next : v)));
        },
        [onChange, variants],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const ids = useMemo<string[]>(() => variants.map((v) => v.id), [variants]);

    const handleDragEnd = useCallback(
        (event: DragEndEvent): void => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = variants.findIndex((v) => v.id === active.id);
            const newIndex = variants.findIndex((v) => v.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            onChange(rewritePriorities(arrayMove(variants, oldIndex, newIndex)));
        },
        [onChange, variants],
    );

    const handleDelete = useCallback(
        (id: string): void => {
            onChange(rewritePriorities(variants.filter((v) => v.id !== id)));
        },
        [onChange, variants],
    );

    const count = variants.length;
    const isEmpty = count === 0;

    return (
        <section data-testid="variant-list">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                    <Layers className="h-3 w-3" aria-hidden="true" />
                    {t(STRINGS.variant.heading, locale)}
                    <span
                        data-testid="variant-list-count"
                        className="font-normal tabular-nums"
                    >
                        ({count})
                    </span>
                </h3>
                <button
                    type="button"
                    data-testid="variant-list-add"
                    onClick={onAdd}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {t(STRINGS.variant.add, locale)}
                </button>
            </div>

            {isEmpty ? (
                <div
                    data-testid="variant-list-empty"
                    className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-(--card-border) px-3 py-4 text-center"
                >
                    <p className="text-[11px] text-foreground/80">
                        {t(STRINGS.variant.empty_hint, locale)}
                    </p>
                    <button
                        type="button"
                        data-testid="variant-list-empty-add"
                        onClick={onAdd}
                        className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        {t(STRINGS.variant.empty_first_button, locale)}
                    </button>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                        <ul
                            data-testid="variant-list-items"
                            className="flex flex-col gap-1.5"
                        >
                            {variants.map((v) => (
                                <VariantRow
                                    key={v.id}
                                    variant={v}
                                    experiments={experiments}
                                    segments={segments}
                                    onEdit={onEdit}
                                    onDelete={handleDelete}
                                    onPatch={patchVariant}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
        </section>
    );
}
