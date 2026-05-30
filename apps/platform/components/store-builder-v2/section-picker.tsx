"use client";

// =====================================================================
// Section picker — Schneiders Builder v2
// =====================================================================
// Modal overlay launched from the section list panel's "+ Add" button.
// Lists every section in the editor manifest, lets the merchant filter
// by category + search, and seeds a fresh `SectionInstance` from
// `defaultProps` when they click a card.
//
// Sections whose `valid_on` does NOT include the current page are
// rendered greyed out and are click-disabled, so the merchant gets a
// visual signal without us silently filtering them.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Search, Trash2, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import type { PageId, SectionInstance } from "@scheniders/shared";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { cn } from "@/lib/utils";
import {
    SECTIONS_MANIFEST,
    SECTION_CATEGORIES,
    SECTION_CATEGORY_LABELS,
    type SectionCategory,
    type SectionManifestEntry,
} from "@/lib/sections-manifest";
import {
    instantiatePreset,
    type SectionPresetRow,
} from "@/lib/section-presets-util";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface SectionPickerProps {
    open: boolean;
    onClose: () => void;
    /** Page currently being edited — used for valid_on greying. */
    pageId: PageId;
    /** Human label for the page — shown in the header. */
    pageLabel?: string;
    /** Storefront origin used to resolve thumbnail paths. */
    storefrontUrl?: string;
    /** Called with the freshly-built instance when a valid card is clicked. */
    onAdd: (instance: SectionInstance) => void;
    /** Override the manifest for tests / future codegen integration. */
    manifestOverride?: SectionManifestEntry[];
    /** Tenant-owned section presets (loaded by the parent via useSectionPresets). */
    presets?: SectionPresetRow[];
    /** Called when the merchant clicks the trash icon on a preset. */
    onDeletePreset?: (id: string) => void;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

type CategoryFilter = "all" | SectionCategory;
type PickerTab = "library" | "presets";

function buildThumbnailSrc(thumbnail: string, storefrontUrl: string | undefined): string {
    if (!storefrontUrl) return thumbnail;
    try {
        const parsed = new URL(storefrontUrl);
        return `${parsed.origin}${thumbnail}`;
    } catch {
        // Treat as a bare origin string.
        return `${storefrontUrl.replace(/\/$/, "")}${thumbnail}`;
    }
}

function cryptoRandomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildInstance(entry: SectionManifestEntry): SectionInstance {
    return {
        id: cryptoRandomId(),
        type: entry.type,
        enabled: true,
        base: JSON.parse(JSON.stringify(entry.defaultProps)) as Record<string, unknown>,
        label: "",
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Picker                                                               */
/* ─────────────────────────────────────────────────────────────────── */

export function SectionPicker(props: SectionPickerProps): React.ReactElement | null {
    const {
        open,
        onClose,
        pageId,
        pageLabel,
        storefrontUrl,
        onAdd,
        manifestOverride,
        presets,
        onDeletePreset,
    } = props;

    const locale = useEditorLocale();
    const manifest = manifestOverride ?? SECTIONS_MANIFEST;

    const [query, setQuery] = useState<string>("");
    const [category, setCategory] = useState<CategoryFilter>("all");
    const [tab, setTab] = useState<PickerTab>("library");

    // Reset filters whenever the picker is opened.
    useEffect(() => {
        if (open) {
            setQuery("");
            setCategory("all");
            setTab("library");
        }
    }, [open]);

    // Close on Escape.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    /** Categories that have at least one entry — only those get chips. */
    const visibleCategories = useMemo<SectionCategory[]>(() => {
        const present = new Set<SectionCategory>();
        for (const entry of manifest) present.add(entry.category);
        return SECTION_CATEGORIES.filter((c) => present.has(c));
    }, [manifest]);

    const filtered = useMemo<SectionManifestEntry[]>(() => {
        const q = query.trim().toLowerCase();
        return manifest.filter((entry) => {
            if (category !== "all" && entry.category !== category) return false;
            if (!q) return true;
            const name = entry.name.en.toLowerCase();
            const desc = entry.description.en.toLowerCase();
            return name.includes(q) || desc.includes(q) || entry.type.includes(q);
        });
    }, [manifest, category, query]);

    if (!open) return null;

    return (
        <div
            data-testid="section-picker"
            role="dialog"
            aria-modal="true"
            aria-label={t(STRINGS.section_picker.title_default, locale)}
            className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 lg:items-center lg:p-4"
        >
            {/* Backdrop click closes */}
            <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={onClose}
                data-testid="section-picker-backdrop"
                className="absolute inset-0 cursor-default"
            />

            {/* Card — full-screen on mobile, centered modal on desktop */}
            <div
                className="relative z-10 flex h-full max-h-screen w-full flex-col overflow-hidden border-(--card-border) bg-(--card-bg) shadow-xl lg:h-auto lg:max-h-[85vh] lg:max-w-3xl lg:rounded-lg lg:border"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-(--card-border) px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold tracking-tight">
                            {pageLabel
                                ? tFormat(STRINGS.section_picker.title_with_page, locale, { page: pageLabel })
                                : t(STRINGS.section_picker.title_default, locale)}
                        </h2>
                        <p className="mt-0.5 text-xs text-foreground/80">
                            {t(STRINGS.section_picker.subtitle, locale)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.section_picker.close, locale)}
                        data-testid="section-picker-close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                {/* Tab strip — Library / Saved presets */}
                <div
                    data-testid="section-picker-tabs"
                    className="flex items-center gap-1 border-b border-(--card-border) px-3 pt-2"
                >
                    <PickerTabBtn
                        label={t(STRINGS.section_picker.tab_library, locale)}
                        active={tab === "library"}
                        onClick={() => setTab("library")}
                        testId="section-picker-tab-library"
                    />
                    <PickerTabBtn
                        label={
                            presets?.length
                                ? tFormat(STRINGS.section_picker.tab_presets, locale, { count: presets.length })
                                : t(STRINGS.section_picker.tab_presets_zero, locale)
                        }
                        active={tab === "presets"}
                        onClick={() => setTab("presets")}
                        testId="section-picker-tab-presets"
                    />
                </div>

                {tab === "library" ? (
                <>
                {/* Search + category chips */}
                <div className="flex flex-col gap-2 border-b border-(--card-border) px-4 py-3">
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t(STRINGS.section_picker.search_placeholder, locale)}
                            data-testid="section-picker-search"
                            aria-label={t(STRINGS.section_picker.search_placeholder, locale)}
                            className="h-9 w-full rounded-md border border-(--card-border) bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
                        />
                    </div>
                    <div
                        data-testid="section-picker-categories"
                        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-x-visible"
                    >
                        <CategoryChip
                            label={t(STRINGS.section_picker.category_all, locale)}
                            active={category === "all"}
                            onClick={() => setCategory("all")}
                            testId="section-picker-chip-all"
                        />
                        {visibleCategories.map((c) => (
                            <CategoryChip
                                key={c}
                                label={SECTION_CATEGORY_LABELS[c]}
                                active={category === c}
                                onClick={() => setCategory(c)}
                                testId={`section-picker-chip-${c}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Grid body */}
                <div className="flex-1 overflow-y-auto p-4">
                    {filtered.length === 0 ? (
                        <div
                            data-testid="section-picker-empty"
                            className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-(--card-border) px-4 py-12 text-center"
                        >
                            <p className="text-sm text-foreground/80">
                                {t(STRINGS.section_picker.empty_search, locale)}
                            </p>
                        </div>
                    ) : (
                        <div
                            data-testid="section-picker-grid"
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            {filtered.map((entry) => {
                                const isValid = entry.valid_on.includes(pageId);
                                return (
                                    <SectionCard
                                        key={entry.type}
                                        entry={entry}
                                        valid={isValid}
                                        storefrontUrl={storefrontUrl}
                                        locale={locale}
                                        onPick={() => {
                                            if (!isValid) return;
                                            onAdd(buildInstance(entry));
                                            onClose();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
                </>
                ) : (
                    <div
                        data-testid="section-picker-presets-body"
                        className="flex-1 overflow-y-auto p-4"
                    >
                        {!presets || presets.length === 0 ? (
                            <div
                                data-testid="section-picker-presets-empty"
                                className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-(--card-border) px-4 py-12 text-center"
                            >
                                <Bookmark
                                    className="h-6 w-6 text-muted-foreground/60"
                                    aria-hidden="true"
                                />
                                <p className="text-sm font-semibold">
                                    {t(STRINGS.section_picker.presets_empty_title, locale)}
                                </p>
                                <p className="max-w-sm text-xs text-foreground/80">
                                    {t(STRINGS.section_picker.presets_empty_hint, locale)}
                                </p>
                            </div>
                        ) : (
                            <ul
                                data-testid="section-picker-presets-list"
                                className="flex flex-col gap-1.5"
                            >
                                {presets.map((p) => (
                                    <PresetRow
                                        key={p.id}
                                        preset={p}
                                        onPick={() => {
                                            onAdd(instantiatePreset(p));
                                            onClose();
                                        }}
                                        onDelete={
                                            onDeletePreset
                                                ? () => onDeletePreset(p.id)
                                                : undefined
                                        }
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Picker tab button                                                    */
/* ─────────────────────────────────────────────────────────────────── */

function PickerTabBtn({
    label,
    active,
    onClick,
    testId,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    testId: string;
}): React.ReactElement {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex h-8 items-center rounded-t-md border-b-2 px-3 text-xs font-semibold transition-colors",
                active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
            )}
        >
            {label}
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Preset row                                                           */
/* ─────────────────────────────────────────────────────────────────── */

function PresetRow({
    preset,
    onPick,
    onDelete,
}: {
    preset: SectionPresetRow;
    onPick: () => void;
    onDelete?: () => void;
}): React.ReactElement {
    const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

    return (
        <li
            data-testid={`section-picker-preset-${preset.id}`}
            className="group relative flex items-center gap-2 rounded-md border border-(--card-border) bg-background p-2.5 transition-colors hover:border-primary/60"
        >
            <button
                type="button"
                data-testid={`section-picker-preset-${preset.id}-pick`}
                onClick={onPick}
                className="flex flex-1 flex-col items-start text-left"
            >
                <span className="truncate text-sm font-semibold text-foreground">
                    {preset.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                    {preset.section_type}
                </span>
            </button>
            {onDelete && (
                <>
                    <button
                        type="button"
                        aria-label={`Delete preset ${preset.name}`}
                        data-testid={`section-picker-preset-${preset.id}-delete`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setConfirmOpen(true);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <Dialog
                        open={confirmOpen}
                        onOpenChange={(o) => !o && setConfirmOpen(false)}
                    >
                        <DialogContent
                            data-testid={`section-picker-preset-${preset.id}-confirm`}
                            className="md:max-w-md"
                        >
                            <DialogHeader>
                                <DialogTitle>Delete this preset?</DialogTitle>
                                <DialogDescription>
                                    “{preset.name}” will be removed from your
                                    preset library. Sections you've already
                                    added from it are unaffected.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <button
                                    type="button"
                                    onClick={() => setConfirmOpen(false)}
                                    data-testid={`section-picker-preset-${preset.id}-confirm-cancel`}
                                    className="inline-flex h-9 items-center justify-center rounded-md border border-(--card-border) bg-(--card-bg) px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConfirmOpen(false);
                                        onDelete();
                                    }}
                                    data-testid={`section-picker-preset-${preset.id}-confirm-delete`}
                                    className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
                                >
                                    Delete preset
                                </button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </li>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Category chip                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function CategoryChip({
    label,
    active,
    onClick,
    testId,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    testId: string;
}): React.ReactElement {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
        >
            {label}
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section card                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function SectionCard({
    entry,
    valid,
    storefrontUrl,
    locale,
    onPick,
}: {
    entry: SectionManifestEntry;
    valid: boolean;
    storefrontUrl?: string;
    locale: import("@scheniders/shared").LocaleCode;
    onPick: () => void;
}): React.ReactElement {
    const src = buildThumbnailSrc(entry.thumbnail, storefrontUrl);
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `picker-card-${entry.type}`,
        // Disabled cards can't be dragged.
        disabled: !valid,
        data: { manifestType: entry.type, sectionType: entry.type },
    });
    // dnd-kit emits `aria-disabled` in `attributes`; strip it so it
    // doesn't clash with the explicit `aria-disabled` we already pass.
    const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ["aria-disabled"]: _ariaDisabledAttr,
        ...dndAttributes
    } = attributes as unknown as Record<string, unknown>;
    return (
        <button
            ref={setNodeRef}
            type="button"
            data-testid={`section-picker-card-${entry.type}`}
            data-valid={valid ? "true" : "false"}
            data-dragging={isDragging ? "true" : "false"}
            onClick={onPick}
            disabled={!valid}
            aria-disabled={!valid}
            title={
                valid
                    ? `Add ${entry.name.en}`
                    : `${entry.name.en} can't be placed on this page`
            }
            {...listeners}
            {...dndAttributes}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-md border border-(--card-border) bg-background text-left transition-colors",
                valid
                    ? "cursor-pointer hover:border-primary/60 hover:shadow-sm"
                    : "cursor-not-allowed opacity-50",
                isDragging && "opacity-60 ring-2 ring-primary",
            )}
        >
            <div className="aspect-[16/10] w-full overflow-hidden bg-muted/30">
                {/* Storefront serves a real SVG; if anything fails we hide the broken img frame. */}
                <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                        {entry.name.en}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {SECTION_CATEGORY_LABELS[entry.category]}
                    </span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                    {entry.description.en}
                </p>
                <div className="mt-1">
                    {valid ? (
                        <span
                            className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-semibold text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100"
                            data-testid={`section-picker-card-${entry.type}-add`}
                        >
                            {t(STRINGS.section_picker.add_chip, locale)}
                        </span>
                    ) : (
                        <span className="inline-flex h-6 items-center rounded-md bg-muted/60 px-2 text-[11px] font-medium text-muted-foreground">
                            {t(STRINGS.section_picker.not_for_page, locale)}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
