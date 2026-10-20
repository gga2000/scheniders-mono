"use client";

// =====================================================================
// MobileEditorShell — Builder v2 phone layout
// =====================================================================
// Phase 2d: collapses the desktop 3-pane (PageTree | Canvas |
// InspectorRail) into a single-pane shell with bottom-sheet drawers.
//
// Layout:
//   - Top bar (h-12, sticky): Menu, tenant name, save-state, "More",
//     Publish.
//   - Canvas: full-width LivePreview filling the screen.
//   - Bottom bar (h-14, sticky): Pages, big "+" FAB, Edit.
//
// All editing surfaces (page tree, inspector, section picker, more
// options) live inside <BottomSheet> drawers — never on top of the
// canvas as a fixed rail.
//
// IMPORTANT: this file only renders the chrome and connects to the
// already-built panels. It does NOT modify inspector-rail, live-preview
// or live-preview-overlay (locked by the shipping policy).
// =====================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ChevronLeft,
    Layers,
    Menu,
    MoreHorizontal,
    Plus,
    Redo2,
    SlidersHorizontal,
    Undo2,
} from "lucide-react";
import type {
    AudienceSegment,
    BrandKit,
    CheckResult,
    Experiment,
    LocaleCode,
    PageId,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import type {
    Product as SectionProduct,
    Category as SectionCategory,
} from "@scheniders/sections";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SectionListPanel } from "./section-list-panel";
import { PageTree, getSettingLabel, type SettingsSectionId } from "./page-tree";
import {
    BreakpointToggle,
    LocaleSelect,
    ModeToggle,
    PublishButton,
    SaveStatePill,
} from "./toolbar-controls";
import { PreviewAsControls, type PreviewAsState } from "./preview-as-controls";
import { useEditorMode } from "@/lib/editor-mode-context";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface MobileEditorShellProps {
    tenant: {
        id: string;
        slug: string;
        business_name: string;
    };
    builder: UseStoreBuilderV2Return;
    activeSections: SectionInstance[];
    sectionCounts: Partial<Record<PageId, number>>;
    onSectionsChange: (next: SectionInstance[]) => void;
    onAddSectionFab: () => void;
    onStartFromTemplate: () => void;
    onSaveAsPreset: (sectionId: string, name: string) => void;
    selectedSectionId: string | null;
    onSelectSection: (id: string) => void;
    editingSectionId: string | null;
    onToggleExpanded: (id: string) => void;
    onSelectPage: (page: PageId) => void;
    onSelectSetting: (id: SettingsSectionId) => void;
    onJumpToSection: (page: PageId, sectionId: string) => void;
    previewProducts?: SectionProduct[];
    previewCategories?: SectionCategory[];
    previewAs: PreviewAsState;
    onChangePreviewAs: (next: PreviewAsState) => void;
    onInlineEdit: (
        section_id: string,
        field_path: string,
        locale: LocaleCode,
        next_value: string,
    ) => void;
    onAddVariant: (section_id: string) => void;
    onOverlayDelete: (id: string) => void;
    onOverlayAction: (kind: "duplicate" | "up" | "down", id: string) => void;
    onSpacingChange: (id: string, bottom_px: number) => void;
    onEditSectionFromCanvas: (id: string) => void;
    onPublish: () => void;
    publishDisabled: boolean;
    publishBusy: boolean;
    publishBlockedReason: string | null;
    isFirstTimeTenant: boolean;
    onAddAtIndex: (insertAt: number) => void;
    /** Render-prop bottom-sheet content for the active section's edit
     *  panel. EditorShell builds this lazily so we don't import the
     *  edit panel here. */
    renderEditPanel?: (sectionId: string) => React.ReactNode;
    /** Render-prop for the preview canvas — EditorShell builds the iframe
     *  PreviewFrame + PreviewOverlay (it owns the bridge/refs/handlers). The
     *  arg lets the overlay's Edit action open the mobile inspector drawer. */
    renderPreview: (onEditRequest: (sectionId: string) => void) => React.ReactNode;
    /** Stub-screen renderer for desktop-only system screens. */
    renderDesktopOnlyStub?: (id: SettingsSectionId) => React.ReactNode;
    brandKit: BrandKit;
    onChangeBrandKit: (next: BrandKit) => void;
    experiments?: Experiment[];
    segments?: AudienceSegment[];
    config: StoreConfigV2;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

type DrawerKind = "pages" | "inspector" | "more" | null;

export function MobileEditorShell(props: MobileEditorShellProps): React.ReactElement {
    const {
        tenant,
        builder,
        activeSections,
        sectionCounts,
        onSectionsChange,
        onAddSectionFab,
        onStartFromTemplate,
        onSaveAsPreset,
        selectedSectionId,
        onSelectSection,
        editingSectionId,
        onToggleExpanded,
        onSelectPage,
        onSelectSetting,
        previewAs,
        onChangePreviewAs,
        onEditSectionFromCanvas,
        onPublish,
        publishDisabled,
        publishBusy,
        publishBlockedReason,
        isFirstTimeTenant,
        renderEditPanel,
        renderPreview,
        experiments,
        segments,
        config,
    } = props;

    const [drawer, setDrawer] = useState<DrawerKind>(null);
    const [firstRunDismissed, setFirstRunDismissed] = useState<boolean>(false);
    // Simple ⇄ Advanced — provided by EditorShell's EditorModeProvider.
    const { mode: editorMode, setMode: setEditorMode } = useEditorMode();

    // Hydrate first-run dismissal so the banner doesn't reappear.
    const firstRunStorageKey = `schneiders.builder.first_run_banner.dismissed.${tenant.id}`;
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = window.localStorage.getItem(firstRunStorageKey);
            if (stored === "true") setFirstRunDismissed(true);
        } catch {
            /* ignore */
        }
    }, [firstRunStorageKey]);

    const dismissFirstRun = (): void => {
        setFirstRunDismissed(true);
        try {
            if (typeof window !== "undefined") {
                window.localStorage.setItem(firstRunStorageKey, "true");
            }
        } catch {
            /* ignore */
        }
    };

    // When the merchant taps a section on the canvas, slide up the
    // Inspector to its edit panel. selectedSectionId drives the panel.
    const openInspectorWithSection = (id: string): void => {
        onSelectSection(id);
        onEditSectionFromCanvas(id);
        setDrawer("inspector");
    };

    const closeDrawer = (): void => setDrawer(null);

    const handleSelectPageMobile = (page: PageId): void => {
        onSelectPage(page);
        closeDrawer();
    };

    const handleSelectSettingMobile = (id: SettingsSectionId): void => {
        onSelectSetting(id);
        closeDrawer();
    };

    // Resolve a friendly label for the inspector header.
    const editingSection = editingSectionId
        ? activeSections.find((s) => s.id === editingSectionId)
        : null;
    const inspectorTitle = editingSection
        ? editingSection.label?.trim() || "Edit section"
        : "Page sections";

    return (
        <div
            data-testid="mobile-editor-shell"
            className="flex h-full flex-col bg-background"
        >
            {/* ── Top bar ────────────────────────────────────────── */}
            <header
                data-testid="mobile-editor-topbar"
                className="flex h-12 shrink-0 items-center justify-between gap-1 border-b border-(--card-border) bg-(--card-bg) px-2"
            >
                <div className="flex min-w-0 items-center gap-1">
                    <Link
                        href="/store"
                        data-testid="mobile-editor-back"
                        aria-label={t(STRINGS.toolbar.back_to_hub, builder.active_locale)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </Link>
                    <button
                        type="button"
                        data-testid="mobile-editor-menu"
                        aria-label={t(STRINGS.mobile.open_pages_menu, builder.active_locale)}
                        onClick={() => setDrawer("pages")}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <Menu className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="min-w-0 flex-1 px-2 text-center">
                    <span
                        data-testid="mobile-editor-tenant-name"
                        className="block truncate text-sm font-semibold tracking-tight text-foreground"
                    >
                        {tenant.business_name}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <SaveStatePill
                        state={builder.save_state}
                        lastSavedAt={builder.last_saved_at}
                        onRetry={() => {
                            void builder.save_draft();
                        }}
                    />
                    <button
                        type="button"
                        data-testid="mobile-editor-more"
                        aria-label={t(STRINGS.mobile.more_options, builder.active_locale)}
                        onClick={() => setDrawer("more")}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <PublishButton
                        onPublish={onPublish}
                        disabled={publishDisabled}
                        busy={publishBusy}
                        title={publishBlockedReason ?? undefined}
                    />
                </div>
            </header>

            {/* ── Canvas ────────────────────────────────────────── */}
            <div
                data-testid="mobile-editor-canvas"
                className="relative flex flex-1 flex-col overflow-hidden"
                onClickCapture={() => {
                    if (!firstRunDismissed && isFirstTimeTenant) {
                        dismissFirstRun();
                    }
                }}
            >
                {isFirstTimeTenant && !firstRunDismissed && (
                    <div
                        data-testid="mobile-editor-first-run-banner"
                        className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-(--card-border) bg-gradient-to-r from-pink-500/10 via-amber-500/10 to-violet-500/10 px-3 py-2 text-xs"
                    >
                        <p className="flex-1 text-foreground/90">
                            {t(STRINGS.mobile.first_run_message, builder.active_locale)}
                        </p>
                        <button
                            type="button"
                            aria-label={t(STRINGS.first_run.dismiss, builder.active_locale)}
                            data-testid="mobile-editor-first-run-banner-dismiss"
                            onClick={(e) => {
                                e.stopPropagation();
                                dismissFirstRun();
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                            ×
                        </button>
                    </div>
                )}
                {/* Preview canvas: the iframe PreviewFrame + PreviewOverlay
                    built by EditorShell (it owns the bridge/refs/handlers).
                    The overlay's Edit action opens the mobile inspector. */}
                {renderPreview(openInspectorWithSection)}
            </div>

            {/* ── Bottom bar ────────────────────────────────────── */}
            <nav
                data-testid="mobile-editor-bottombar"
                aria-label="Editor toolbar"
                className="relative flex h-14 shrink-0 items-center justify-between gap-2 border-t border-(--card-border) bg-(--card-bg) px-4"
            >
                <button
                    type="button"
                    data-testid="mobile-editor-pages"
                    aria-label="Open pages drawer"
                    onClick={() => setDrawer("pages")}
                    className="inline-flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    <Layers className="h-5 w-5" aria-hidden="true" />
                    <span>{t(STRINGS.page_tree.group_pages, builder.active_locale)}</span>
                </button>

                <button
                    type="button"
                    data-testid="mobile-editor-fab"
                    aria-label="Add section"
                    onClick={onAddSectionFab}
                    className={cn(
                        "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
                        "inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
                    )}
                    style={{ backgroundColor: "var(--bk-primary, #ec4899)" }}
                >
                    <Plus className="h-7 w-7" aria-hidden="true" />
                </button>

                <button
                    type="button"
                    data-testid="mobile-editor-edit"
                    aria-label="Open inspector drawer"
                    onClick={() => setDrawer("inspector")}
                    className="inline-flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                    <span>{t(STRINGS.section_list.row_edit_label, builder.active_locale)}</span>
                </button>
            </nav>

            {/* ── Page tree drawer ───────────────────────────────── */}
            <BottomSheet
                open={drawer === "pages"}
                onOpenChange={(o) => setDrawer(o ? "pages" : null)}
                title="Pages"
                subtitle={t(STRINGS.mobile.pages_subtitle, builder.active_locale)}
                testId="mobile-editor-drawer-pages"
                initialHeight={0.7}
            >
                <div className="px-2 pb-2">
                    <MobilePageTree
                        active={builder.active_page}
                        onSelect={handleSelectPageMobile}
                        onSelectSetting={handleSelectSettingMobile}
                        sectionCounts={sectionCounts}
                        activeLocale={builder.active_locale}
                    />
                </div>
            </BottomSheet>

            {/* ── Inspector drawer ───────────────────────────────── */}
            <BottomSheet
                open={drawer === "inspector"}
                onOpenChange={(o) => setDrawer(o ? "inspector" : null)}
                title={inspectorTitle}
                subtitle={
                    editingSection
                        ? t(STRINGS.mobile.edit_properties, builder.active_locale)
                        : `${activeSections.length} section${activeSections.length === 1 ? "" : "s"}`
                }
                testId="mobile-editor-drawer-inspector"
                initialHeight={0.7}
            >
                <div className="px-2 pb-3">
                    {editingSectionId && renderEditPanel ? (
                        <div data-testid="mobile-editor-inspector-edit">
                            {renderEditPanel(editingSectionId)}
                        </div>
                    ) : (
                        <SectionListPanel
                            pageId={builder.active_page}
                            pageLabel={builder.active_page}
                            sections={activeSections}
                            onChange={onSectionsChange}
                            onAdd={onAddSectionFab}
                            selectedSectionId={selectedSectionId}
                            onSelectSection={onSelectSection}
                            onStartFromTemplate={onStartFromTemplate}
                            onSaveAsPreset={onSaveAsPreset}
                            expandedSectionId={editingSectionId}
                            onToggleExpanded={onToggleExpanded}
                            tenantId={tenant.id}
                            activeLocale={builder.active_locale}
                            experiments={experiments}
                            segments={segments}
                        />
                    )}
                </div>
            </BottomSheet>

            {/* ── More drawer ────────────────────────────────────── */}
            <BottomSheet
                open={drawer === "more"}
                onOpenChange={(o) => setDrawer(o ? "more" : null)}
                title={t(STRINGS.mobile.more_title, builder.active_locale)}
                testId="mobile-editor-drawer-more"
                initialHeight={0.55}
                draggable={false}
            >
                <div className="space-y-4 px-4 pb-4">
                    <section className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.mode.group_aria, builder.active_locale)}
                        </div>
                        <ModeToggle value={editorMode} onChange={setEditorMode} />
                    </section>

                    <section className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.mobile.language_heading, builder.active_locale)}
                        </div>
                        <LocaleSelect
                            value={builder.active_locale}
                            onChange={builder.set_active_locale}
                        />
                    </section>

                    <section className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.mobile.preview_size_heading, builder.active_locale)}
                        </div>
                        <BreakpointToggle
                            value={builder.active_breakpoint}
                            onChange={builder.set_active_breakpoint}
                        />
                    </section>

                    {editorMode === "advanced" && (
                    <section className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.preview_as.button, builder.active_locale)}
                        </div>
                        <PreviewAsControls
                            value={previewAs}
                            onChange={onChangePreviewAs}
                            segments={config.segments}
                            experiments={config.experiments}
                        />
                    </section>
                    )}

                    <section className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.mobile.history_heading, builder.active_locale)}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                data-testid="mobile-editor-undo"
                                disabled={!builder.can_undo}
                                onClick={() => builder.undo()}
                                className={cn(
                                    "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-(--card-border) text-sm font-medium",
                                    builder.can_undo
                                        ? "text-foreground hover:bg-muted/40"
                                        : "cursor-not-allowed text-muted-foreground/50",
                                )}
                            >
                                <Undo2 className="h-4 w-4" aria-hidden="true" />
                                {t(STRINGS.toolbar.undo, builder.active_locale)}
                            </button>
                            <button
                                type="button"
                                data-testid="mobile-editor-redo"
                                disabled={!builder.can_redo}
                                onClick={() => builder.redo()}
                                className={cn(
                                    "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-(--card-border) text-sm font-medium",
                                    builder.can_redo
                                        ? "text-foreground hover:bg-muted/40"
                                        : "cursor-not-allowed text-muted-foreground/50",
                                )}
                            >
                                <Redo2 className="h-4 w-4" aria-hidden="true" />
                                {t(STRINGS.toolbar.redo, builder.active_locale)}
                            </button>
                        </div>
                    </section>
                </div>
            </BottomSheet>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* MobilePageTree — thin wrapper that strips the fixed-width chrome     */
