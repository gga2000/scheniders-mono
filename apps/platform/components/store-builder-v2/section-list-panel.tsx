"use client";

// =====================================================================
// Section list panel — Schneiders Builder v2 (Inspector "Blocks" tab)
// =====================================================================
// Right-rail panel that shows the active page's section instances in
// visual order. Supports drag-reorder (@dnd-kit), enable/disable,
// duplicate, save-as-preset, delete (toast+undo), and INLINE expansion
// of each row's property editor — no more "replace the list panel"
// model. Selecting a section expands its `SectionEditPanel` inline
// directly below the row.
//
// Reads `config.pages[active_page].sections` from the builder hook and
// writes back via `setConfig`.
// =====================================================================

import { useCallback, useMemo, useRef, useState } from "react";
import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
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
    BookOpen,
    ChevronDown,
    ChevronRight,
    Copy,
    Eye,
    EyeOff,
    FileText,
    Grid3X3,
    GripVertical,
    Image as ImageIcon,
    Layout,
    MoreHorizontal,
    Plus,
    ShieldCheck,
    Bookmark,
    LayoutTemplate,
    Target,
    Trash2,
} from "lucide-react";
import type {
    AudienceSegment,
    Experiment,
    LocaleCode,
    PageId,
    SectionInstance,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import {
    SECTION_CATEGORY_LABELS,
    getManifestEntry,
    type SectionCategory,
} from "@/lib/sections-manifest";
import { toast } from "@/hooks/use-toast";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { SectionEditPanel } from "./section-edit-panel";
import { SavePresetDialog } from "./save-preset-dialog";
import { PageTemplateEmptyState } from "./page-template-empty-state";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface SectionListPanelProps {
    pageId: PageId;
    pageLabel: string;
    sections: SectionInstance[];
    onChange: (next: SectionInstance[]) => void;
    onAdd: () => void;
    /** Optional callback when a row's Edit kebab item is clicked.
     *  Now defaults to expanding inline; the callback is kept for
     *  external listeners (analytics, deep-links). */
    onEditSection?: (id: string) => void;
    /** Id of the section currently selected (canvas overlay or list row). */
    selectedSectionId?: string | null;
    /** Click a row to mark it selected (also asks the iframe to scroll). */
    onSelectSection?: (id: string) => void;
    /** Editor shell can register row elements to scroll them into view. */
    registerRowRef?: (id: string, el: HTMLElement | null) => void;
    /**
     * Opens the page-template picker overlay. When omitted the
     * "+ Start from a template" affordance is hidden — keeps tests that
     * don't care about templates unaffected.
     */
    onStartFromTemplate?: () => void;
    /**
     * Fired with `(sectionId, presetName)` when the merchant picks
     * "Save as preset" on a section's kebab menu. Omitting hides the
     * preset menu item.
     */
    onSaveAsPreset?: (sectionId: string, presetName: string) => void;

    /* ── New props for inline expansion (Inspector model) ──────────── */
    /** Section id whose properties accordion is currently expanded inline. */
    expandedSectionId?: string | null;
    /** Toggle a section's inline expansion. */
    onToggleExpanded?: (id: string) => void;
    /** Tenant id — forwarded to inline SectionEditPanel for upload fields. */
    tenantId?: string;
    /** Active editor locale — forwarded into the inline edit panel. */
    activeLocale?: LocaleCode;
    /**
     * Active editor breakpoint — forwarded to the inline edit panel so
     * its per-field breakpoint adornment highlights the right icon.
     */
    activeBreakpoint?: "mobile" | "tablet" | "desktop";
    /** Experiments — referenced by variants inside the inline panel. */
    experiments?: Experiment[];
    /** Audience segments — referenced by variants inside the inline panel. */
    segments?: AudienceSegment[];
    /**
     * Forwarded to the inline edit panel — invoked when the merchant
     * clicks a row in the Layers strip.
     */
    onEditLayer?: (info: { field?: string; layerId?: string; el: HTMLElement }) => void;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Category icon mapping                                                */
/* ─────────────────────────────────────────────────────────────────── */

function CategoryIcon({
    category,
    className,
}: {
    category: SectionCategory | "unknown";
    className?: string;
}): React.ReactElement {
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
/* Row                                                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface SectionRowProps {
    section: SectionInstance;
    onToggleEnabled: (id: string) => void;
    onEdit: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onSaveAsPreset?: (id: string) => void;
    onSelect?: (id: string) => void;
    selected?: boolean;
    expanded?: boolean;
    registerRowRef?: (id: string, el: HTMLElement | null) => void;
    /** Inline body (the AutoForm + Visibility + Variants) rendered when
     *  the row is expanded. The shell provides this lazily so we don't
     *  mount edit panels we don't need. */
    inlineBody?: React.ReactNode;
    locale: LocaleCode;
}

function SectionRow({
    section,
    onToggleEnabled,
    onEdit,
    onDuplicate,
    onDelete,
    onSaveAsPreset,
    onSelect,
    selected,
    expanded,
    registerRowRef,
    inlineBody,
    locale,
}: SectionRowProps): React.ReactElement {
    const manifest = getManifestEntry(section.type);
    const category: SectionCategory | "unknown" = manifest?.category ?? "unknown";
    const categoryLabel = manifest ? SECTION_CATEGORY_LABELS[manifest.category] : "—";
    const name = manifest?.name.en ?? section.type;
    const displayLabel = section.label?.trim() ? section.label : name;

    const [menuOpen, setMenuOpen] = useState<boolean>(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const closeMenu = useCallback(() => setMenuOpen(false), []);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleDelete = useCallback(() => {
        closeMenu();
        onDelete(section.id);
    }, [closeMenu, onDelete, section.id]);

    const composedRef = useCallback(
        (node: HTMLLIElement | null): void => {
            setNodeRef(node);
            registerRowRef?.(section.id, node);
        },
        [registerRowRef, section.id, setNodeRef],
    );

    return (
        <li
            ref={composedRef}
            style={style}
            data-testid={`section-row-${section.id}`}
            data-selected={selected ? "true" : "false"}
            data-expanded={expanded ? "true" : "false"}
            className={cn(
                "rounded-md border border-(--card-border) bg-(--card-bg) transition-colors",
                isDragging && "ring-2 ring-primary/60 shadow-lg",
                !section.enabled && "opacity-60",
                selected && "ring-2 ring-pink-500/70",
            )}
        >
            <div
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    onSelect?.(section.id);
                    onEdit(section.id);
                }}
                className="group flex items-center gap-2 px-2 py-2 text-sm"
            >
                {/* Drag handle */}
                <button
                    type="button"
                    aria-label={t(STRINGS.section_list.row_drag, locale)}
                    data-testid={`section-row-${section.id}-handle`}
                    className="flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded text-foreground/60 hover:text-foreground"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {/* Expand chevron */}
                <button
                    type="button"
                    aria-label={expanded ? t(STRINGS.section_list.row_collapse, locale) : t(STRINGS.section_list.row_expand, locale)}
                    aria-expanded={expanded}
                    data-testid={`section-row-${section.id}-chevron`}
                    onClick={() => onEdit(section.id)}
                    className="flex h-7 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground"
                >
                    {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                </button>

                {/* Category icon */}
                <CategoryIcon category={category} className="text-foreground/70" />

                {/* Name + tag */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground/80">
                            {displayLabel}
                        </span>
                    </div>
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                        )}
                        data-testid={`section-row-${section.id}-category`}
                    >
                        {categoryLabel}
                    </span>
                </div>

                {/* Enable toggle */}
                <button
                    type="button"
                    aria-label={section.enabled ? t(STRINGS.section_list.row_hide, locale) : t(STRINGS.section_list.row_show, locale)}
                    data-testid={`section-row-${section.id}-toggle`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleEnabled(section.id);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    {section.enabled ? (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                    )}
                </button>

                {/* Kebab menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        aria-label={t(STRINGS.section_list.row_more, locale)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        data-testid={`section-row-${section.id}-menu-trigger`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen((v) => !v);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {menuOpen && (
                        <>
                            {/* Click-outside scrim */}
                            <button
                                type="button"
                                aria-hidden="true"
                                tabIndex={-1}
                                onClick={closeMenu}
                                className="fixed inset-0 z-40 cursor-default"
                            />
                            <div
                                role="menu"
                                data-testid={`section-row-${section.id}-menu`}
                                className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-md border border-(--card-border) bg-(--card-bg) shadow-lg"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-testid={`section-row-${section.id}-edit`}
                                    onClick={() => {
                                        closeMenu();
                                        onEdit(section.id);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted/40"
                                >
                                    {expanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    )}
                                    {expanded ? t(STRINGS.section_list.row_collapse_label, locale) : t(STRINGS.section_list.row_edit_label, locale)}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-testid={`section-row-${section.id}-duplicate`}
                                    onClick={() => {
                                        closeMenu();
                                        onDuplicate(section.id);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted/40"
                                >
                                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t(STRINGS.section_list.row_duplicate, locale)}
                                </button>
                                {onSaveAsPreset && (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-testid={`section-row-${section.id}-save-preset`}
                                        onClick={() => {
                                            closeMenu();
                                            onSaveAsPreset(section.id);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted/40"
                                    >
                                        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                                        {t(STRINGS.section_list.row_save_preset, locale)}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    role="menuitem"
                                    data-testid={`section-row-${section.id}-delete`}
                                    onClick={handleDelete}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                                >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t(STRINGS.section_list.row_delete, locale)}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Inline body: expanded properties editor sits below the row. */}
            {expanded && inlineBody ? (
                <div
                    data-testid={`section-row-${section.id}-inline-body`}
                    className="border-t border-(--card-border) bg-background/60"
                >
                    {inlineBody}
                </div>
            ) : null}
        </li>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Panel                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export function SectionListPanel(props: SectionListPanelProps): React.ReactElement {
    const {
        pageId,
        pageLabel,
        sections,
        onChange,
        onAdd,
        onEditSection,
        selectedSectionId,
        onSelectSection,
        registerRowRef,
        onStartFromTemplate,
        onSaveAsPreset,
        expandedSectionId: expandedFromProps,
        onToggleExpanded,
        tenantId,
        activeLocale,
        activeBreakpoint,
        experiments,
        segments,
        onEditLayer,
    } = props;

    const locale = useResolvedEditorLocale(activeLocale);

    // Local fallback for when the inspector rail doesn't control expansion
    // (e.g. tests that render the panel in isolation).
    const [localExpanded, setLocalExpanded] = useState<string | null>(null);
    const expandedSectionId =
        expandedFromProps !== undefined ? expandedFromProps : localExpanded;

    const handleToggleExpanded = useCallback(
        (id: string): void => {
            if (onToggleExpanded) {
                onToggleExpanded(id);
            } else {
                setLocalExpanded((curr) => (curr === id ? null : id));
            }
            onEditSection?.(id);
        },
        [onToggleExpanded, onEditSection],
    );

    // Sensor stack:
    //   - MouseSensor: 4px distance activation — desktop drag-to-reorder
    //     stays exactly as before.
    //   - TouchSensor: 500ms hold + 8px tolerance — long-press to enter
    //     reorder mode on a phone. Tap-throughs (open kebab, click row)
    //     are unaffected because they fire before the delay elapses.
    //   - KeyboardSensor: arrow-key reorder.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 500, tolerance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const ids = useMemo<string[]>(() => sections.map((s) => s.id), [sections]);

    const handleDragEnd = useCallback(
        (event: DragEndEvent): void => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = sections.findIndex((s) => s.id === active.id);
            const newIndex = sections.findIndex((s) => s.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            onChange(arrayMove(sections, oldIndex, newIndex));
        },
        [onChange, sections],
    );

    const handleToggle = useCallback(
        (id: string): void => {
            onChange(
                sections.map((s) =>
                    s.id === id ? { ...s, enabled: !s.enabled } : s,
                ),
            );
        },
        [onChange, sections],
    );

    const handleDuplicate = useCallback(
        (id: string): void => {
            const idx = sections.findIndex((s) => s.id === id);
            if (idx < 0) return;
            const source = sections[idx];
            const clone: SectionInstance = {
                ...source,
                id: cryptoRandomId(),
                base: deepCloneJson(source.base),
                variants: source.variants
                    ? source.variants.map((v) => ({
                          ...v,
                          override: deepCloneJson(v.override),
                      }))
                    : undefined,
            };
            const next = [...sections];
            next.splice(idx + 1, 0, clone);
            onChange(next);
        },
        [onChange, sections],
    );

    /** Delete with undo via toast — no native confirm. */
    const handleDelete = useCallback(
        (id: string): void => {
            const idx = sections.findIndex((s) => s.id === id);
            if (idx < 0) return;
            const removed = sections[idx];
            const next = sections.filter((s) => s.id !== id);
            onChange(next);
            const manifest = getManifestEntry(removed.type);
            const name =
                removed.label?.trim() || manifest?.name.en || removed.type;
            toast({
                title: tFormat(STRINGS.section_list.toast_deleted, locale, { name }),
                description: t(STRINGS.section_list.toast_undo_hint, locale),
                duration: 5000,
                action: {
                    label: t(STRINGS.section_list.toast_undo, locale),
                    onClick: () => {
                        // Re-insert at the original index.
                        const restored = [...next];
                        restored.splice(idx, 0, removed);
                        onChange(restored);
                    },
                },
            });
        },
        [onChange, sections, locale],
    );

    /* ── Save-as-preset dialog state ───────────────────────────── */
    const [presetDialogFor, setPresetDialogFor] = useState<string | null>(null);

    const handleOpenSavePreset = useCallback((id: string): void => {
        setPresetDialogFor(id);
    }, []);

    const handleConfirmSavePreset = useCallback(
        (name: string): void => {
            if (!presetDialogFor || !onSaveAsPreset) {
                setPresetDialogFor(null);
                return;
            }
            onSaveAsPreset(presetDialogFor, name);
            setPresetDialogFor(null);
        },
        [onSaveAsPreset, presetDialogFor],
    );

    const presetSuggested = useMemo(() => {
        if (!presetDialogFor) return "";
        const sec = sections.find((s) => s.id === presetDialogFor);
        if (!sec) return "";
        return sec.label?.trim() || `${sec.type} preset`;
    }, [presetDialogFor, sections]);

    const count = sections.length;
    const isEmpty = count === 0;

    // Item 1 (Phase 3c): when the page is empty, surface the five
    // curated page templates as a bento grid in this panel. Merchant
    // can dismiss with "Or start blank ↓" to reveal the legacy empty
    // state + add button.
    const [templatesDismissed, setTemplatesDismissed] = useState<boolean>(false);
    const showTemplatesEmptyState = isEmpty && !templatesDismissed;

    return (
        <div
            aria-label={t(STRINGS.section_list.aria_label, locale)}
            data-testid="section-list-panel"
            className="flex flex-1 flex-col overflow-hidden"
        >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-(--card-border) px-3">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold tracking-tight text-foreground">
                        {t(STRINGS.section_list.heading, locale)}
                    </span>
                    <span
                        data-testid="section-list-count"
                        className="text-xs font-medium text-muted-foreground tabular-nums"
                    >
                        ({count})
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {onStartFromTemplate && (
                        <button
                            type="button"
                            data-testid="section-list-templates"
                            onClick={onStartFromTemplate}
                            title={t(STRINGS.section_list.templates_title, locale)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) bg-(--card-bg) px-2 text-xs font-semibold text-foreground/80 transition-colors hover:text-foreground"
                        >
                            <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(STRINGS.section_list.templates_button, locale)}
                        </button>
                    )}
                </div>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3">
                {isEmpty && !templatesDismissed ? (
                    <div data-testid="section-list-empty" className="flex flex-col gap-4">
                        <PageTemplateEmptyState
                            currentSectionCount={count}
                            activeLocale={activeLocale}
                            onStartBlank={() => setTemplatesDismissed(true)}
                            onApply={(next) => {
                                // Defensive: if a stale render leaves the
                                // page non-empty, append rather than wipe.
                                if (sections.length === 0) {
                                    onChange(next);
                                } else {
                                    onChange([...sections, ...next]);
                                }
                                setTemplatesDismissed(false);
                            }}
                        />
                        {/* Hidden trigger preserves the legacy
                            `section-list-empty-add` callback path for
                            external listeners + existing tests. */}
                        <button
                            type="button"
                            data-testid="section-list-empty-add"
                            onClick={onAdd}
                            className="sr-only"
                            aria-hidden="true"
                            tabIndex={-1}
                        >
                            {t(STRINGS.section_list.empty_first_button, locale)}
                        </button>
                    </div>
                ) : isEmpty ? (
                    <div
                        data-testid="section-list-empty"
                        className="mt-6 flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-(--card-border) px-4 py-10 text-center"
                    >
                        <Layout className="h-8 w-8 text-foreground/40" aria-hidden="true" />
                        <p className="text-sm text-foreground/80">
                            {t(STRINGS.section_list.empty_state_prefix, locale)}{" "}
                            <span className="font-medium">{t(STRINGS.section_list.empty_state_add, locale)}</span>{" "}
                            {pageLabel
                                ? tFormat(STRINGS.section_list.empty_state_suffix_named, locale, { page: pageLabel })
                                : t(STRINGS.section_list.empty_state_suffix_unnamed, locale)}
                        </p>
                        <button
                            type="button"
                            data-testid="section-list-empty-add"
                            onClick={onAdd}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(STRINGS.section_list.empty_first_button, locale)}
                        </button>
                        {onStartFromTemplate && (
                            <button
                                type="button"
                                data-testid="section-list-empty-template"
                                onClick={onStartFromTemplate}
                                className="inline-flex items-center gap-1 rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:text-foreground"
                            >
                                <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                                {t(STRINGS.section_list.empty_template_button, locale)}
                            </button>
                        )}
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                            <ul
                                data-testid="section-list-items"
                                data-page-id={pageId}
                                className="flex flex-col gap-1.5"
                            >
                                {sections.map((s) => {
                                    const expanded = expandedSectionId === s.id;
                                    return (
                                        <SectionRow
                                            key={s.id}
                                            section={s}
                                            locale={locale}
                                            onToggleEnabled={handleToggle}
                                            onEdit={handleToggleExpanded}
                                            onDuplicate={handleDuplicate}
                                            onDelete={handleDelete}
                                            onSaveAsPreset={
                                                onSaveAsPreset
                                                    ? handleOpenSavePreset
                                                    : undefined
                                            }
                                            onSelect={onSelectSection}
                                            selected={selectedSectionId === s.id}
                                            expanded={expanded}
                                            registerRowRef={registerRowRef}
                                            inlineBody={
                                                expanded ? (
                                                    <SectionEditPanel
                                                        instance={s}
                                                        onChange={(next) =>
                                                            onChange(
                                                                sections.map((x) =>
                                                                    x.id === next.id
                                                                        ? next
                                                                        : x,
                                                                ),
                                                            )
                                                        }
                                                        onClose={() =>
                                                            handleToggleExpanded(s.id)
                                                        }
                                                        tenantId={tenantId}
                                                        experiments={experiments}
                                                        segments={segments}
                                                        activeLocale={activeLocale}
                                                        activeBreakpoint={activeBreakpoint}
                                                        onEditLayer={onEditLayer}
                                                        inline
                                                    />
                                                ) : null
                                            }
                                        />
                                    );
                                })}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Footer: persistent "+ Add block" — opens picker (slide-over) */}
            <div className="shrink-0 border-t border-(--card-border) p-3">
                <button
                    type="button"
                    data-testid="section-list-add"
                    onClick={onAdd}
                    className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-primary px-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t(STRINGS.section_list.add_button, locale)}
                </button>
            </div>

            <SavePresetDialog
                open={presetDialogFor !== null}
                suggested={presetSuggested}
                onCancel={() => setPresetDialogFor(null)}
                onConfirm={handleConfirmSavePreset}
            />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                     */
/* ─────────────────────────────────────────────────────────────────── */

/** Generate a UUID, falling back to a timestamp+random suffix if `crypto.randomUUID`
 *  is unavailable (jsdom in some Node versions). */
function cryptoRandomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function deepCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/* Exported for tests and the picker (so adds funnel through the same id strategy). */
export { cryptoRandomId as __sectionListPanelGenerateId };
