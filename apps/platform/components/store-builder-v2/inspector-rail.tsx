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

import { useMemo, useState } from "react";
import { Blocks as BlocksIcon, HeartPulse, Palette, Search } from "lucide-react";
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
import { SectionListPanel } from "./section-list-panel";
import { BrandKitEditor } from "./brand-kit-editor";
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
    brandKit: BrandKit;
    onChangeBrandKit: (next: BrandKit) => void;

    /* ── SEO tab (per-page meta) ────────────────────────────────── */
    pageMeta?: PageMeta;
    onChangePageMeta: (next: PageMeta) => void;
    storefrontUrl?: string;

    /* ── Health tab ─────────────────────────────────────────────── */
    config: StoreConfigV2;
    tenantName: string;
    onJumpToSetting?: (id: SettingsSectionId) => void;
    onJumpToPage?: (page: PageId) => void;
    onJumpToSection?: (page: PageId, sectionId: string) => void;
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
        brandKit,
        onChangeBrandKit,
        pageMeta,
        onChangePageMeta,
        storefrontUrl,
        config,
        tenantName,
        onJumpToSetting,
        onJumpToPage,
        onJumpToSection,
    } = props;

    return (
        <aside
            data-testid="inspector-rail"
            aria-label="Inspector"
            className="sb-glass flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-(--card-border)"
        >
            <nav
                role="tablist"
                aria-label="Inspector tabs"
                data-testid="inspector-rail-tabs"
                className="shrink-0 border-b border-(--card-border) p-2"
            >
                <div className="grid grid-cols-4 gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1">
                    <InspectorTabBtn
                        icon={<BlocksIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        label="Blocks"
                        testId="inspector-tab-blocks"
                        active={activeTab === "blocks"}
                        onClick={() => onChangeTab("blocks")}
                    />
                    <InspectorTabBtn
                        icon={<Palette className="h-3.5 w-3.5" aria-hidden="true" />}
                        label="Style"
                        testId="inspector-tab-style"
                        active={activeTab === "style"}
                        onClick={() => onChangeTab("style")}
                    />
                    <InspectorTabBtn
                        icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
                        label="SEO"
                        testId="inspector-tab-seo"
                        active={activeTab === "seo"}
                        onClick={() => onChangeTab("seo")}
                    />
                    <InspectorTabBtn
                        icon={<HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />}
                        label="Health"
                        testId="inspector-tab-health"
                        active={activeTab === "health"}
                        onClick={() => onChangeTab("health")}
                    />
                </div>
            </nav>

            <div className="flex flex-1 overflow-hidden">
                {activeTab === "blocks" ? (
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
                ) : activeTab === "style" ? (
                    <div
                        data-testid="inspector-style-panel"
                        className="flex flex-1 flex-col overflow-y-auto"
                    >
                        <BrandKitEditor
                            value={brandKit}
                            onChange={onChangeBrandKit}
                            tenantId={tenantId}
                        />
                    </div>
                ) : activeTab === "seo" ? (
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
                            onSelectSetting={(id) => {
                                if (id === "health") return;
                                onJumpToSetting?.(id);
                            }}
                            onSelectPage={(page) => onJumpToPage?.(page)}
                            onSelectSection={(page, sectionId) =>
                                onJumpToSection?.(page, sectionId)
                            }
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
