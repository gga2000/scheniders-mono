"use client";

import { useEffect, useRef, useState } from "react";
import {
    Smartphone,
    Tablet,
    Monitor,
    RefreshCw,
    Globe,
    ChevronDown,
    Check,
    CloudOff,
    Loader2,
    Rocket,
} from "lucide-react";
import type { Breakpoint, LocaleCode } from "@scheniders/shared";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { SaveStateV2 } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { useEditorMode, type EditorMode } from "@/lib/editor-mode-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Mode toggle — Simple ⇄ Advanced                                      */
/* ─────────────────────────────────────────────────────────────────── */

export interface ModeToggleProps {
    value: EditorMode;
    onChange: (next: EditorMode) => void;
}

export function ModeToggle({ value, onChange }: ModeToggleProps) {
    const locale = useEditorLocale();
    const OPTIONS: Array<{ id: EditorMode; label: EditorString }> = [
        { id: "simple", label: STRINGS.mode.simple },
        { id: "advanced", label: STRINGS.mode.advanced },
    ];
    return (
        <div
            role="radiogroup"
            aria-label={t(STRINGS.mode.group_aria, locale)}
            data-testid="mode-toggle"
            className="inline-flex items-center gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1"
        >
            {OPTIONS.map(({ id, label }) => {
                const isActive = id === value;
                return (
                    <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        data-testid={`mode-${id}`}
                        onClick={() => onChange(id)}
                        className={cn(
                            "flex h-7 items-center justify-center rounded-full px-2.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                            isActive
                                ? "bg-(--card-bg) text-foreground shadow-(--card-shadow)"
                                : "text-muted-foreground hover:bg-black/3 hover:text-foreground",
                        )}
                    >
                        {t(label, locale)}
                    </button>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Breakpoint toggle — segmented control                                */
/* ─────────────────────────────────────────────────────────────────── */

const BREAKPOINTS: Array<{ id: Breakpoint; icon: typeof Smartphone; label: EditorString }> = [
    { id: "mobile", icon: Smartphone, label: STRINGS.toolbar.breakpoint_mobile },
    { id: "tablet", icon: Tablet, label: STRINGS.toolbar.breakpoint_tablet },
    { id: "desktop", icon: Monitor, label: STRINGS.toolbar.breakpoint_desktop },
];

export interface BreakpointToggleProps {
    value: Breakpoint;
    onChange: (next: Breakpoint) => void;
}

export function BreakpointToggle({ value, onChange }: BreakpointToggleProps) {
    const locale = useEditorLocale();
    const { mode } = useEditorMode();
    // Iraq is mobile-first: Simple mode shows mobile + desktop only —
    // the tablet breakpoint is an Advanced concern.
    const visible = BREAKPOINTS.filter(
        (b) => mode === "advanced" || b.id !== "tablet",
    );
    return (
        <div
            role="radiogroup"
            aria-label={t(STRINGS.toolbar.breakpoint_group, locale)}
            data-testid="breakpoint-toggle"
            className="inline-flex items-center gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1"
        >
            {visible.map(({ id, icon: Icon, label }) => {
                const isActive = id === value;
                return (
                    <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={t(label, locale)}
                        title={t(label, locale)}
                        data-testid={`breakpoint-${id}`}
                        onClick={() => onChange(id)}
                        className={cn(
                            "flex h-7 w-9 items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                            isActive
                                ? "bg-(--card-bg) text-foreground shadow-(--card-shadow)"
                                : "text-muted-foreground hover:bg-black/3 hover:text-foreground",
                        )}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                    </button>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Locale select — pill                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export interface LocaleSelectProps {
    value: LocaleCode;
    onChange: (next: LocaleCode) => void;
}

export function LocaleSelect({ value, onChange }: LocaleSelectProps) {
    const locale = useEditorLocale();
    return (
        <div className="relative inline-flex items-center">
            <Globe
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground"
            />
            <select
                aria-label={t(STRINGS.toolbar.locale_select, locale)}
                data-testid="locale-select"
                value={value}
                onChange={(e) => onChange(e.target.value as LocaleCode)}
                className="cursor-pointer appearance-none rounded-full border border-(--card-border) bg-(--background-soft) py-1.5 pl-7 pr-7 text-sm font-medium text-foreground transition-colors hover:border-(--border-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
                {SUPPORTED_LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                        {LOCALE_LABELS[locale]}
                    </option>
                ))}
            </select>
            <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground"
            />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Save state pill                                                      */
/* ─────────────────────────────────────────────────────────────────── */

export interface SaveStatePillProps {
    state: SaveStateV2;
    lastSavedAt: Date | null;
    /**
     * Fired when the merchant clicks the inline "Retry" button shown
     * while `state === "error"`. EditorShell wires this to the builder's
     * `save_draft` so a failed autosave can be re-attempted without
     * making any other change.
     */
    onRetry?: () => void;
}

function formatSavedLabel(date: Date, now: number, locale: LocaleCode): string {
    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if (seconds < 5) return t(STRINGS.save_state.saved_just_now, locale);
    if (seconds < 60) return tFormat(STRINGS.save_state.saved_seconds, locale, { n: seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return tFormat(STRINGS.save_state.saved_minutes, locale, { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return tFormat(STRINGS.save_state.saved_hours, locale, { n: hours });
    const days = Math.floor(hours / 24);
    return tFormat(STRINGS.save_state.saved_days, locale, { n: days });
}

export function SaveStatePill({
    state,
    lastSavedAt,
    onRetry,
}: SaveStatePillProps) {
    const locale = useEditorLocale();
    const [now, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
        if (!lastSavedAt) return;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [lastSavedAt]);

    // Green-pulse window after a successful save. Fires for 1.5s on
    // every saving → saved transition (autosave or manual). After the
    // window expires, the pill reverts to the muted "Saved Xs ago"
    // form.
    const [showSavedPulse, setShowSavedPulse] = useState<boolean>(false);
    const prevStateRef = useRef<SaveStateV2>(state);
    useEffect(() => {
        const prev = prevStateRef.current;
        prevStateRef.current = state;
        if (prev === "saving" && state === "saved") {
            setShowSavedPulse(true);
            const t = setTimeout(() => setShowSavedPulse(false), 1500);
            return () => clearTimeout(t);
        }
        if (state === "error" || state === "saving") {
            setShowSavedPulse(false);
        }
        return undefined;
    }, [state]);

    let label: string;
    let tone: string;
    let icon: React.ReactNode;
    let style: React.CSSProperties | undefined;
    switch (state) {
        case "saving":
            label = t(STRINGS.save_state.saving, locale);
            tone = "text-muted-foreground";
            icon = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
            break;
        case "error":
            label = t(STRINGS.save_state.error, locale);
            tone = "text-destructive";
            icon = <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />;
            break;
        case "saved":
        case "idle":
        default:
            if (showSavedPulse) {
                label = t(STRINGS.save_state.saved_pulse, locale);
                tone = "text-white border-transparent";
                style = { backgroundColor: "var(--bk-success, #10b981)" };
                icon = <Check className="h-3.5 w-3.5" aria-hidden="true" />;
            } else if (lastSavedAt) {
                label = formatSavedLabel(lastSavedAt, now, locale);
                tone = "text-muted-foreground";
                icon = (
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                );
            } else {
                label = t(STRINGS.save_state.not_saved_yet, locale);
                tone = "text-muted-foreground";
                icon = (
                    <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
                    />
                );
            }
            break;
    }

    const isError = state === "error";
    return (
        <span
            data-testid="save-state-pill"
            data-state={state}
            data-pulse={showSavedPulse ? "true" : "false"}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                tone,
            )}
            style={style}
        >
            {icon}
            <span>{label}</span>
            {isError && onRetry ? (
                <button
                    type="button"
                    aria-label={t(STRINGS.save_state.retry, locale)}
                    data-testid="save-state-retry"
                    title={t(STRINGS.save_state.retry_hint, locale)}
                    onClick={onRetry}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                </button>
            ) : null}
        </span>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Publish button                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export interface PublishButtonProps {
    onPublish: () => void;
    disabled: boolean;
    busy: boolean;
    /** Optional tooltip shown on hover (e.g. blocking-health reason). */
    title?: string;
}

export function PublishButton({ onPublish, disabled, busy, title }: PublishButtonProps) {
    const locale = useEditorLocale();
    // `disabled` means "no unpublished changes". When the button is
    // active and not mid-publish there ARE pending changes worth shipping,
    // so we surface a gentle pulse to draw the eye.
    const hasChanges = !disabled && !busy;
    return (
        <button
            type="button"
            data-testid="publish-button"
            onClick={onPublish}
            disabled={disabled || busy}
            title={title}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                hasChanges
                    ? "sb-publish"
                    : "cursor-not-allowed bg-foreground/25 text-primary-foreground/80",
            )}
        >
            {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{busy ? t(STRINGS.publish.publishing, locale) : t(STRINGS.publish.button, locale)}</span>
            {hasChanges ? (
                <span
                    aria-hidden="true"
                    className="sb-pulse-dot ml-0.5 h-1.5 w-1.5 rounded-full bg-primary-foreground"
                />
            ) : null}
        </button>
    );
}