/* off PageTree so it can live inside a bottom sheet without the rail. */
/* The desktop tree is left untouched (locked).                         */
/* ─────────────────────────────────────────────────────────────────── */

interface MobilePageTreeProps {
    active: PageId;
    onSelect: (page: PageId) => void;
    onSelectSetting: (id: SettingsSectionId) => void;
    sectionCounts: Partial<Record<PageId, number>>;
    activeLocale: LocaleCode;
}

function MobilePageTree({
    active,
    onSelect,
    onSelectSetting,
    sectionCounts,
    activeLocale,
}: MobilePageTreeProps): React.ReactElement {
    // Render the real PageTree inside a wrapper that overrides its
    // `w-[260px]` rail width to 100% on mobile. The existing component
    // doesn't expose a "mobile" prop and is shared across surfaces, so
    // we lean on a parent that opens up the layout.
    return (
        <div
            data-testid="mobile-page-tree-wrapper"
            className="[&>nav]:!w-full [&>nav]:!border-r-0"
        >
            <PageTree
                active={active}
                onSelect={onSelect}
                onSelectSetting={onSelectSetting}
                sectionCounts={sectionCounts}
                activeLocale={activeLocale}
            />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Desktop-only stub                                                    */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Some system screens (brand kit editor, version history, scheduled
 * changes, segments, experiments, i18n coverage, health checklist) are
 * dense desktop surfaces that we explicitly choose NOT to rebuild for
 * phones in this phase. When the merchant taps into them via the
 * mobile page tree, we hand back this friendly empty state instead of
 * shoving the desktop layout into 390px.
 */
export function MobileDesktopOnlyStub({
    settingId,
    onClose,
}: {
    settingId: SettingsSectionId;
    onClose: () => void;
}): React.ReactElement {
    const locale = useResolvedEditorLocale();
    // A few stub labels differ in wording from the page-tree entries;
    // everything else reuses the shared setting labels.
    const name =
        settingId === "brand_kit"
            ? t(STRINGS.mobile.stub_label_brand_kit, locale)
            : settingId === "versions"
              ? t(STRINGS.mobile.stub_label_versions, locale)
              : settingId === "i18n"
                ? t(STRINGS.mobile.stub_label_i18n, locale)
                : getSettingLabel(settingId, locale);
    return (
        <div
            data-testid="mobile-desktop-only-stub"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        >
            <div className="text-base font-semibold text-foreground">
                {tFormat(STRINGS.mobile.stub_title, locale, { name })}
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
                {t(STRINGS.mobile.stub_body, locale)}
            </p>
            <button
                type="button"
                data-testid="mobile-desktop-only-stub-close"
                onClick={onClose}
                className="mt-2 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
                {t(STRINGS.toolbar.back_to_canvas, locale)}
            </button>
        </div>
    );
}
