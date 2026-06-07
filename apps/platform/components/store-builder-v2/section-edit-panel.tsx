"use client";

// =====================================================================
// SectionEditPanel — right-rail editor for a single SectionInstance
// =====================================================================
// Replaces the SectionListPanel in the editor shell when a merchant
// picks "Edit" on a section row. Drives the schema-based AutoForm and
// owns the small "instance metadata" controls (label rename, enabled
// toggle) above the auto-generated form.
//
// Variants UI is intentionally stubbed (Agent J will build the editor).
// =====================================================================

import { useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
    BookOpen,
    FileText,
    Grid3X3,
    Image as ImageIcon,
    Layout,
    ShieldCheck,
    Target,
    X,
} from "lucide-react";
import type {
    AudienceSegment,
    Experiment,
    LocaleCode,
    SectionInstance,
    Variant,
    VariantCondition,
    VisibilityRule,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import {
    getManifestEntry,
    type SectionCategory,
} from "@/lib/sections-manifest";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { summarizeVariantConditions } from "@/lib/variant-summary";
import { AutoForm } from "./auto-form";
import { BlockLayersPanel } from "./block-layers-panel";
import { VariantList, rewritePriorities } from "./variant-list";
import {
    VariantAddWizard,
    type VariantKind,
} from "./variant-add-wizard";
import { VariantEditor } from "./variant-editor";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface SectionEditPanelProps {
    instance: SectionInstance;
    onChange: (next: SectionInstance) => void;
    onClose: () => void;
    /** Tenant id — forwarded to upload-capable AutoForm fields. */
    tenantId?: string;
    /** Experiments referenceable by ab_test variants. */
    experiments?: Experiment[];
    /** Audience segments referenceable by audience variants. */
    segments?: AudienceSegment[];
    /**
     * Active editor locale (from the toolbar). Drives which locale is
     * expanded by default in all I18nStringInput controls underneath.
     */
    activeLocale?: LocaleCode;
    /**
     * Active editor breakpoint (from the toolbar). Drives which
     * breakpoint icon is highlighted in the per-field adornment strip.
     */
    activeBreakpoint?: "mobile" | "tablet" | "desktop";
    /**
     * When `true` the panel renders WITHOUT the aside / fixed width
     * wrapper, so it can be embedded inline below a section row in the
     * Inspector "Blocks" tab. Defaults to false to preserve the
     * stand-alone rail behaviour used by existing tests.
     */
    inline?: boolean;
    /**
     * Fired when the merchant clicks a row in the Layers strip. The
     * parent (typically the editor shell) responds by routing to inline
     * edit on the matching canvas element.
     */
    onEditLayer?: (info: { field?: string; layerId?: string; el: HTMLElement }) => void;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Category icon                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function CategoryIcon({
    category,
    className,
}: {
    category: SectionCategory | "unknown";
    className?: string;
}): ReactElement {
    const cls = cn("h-4 w-4 shrink-0", className);
    switch (category) {
        case "hero":
            return <ImageIcon className={cls} aria-hidden="true" />;
        case "trust":
            return <ShieldCheck className={cls} aria-hidden="true" />;
        case "products":
            return <Grid3X3 className={cls} aria-hidden="true" />;
        case "story":
            return <BookOpen className={cls} aria-hidden="true" />;
        case "content":
            return <FileText className={cls} aria-hidden="true" />;
        case "conversion":
            return <Target className={cls} aria-hidden="true" />;
        case "page":
            return <Layout className={cls} aria-hidden="true" />;
        default:
            return <Layout className={cls} aria-hidden="true" />;
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Panel                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export function SectionEditPanel(props: SectionEditPanelProps): ReactElement {
    const {
        instance,
        onChange,
        onClose,
        tenantId,
        experiments = [],
        segments = [],
        activeLocale,
        activeBreakpoint,
        inline = false,
        onEditLayer,
    } = props;

    const locale = useResolvedEditorLocale(activeLocale);

    const [wizardOpen, setWizardOpen] = useState<boolean>(false);
    const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
    const [visibilityWizardKind, setVisibilityWizardKind] = useState<VariantKind | null>(null);

    const manifest = useMemo(() => getManifestEntry(instance.type), [instance.type]);
    const sectionName = manifest?.name.en ?? instance.type;
    const category: SectionCategory | "unknown" = manifest?.category ?? "unknown";

    const handleLabelChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>): void => {
            onChange({ ...instance, label: e.target.value });
        },
        [instance, onChange],
    );

    const handleEnabledToggle = useCallback((): void => {
        onChange({ ...instance, enabled: !instance.enabled });
    }, [instance, onChange]);

    const handleBaseChange = useCallback(
        (nextBase: unknown): void => {
            onChange({ ...instance, base: nextBase as Record<string, unknown> });
        },
        [instance, onChange],
    );

    const handleVariantsChange = useCallback(
        (variants: Variant[]): void => {
            onChange({ ...instance, variants });
        },
        [instance, onChange],
    );

    const handleVariantAdded = useCallback(
        (variant: Variant): void => {
            const next = [variant, ...(instance.variants ?? [])];
            onChange({ ...instance, variants: rewritePriorities(next) });
            setEditingVariantId(variant.id);
        },
        [instance, onChange],
    );

    const handleSingleVariantChange = useCallback(
        (next: Variant): void => {
            const list = (instance.variants ?? []).map((v) =>
                v.id === next.id ? next : v,
            );
            onChange({ ...instance, variants: list });
        },
        [instance, onChange],
    );

    const handleVisibilityAdd = useCallback(
        (rule: VisibilityRule): void => {
            const next = [...(instance.visibility ?? []), rule];
            onChange({ ...instance, visibility: next });
        },
        [instance, onChange],
    );

    const handleVisibilityRemove = useCallback(
        (idx: number): void => {
            const next = (instance.visibility ?? []).filter((_, i) => i !== idx);
            onChange({
                ...instance,
                visibility: next.length > 0 ? next : undefined,
            });
        },
        [instance, onChange],
    );

    const editingVariant =
        editingVariantId !== null
            ? (instance.variants ?? []).find((v) => v.id === editingVariantId) ?? null
            : null;

    const Wrapper: React.ElementType = inline ? "div" : "aside";
    const wrapperClass = inline
        ? "flex flex-col"
        : "flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-(--card-border) bg-(--card-bg)";

    return (
        <Wrapper
            aria-label={`Edit section ${sectionName}`}
            data-testid="section-edit-panel"
            className={wrapperClass}
        >
            {!inline && (
                <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-(--card-border) px-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <CategoryIcon category={category} className="text-muted-foreground" />
                        <span className="truncate text-sm font-semibold tracking-tight">
                            {sectionName}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label={t(STRINGS.section_edit.close, locale)}
                        data-testid="section-edit-panel-close"
                        onClick={onClose}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>
            )}

            {/* Body */}
            <div className={inline ? "p-3" : "flex-1 overflow-y-auto p-3"}>
                {/* Section metadata */}
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="section-edit-panel-label">
                            {t(STRINGS.section_edit.label_field, locale)}
                        </label>
                        <input
                            id="section-edit-panel-label"
                            type="text"
                            data-testid="section-edit-panel-label"
                            value={instance.label ?? ""}
                            placeholder={tFormat(STRINGS.section_edit.label_placeholder, locale, { name: sectionName })}
                            onChange={handleLabelChange}
                            className={cn(
                                "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                            )}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            {t(STRINGS.section_edit.label_hint, locale)}
                        </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) px-3 py-2.5">
                        <div>
                            <label className="text-sm font-medium" htmlFor="section-edit-panel-enabled">
                                {t(STRINGS.section_edit.enabled_field, locale)}
                            </label>
                            <p className="text-[11px] text-muted-foreground">
                                {t(STRINGS.section_edit.enabled_hint, locale)}
                            </p>
                        </div>
                        <button
                            id="section-edit-panel-enabled"
                            type="button"
                            role="switch"
                            aria-checked={instance.enabled}
                            data-testid="section-edit-panel-enabled"
                            onClick={handleEnabledToggle}
                            className={cn(
                                "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                                instance.enabled ? "bg-primary" : "bg-muted",
                            )}
                        >
                            <span
                                className={cn(
                                    "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                                    instance.enabled ? "translate-x-[18px]" : "translate-x-0.5",
                                )}
                            />
                        </button>
                    </div>
                </div>

                <div className="my-4 h-px bg-(--card-border)" />

                {/* Layers strip — sub-element selection within this section */}
                <section
                    data-testid="section-edit-panel-layers"
                    className="mb-3"
                >
                    <BlockLayersPanel
                        sectionId={instance.id}
                        onEditLayer={onEditLayer}
                    />
                </section>

                <div className="my-3 h-px bg-(--card-border)" />

                {/* Base properties — auto-form */}
                <section data-testid="section-edit-panel-base">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                        {t(STRINGS.section_edit.tab_properties, locale)}
                    </h3>
                    {manifest ? (
                        <AutoForm
                            schema={manifest.schema}
                            value={instance.base}
                            onChange={handleBaseChange}
                            tenantId={tenantId}
                            activeLocale={activeLocale}
                            sectionType={instance.type}
                            sectionInstance={instance}
                            onInstanceChange={onChange}
                            activeBreakpoint={activeBreakpoint}
                        />
                    ) : (
                        <div
                            data-testid="section-edit-panel-missing-schema"
                            className="rounded-xl border border-dashed border-(--card-border) p-3 text-[11px] text-muted-foreground"
                        >
                            {tFormat(STRINGS.section_edit.missing_schema, locale, { type: instance.type })}
                        </div>
                    )}
                </section>

                <div className="my-4 h-px bg-(--card-border)" />

                {/* Visibility */}
                <section data-testid="section-edit-panel-visibility">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                        {t(STRINGS.section_edit.tab_visibility, locale)}
                    </h3>
                    {(instance.visibility?.length ?? 0) === 0 ? (
                        <p
                            data-testid="section-edit-panel-visibility-empty"
                            className="rounded-xl border border-dashed border-(--card-border) p-3 text-[11px] text-muted-foreground"
                        >
                            {t(STRINGS.section_edit.visibility_empty, locale)}
                        </p>
                    ) : (
                        <ul
                            data-testid="section-edit-panel-visibility-chips"
                            className="flex flex-wrap gap-1.5"
                        >
                            {(instance.visibility ?? []).map((rule, i) => (
                                <li key={`${rule.kind}-${i}`}>
                                    <span
                                        data-testid={`section-edit-panel-visibility-chip-${i}`}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-foreground"
                                    >
                                        {summarizeVariantConditions([rule], locale, { segments, experiments })}
                                        <button
                                            type="button"
                                            aria-label={`Remove ${rule.kind} rule`}
                                            data-testid={`section-edit-panel-visibility-chip-${i}-remove`}
                                            onClick={() => handleVisibilityRemove(i)}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" aria-hidden="true" />
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div
                        className="mt-2 flex flex-wrap gap-1.5"
                        data-testid="section-edit-panel-visibility-actions"
                    >
                        {(
                            [
                                "locale",
                                "breakpoint",
                                "time_window",
                                "audience",
                                "governorate",
                                "page",
                            ] as const
                        ).map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                data-testid={`section-edit-panel-visibility-add-${kind}`}
                                onClick={() => setVisibilityWizardKind(kind)}
                                className="inline-flex h-7 items-center rounded-full border border-(--card-border) bg-(--card-bg) px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            >
                                + {t(STRINGS.section_edit[VISIBILITY_KIND_KEY[kind]], locale)}
                            </button>
                        ))}
                    </div>
                </section>

                <div className="my-4 h-px bg-(--card-border)" />

                {/* Variants */}
                <div data-testid="section-edit-panel-variants">
                    <VariantList
                        instance={instance}
                        onChange={handleVariantsChange}
                        onAdd={() => setWizardOpen(true)}
                        onEdit={(id) => setEditingVariantId(id)}
                    />
                </div>
            </div>

            {/* Add-variant wizard */}
            <VariantAddWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onAdd={handleVariantAdded}
                existingVariantCount={instance.variants?.length ?? 0}
                experiments={experiments}
                segments={segments}
            />

            {/* Add-visibility-rule wizard (reuses the variant wizard in
                addConditionMode so the UX matches). */}
            {visibilityWizardKind && (
                <VariantAddWizard
                    open
                    onClose={() => setVisibilityWizardKind(null)}
                    onAdd={() => {
                        /* unused in addConditionMode */
                    }}
                    existingVariantCount={0}
                    experiments={experiments}
                    segments={segments}
                    addConditionMode={{
                        kind: visibilityWizardKind,
                        onAddCondition: (c: VariantCondition) => {
                            // Only the 6 visibility-eligible kinds reach here
                            // (the buttons filter the kind set).
                            handleVisibilityAdd(c as VisibilityRule);
                            setVisibilityWizardKind(null);
                        },
                    }}
                />
            )}

            {/* Per-variant editor */}
            {editingVariant && manifest && (
                <VariantEditor
                    open
                    variant={editingVariant}
                    schema={manifest.schema}
                    base={instance.base}
                    onChange={handleSingleVariantChange}
                    onClose={() => setEditingVariantId(null)}
                    experiments={experiments}
                    segments={segments}
                    tenantId={tenantId}
                    activeLocale={activeLocale}
                />
            )}
        </Wrapper>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Visibility helpers                                                   */
/* ─────────────────────────────────────────────────────────────────── */

const VISIBILITY_KIND_LABEL: Record<
    "locale" | "breakpoint" | "time_window" | "audience" | "governorate" | "page",
    string
> = {
    locale: "Language",
    breakpoint: "Device",
    time_window: "Schedule",
    audience: "Segment",
    governorate: "Governorate",
    page: "Page",
};

const VISIBILITY_KIND_KEY: Record<
    "locale" | "breakpoint" | "time_window" | "audience" | "governorate" | "page",
    "visibility_kind_locale" | "visibility_kind_breakpoint" | "visibility_kind_time_window" | "visibility_kind_audience" | "visibility_kind_governorate" | "visibility_kind_page"
> = {
    locale: "visibility_kind_locale",
    breakpoint: "visibility_kind_breakpoint",
    time_window: "visibility_kind_time_window",
    audience: "visibility_kind_audience",
    governorate: "visibility_kind_governorate",
    page: "visibility_kind_page",
};

