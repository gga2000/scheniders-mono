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
import { SETTING_TINT, settingIcon, type SettingsSectionId } from "./page-tree";

/** Primary action button style for a screen header ("Add", "New", "Save snapshot"). */
export const screenHeaderActionCls =
    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)";

/** Quiet secondary action style (e.g. "Refresh"). */
export const screenHeaderQuietCls =
    "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground";

export interface ScreenHeaderProps {
    setting: SettingsSectionId;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Omitted when the screen is shown without a way back (e.g. embedded). */
    onBack?: () => void;
    backLabel?: string;
    backTestId?: string;
    actions?: ReactNode;
}

export function ScreenHeader({
    setting,
    title,
    subtitle,
    onBack,
    backLabel,
    backTestId,
    actions,
}: ScreenHeaderProps): React.ReactElement {
    const Icon = settingIcon(setting);
    return (
        <header
            data-testid="screen-header"
            className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-2.5"
        >
            <div className="flex min-w-0 items-center gap-2.5">
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        data-testid={backTestId}
                        aria-label={backLabel}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                ) : null}
                <span aria-hidden="true" className={cn("sb-tile flex h-8 w-8 shrink-0", SETTING_TINT[setting])}>
                    <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h2>
                    {subtitle ? (
                        <p dir="auto" className="text-[11px] text-muted-foreground">
                            {subtitle}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
    );
}
