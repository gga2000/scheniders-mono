"use client";

// =====================================================================
// InspectorRail — Schneiders Builder v2
// =====================================================================
// The persistent right-hand rail that hosts the editor's primary
// inspection surfaces: Blocks (page section list with inline property
// expansion), Style (brand kit), Health (publish-readiness checklist).
//
// Replaces the old "swap SectionListPanel for SectionEditPanel" model:
// editing a section now expands an accordion below its row, so the
// merchant never loses the rest of the page outline.
// =====================================================================

import { ArrowRight, Blocks as BlocksIcon, HeartPulse, Palette, Search } from "lucide-react";
import type {
    AudienceSegment,
    BrandKit,
    Experiment,
    LocaleCode,
    PageId,
    PageMeta,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { useEditorMode } from "@/lib/editor-mode-context";
import { SectionListPanel } from "./section-list-panel";
import { HealthChecklistScreen } from "./health-checklist-screen";
import { PageSeoPanel } from "./page-seo-panel";
import type { SettingsSectionId } from "./page-tree";

export type InspectorTab = "blocks" | "style" | "seo" | "health";

export interface InspectorRailProps {
    /** Currently active tab. */
    activeTab: InspectorTab;
    onChangeTab: (tab: InspectorTab) => void;

    /* ── Blocks tab ─────────────────────────────────────────────── */
    pageId: PageId;
    pageLabel: string;
    sections: SectionInstance[];
    onChangeSections: (next: SectionInstance[]) => void;
    onAddSection: () => void;
    selectedSectionId?: string | null;
    onSelectSection?: (id: string) => void;
    registerRowRef?: (id: string, el: HTMLElement | null) => void;
    onStartFromTemplate?: () => void;
    onSaveAsPreset?: (sectionId: string, name: string) => void;
    expandedSectionId?: string | null;
    onToggleExpanded?: (id: string) => void;
    tenantId?: string;
    activeLocale?: LocaleCode;
    /** Active editor breakpoint — drives per-field adornment highlight. */
    activeBreakpoint?: "mobile" | "tablet" | "desktop";
    experiments?: Experiment[];
    segments?: AudienceSegment[];
    /**
     * Forwarded to the inline Section Edit Panel — fired when the
     * merchant clicks a row in the Layers strip.
     */
    onEditLayer?: (info: { field?: string; layerId?: string; el: HTMLElement }) => void;

    /* ── Style tab ──────────────────────────────────────────────── */
    /**
     * Kept for call-site compatibility. The rail no longer embeds the
     * full BrandKitEditor (its two-pane layout breaks inside 380px) —
     * the Style tab now routes to the full-screen Brand Kit instead.
     */
    brandKit: BrandKit;
    onChangeBrandKit: (next: BrandKit) => void;

    /* ── SEO tab (per-page meta) ────────────────────────────────── */
    pageMeta?: PageMeta;
    onChangePageMeta: (next: PageMeta) => void;
    storefrontUrl?: string;

    /* ── Health tab ─────────────────────────────────────────────── */
    config: StoreConfigV2;
    tenantName: string;
    /** Whether the store has ever been published (launch checklist). */
    hasPublished?: boolean;
    onJumpToSetting?: (id: SettingsSectionId) => void;
    onJumpToPage?: (page: PageId) => void;
    onJumpToSection?: (page: PageId, sectionId: string) => void;
    /** Persist the store-level WhatsApp number (launch checklist inline capture). */
    onSetWhatsappNumber?: (value: string) => void;
}

export function InspectorRail(props: InspectorRailProps): React.ReactElement {
    const {
        activeTab,
        onChangeTab,
        pageId,
        pageLabel,
        sections,
        onChangeSections,
        onAddSection,
        selectedSectionId,
        onSelectSection,
        registerRowRef,
        onStartFromTemplate,
        onSaveAsPreset,
        expandedSectionId,
        onToggleExpanded,
        tenantId,
        activeLocale,
        activeBreakpoint,
        experiments,
        segments,
        onEditLayer,
        pageMeta,
        onChangePageMeta,
        storefrontUrl,
        config,
        tenantName,
        hasPublished,
        onJumpToSetting,
        onJumpToPage,
        onJumpToSection,
        onSetWhatsappNumber,
    } = props;

    const locale = useResolvedEditorLocale(activeLocale);
    const { mode } = useEditorMode();
    // Simple hides the SEO tab (meta titles / noindex are jargon for a
    // first-week merchant; the Health checklist covers the essentials).
    const showSeoTab = mode === "advanced";
    // If the user lands in Simple while SEO was active (mode flip, stale
    // deep link), fall back to Blocks instead of rendering a hidden tab.
    const effectiveTab: InspectorTab =
        !showSeoTab && activeTab === "seo" ? "blocks" : activeTab;

    return (
        <aside
            data-testid="inspector-rail"
            aria-label={t(STRINGS.inspector.aria_label, locale)}
            className="sb-glass flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-(--card-border)"
        >
            <nav
                role="tablist"
                aria-label={t(STRINGS.inspector.tabs_aria_label, locale)}
                data-testid="inspector-rail-tabs"
                className="shrink-0 border-b border-(--card-border) p-2"
            >
                <div
                    className={cn(
                        "grid gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1",
                        showSeoTab ? "grid-cols-4" : "grid-cols-3",
                    )}
                >
                    <InspectorTabBtn
                        icon={<BlocksIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        label={t(STRINGS.inspector.tab_blocks, locale)}
                        testId="inspector-tab-blocks"
                        active={effectiveTab === "blocks"}
                        onClick={() => onChangeTab("blocks")}
                    />
                    <InspectorTabBtn
                        icon={<Palette className="h-3.5 w-3.5" aria-hidden="true" />}
                        label={t(STRINGS.inspector.tab_style, locale)}
                        testId="inspector-tab-style"
                        active={effectiveTab === "style"}
                        onClick={() => onChangeTab("style")}
                    />
                    {showSeoTab && (
                        <InspectorTabBtn
                            icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
                            label={t(STRINGS.inspector.tab_seo, locale)}
                            testId="inspector-tab-seo"
                            active={effectiveTab === "seo"}
                            onClick={() => onChangeTab("seo")}
                        />
                    )}
                    <InspectorTabBtn
                        icon={<HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />}
                        label={t(STRINGS.inspector.tab_health, locale)}
                        testId="inspector-tab-health"
                        active={effectiveTab === "health"}
                        onClick={() => onChangeTab("health")}
                    />
                </div>
            </nav>

            <div className="flex flex-1 overflow-hidden">
                {effectiveTab === "blocks" ? (
                    <SectionListPanel
                        pageId={pageId}
                        pageLabel={pageLabel}
                        sections={sections}
                        onChange={onChangeSections}
                        onAdd={onAddSection}
                        selectedSectionId={selectedSectionId}
                        onSelectSection={onSelectSection}
                        registerRowRef={registerRowRef}
                        onStartFromTemplate={onStartFromTemplate}
                        onSaveAsPreset={onSaveAsPreset}
                        expandedSectionId={expandedSectionId}
                        onToggleExpanded={onToggleExpanded}
                        tenantId={tenantId}
                        activeLocale={activeLocale}
                        activeBreakpoint={activeBreakpoint}
                        experiments={experiments}
                        segments={segments}
                        onEditLayer={onEditLayer}
                    />
                ) : effectiveTab === "style" ? (
                    <div
                        data-testid="inspector-style-panel"
                        className="flex flex-1 flex-col overflow-y-auto p-4"
                    >
                        <div className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-(--card-shadow)">
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                                <Palette className="h-5 w-5 text-foreground" aria-hidden="true" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground">
                                {t(STRINGS.inspector.style_card_title, locale)}
                            </h3>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                {t(STRINGS.inspector.style_card_desc, locale)}
                            </p>
                            <button
                                type="button"
                                data-testid="inspector-style-open-brand-kit"
                                onClick={() => onJumpToSetting?.("brand_kit")}
                                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                                {t(STRINGS.inspector.style_card_button, locale)}
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                ) : effectiveTab === "seo" ? (
                    <PageSeoPanel
                        pageId={pageId}
                        pageLabel={pageLabel}
                        meta={pageMeta}
                        onChange={onChangePageMeta}
                        activeLocale={activeLocale}
                        storefrontUrl={storefrontUrl}
                        businessName={tenantName}
                    />
                ) : (
                    <div
                        data-testid="inspector-health-panel"
                        className="flex flex-1 flex-col overflow-y-auto"
                    >
                        <HealthChecklistScreen
                            config={config}
                            tenantName={tenantName}
                            hasPublished={hasPublished}
                            onSelectSetting={(id) => {
                                if (id === "health") return;
                                onJumpToSetting?.(id);
                            }}
                            onSelectPage={(page) => onJumpToPage?.(page)}
                            onSelectSection={(page, sectionId) =>
                                onJumpToSection?.(page, sectionId)
                            }
                            onSetWhatsappNumber={onSetWhatsappNumber}
                            onClose={() => onChangeTab("blocks")}
                        />
                    </div>
                )}
            </div>
        </aside>
    );
}

function InspectorTabBtn({
    icon,
    label,
    testId,
    active,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    testId: string;
    active: boolean;
    onClick: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={testId}
            onClick={onClick}
            className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                active
                    ? "bg-(--card-bg) text-foreground shadow-(--card-shadow)"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
