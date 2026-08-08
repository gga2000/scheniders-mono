"use client";

// =====================================================================
// EditorToolbar (extracted from editor-shell, 4.1)
// =====================================================================
// The desktop top bar: back-to-hub, tenant identity, mode toggle,
// locale/breakpoint, undo/redo, preview/open, save pill and publish.
// Pure presentation — every action is a callback into the shell.
// =====================================================================

import Link from "next/link";
import {
    ChevronLeft,
    ExternalLink,
    Redo2,
    Smartphone,
    Store,
    Undo2,
} from "lucide-react";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import type { EditorMode } from "@/lib/editor-mode-context";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import {
    BreakpointToggle,
    LocaleSelect,
    ModeToggle,
    PublishButton,
    SaveStatePill,
} from "./toolbar-controls";
import {
    PreviewAsControls,
    type PreviewAsState,
} from "./preview-as-controls";
import { I18nToolbarPill } from "./i18n-screen";

export interface EditorToolbarProps {
    tenantName: string;
    builder: UseStoreBuilderV2Return;
    editorMode: EditorMode;
    onChangeMode: (mode: EditorMode) => void;
    previewAs: PreviewAsState;
    onChangePreviewAs: (state: PreviewAsState) => void;
    /** New-tab storefront preview URL (فتح). */
    previewUrl: string;
    onOpenPreviewModal: () => void;
    onOpenI18nScreen: () => void;
    onPublish: () => void;
    publishDisabled: boolean;
    publishBusy: boolean;
    publishBlockedReason: string | null;
}

export function EditorToolbar({
    tenantName,
    builder,
    editorMode,
    onChangeMode,
    previewAs,
    onChangePreviewAs,
    previewUrl,
    onOpenPreviewModal,
    onOpenI18nScreen,
    onPublish,
    publishDisabled,
    publishBusy,
    publishBlockedReason,
}: EditorToolbarProps): React.ReactElement {
    return (
        <header
            data-testid="editor-shell-topbar"
            className="sb-glass-bar z-20 flex h-14 shrink-0 items-center justify-between border-b border-(--card-border) px-3 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_24px_-18px_rgba(0,0,0,0.25)]"
        >
            <div className="flex items-center gap-2">
                <Link
                    href="/store"
                    data-testid="editor-shell-back"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/4 hover:text-foreground"
                    aria-label={t(STRINGS.toolbar.back_to_hub, builder.active_locale)}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <span
                    aria-hidden="true"
                    className="sb-tile sb-tile--page flex h-8 w-8"
                >
                    <Store className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                    <span
                        data-testid="editor-shell-tenant-name"
                        className="truncate text-sm font-semibold tracking-tight text-foreground"
                    >
                        {tenantName}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t(STRINGS.toolbar.subtitle, builder.active_locale)}
                    </span>
                </span>
            </div>

            <div className="flex items-center gap-2.5">
                <ModeToggle value={editorMode} onChange={onChangeMode} />
                <LocaleSelect
                    value={builder.active_locale}
                    onChange={builder.set_active_locale}
                />
                <BreakpointToggle
                    value={builder.active_breakpoint}
                    onChange={builder.set_active_breakpoint}
                />
                <span
                    aria-hidden="true"
                    className="h-5 w-px bg-(--card-border)"
                />
                <div
                    data-testid="undo-redo-group"
                    className="inline-flex items-center gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1"
                >
                    <button
                        type="button"
                        data-testid="undo-button"
                        aria-label={t(STRINGS.toolbar.undo, builder.active_locale)}
                        title={
                            builder.can_undo
                                ? tFormat(STRINGS.toolbar.undo_titled, builder.active_locale, {
                                      desc: builder.undo_description ?? t(STRINGS.toolbar.history_generic, builder.active_locale),
                                  })
                                : t(STRINGS.toolbar.nothing_to_undo, builder.active_locale)
                        }
                        disabled={!builder.can_undo}
                        onClick={() => builder.undo()}
                        className={
                            "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 " +
                            (builder.can_undo
                                ? "text-foreground hover:bg-(--card-bg) hover:shadow-(--card-shadow)"
                                : "cursor-not-allowed text-muted-foreground/40")
                        }
                    >
                        <Undo2 className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        data-testid="redo-button"
                        aria-label={t(STRINGS.toolbar.redo, builder.active_locale)}
                        title={
                            builder.can_redo
                                ? tFormat(STRINGS.toolbar.redo_titled, builder.active_locale, {
                                      desc: builder.redo_description ?? t(STRINGS.toolbar.history_generic, builder.active_locale),
                                  })
                                : t(STRINGS.toolbar.nothing_to_redo, builder.active_locale)
                        }
                        disabled={!builder.can_redo}
                        onClick={() => builder.redo()}
                        className={
                            "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 " +
                            (builder.can_redo
                                ? "text-foreground hover:bg-(--card-bg) hover:shadow-(--card-shadow)"
                                : "cursor-not-allowed text-muted-foreground/40")
                        }
                    >
                        <Redo2 className="h-4 w-4" />
                    </button>
                </div>
                {editorMode === "advanced" && (
                    <>
                        <span
                            aria-hidden="true"
                            className="h-5 w-px bg-(--card-border)"
                        />
                        <PreviewAsControls
                            value={previewAs}
                            onChange={onChangePreviewAs}
                            segments={builder.config.segments}
                            experiments={builder.config.experiments}
                        />
                        <I18nToolbarPill
                            config={builder.config}
                            onClick={onOpenI18nScreen}
                        />
                    </>
                )}
                <button
                    type="button"
                    onClick={onOpenPreviewModal}
                    data-testid="open-accurate-preview"
                    title={t(STRINGS.toolbar.preview_title, builder.active_locale)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>{t(STRINGS.toolbar.preview, builder.active_locale)}</span>
                </button>
                <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="open-in-storefront"
                    title={t(STRINGS.toolbar.open_title, builder.active_locale)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{t(STRINGS.toolbar.open, builder.active_locale)}</span>
                </a>
            </div>

            <div className="flex items-center gap-2.5">
                <SaveStatePill
                    state={builder.save_state}
                    lastSavedAt={builder.last_saved_at}
                    onRetry={() => {
                        void builder.save_draft();
                    }}
                />
                <PublishButton
                    onPublish={onPublish}
                    disabled={publishDisabled}
                    busy={publishBusy}
                    title={publishBlockedReason ?? undefined}
                />
            </div>
        </header>
    );
}
