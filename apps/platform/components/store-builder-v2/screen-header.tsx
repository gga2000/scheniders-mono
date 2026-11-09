"use client";

// =====================================================================
// ScreenHeader — the one header every settings screen uses
// =====================================================================
// Back arrow, the same tinted icon tile the left rail shows for this
// screen, the title (and an optional one-line subtitle), then the
// screen's own actions at the far end. One component so every screen
// reads the same way instead of each one building its own bar.
// =====================================================================

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { STRINGS, t } from "@/lib/editor-i18n";
import { SETTING_TINT, getSettingLabel, settingIcon, type SettingsSectionId } from "./page-tree";

/** Primary action button style for a screen header ("Add", "New", "Save snapshot"). */
export const screenHeaderActionCls =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)";

/** Quiet secondary action style (e.g. "Refresh"). */
export const screenHeaderQuietCls =
    "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground";

export interface ScreenHeaderProps {
    /** Picks the icon, tint and title: the title is the screen's name in
     *  the left rail, so the rail and the screen never name it differently. */
    setting: SettingsSectionId;
    subtitle?: ReactNode;
    /** Omitted when the screen is shown without a way back (e.g. embedded). */
    onBack?: () => void;
    backTestId?: string;
    actions?: ReactNode;
    /** The screen lays out wider than the 3xl settings column (lists beside
     *  details, dashboards): the header spans the pane with it. */
    wide?: boolean;
}

export function ScreenHeader({
    setting,
    subtitle,
    onBack,
    backTestId,
    actions,
    wide = false,
}: ScreenHeaderProps): React.ReactElement {
    const locale = useEditorLocale();
    const Icon = settingIcon(setting);
    return (
        <header
            data-testid="screen-header"
            className="flex min-h-14 shrink-0 items-center border-b border-(--card-border) bg-(--card-bg) px-5 py-2.5"
        >
            {/* The title, subtitle and actions share the content column's
                width, so the subtitle wraps where the cards end and the
                actions sit at the edge of what they act on. */}
            <div className={cn("flex w-full min-w-0 items-center justify-between gap-3", !wide && "max-w-3xl")}>
            <div className="flex min-w-0 items-center gap-2.5">
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        data-testid={backTestId}
                        aria-label={t(STRINGS.toolbar.back_to_canvas, locale)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                ) : null}
                <span aria-hidden="true" className={cn("sb-tile flex h-8 w-8 shrink-0", SETTING_TINT[setting])}>
                    <Icon className="h-4 w-4" />
                </span>
                {/* text-left: the title and subtitle sit beside the tile. Arabic
                    runs would otherwise right-align inside the block the
                    subtitle widens and drift away from it. */}
                <div className="min-w-0 [&_*]:text-left!">
                    <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                        {getSettingLabel(setting, locale)}
                    </h2>
                    {subtitle ? (
                        <p className="text-[11px] text-pretty text-muted-foreground">
                            {subtitle}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}
