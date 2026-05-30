"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone, Tablet, Monitor, RefreshCw, Languages } from "lucide-react";
import type { Breakpoint, LocaleCode } from "@scheniders/shared";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { SaveStateV2 } from "@/hooks/use-store-builder-v2";

/* ─────────────────────────────────────────────────────────────────── */
/* Breakpoint toggle                                                    */
/* ─────────────────────────────────────────────────────────────────── */

const BREAKPOINTS: Array<{ id: Breakpoint; icon: typeof Smartphone; label: string }> = [
    { id: "mobile", icon: Smartphone, label: "Mobile" },
    { id: "tablet", icon: Tablet, label: "Tablet" },
    { id: "desktop", icon: Monitor, label: "Desktop" },
];

export interface BreakpointToggleProps {
    value: Breakpoint;
    onChange: (next: Breakpoint) => void;
}

export function BreakpointToggle({ value, onChange }: BreakpointToggleProps) {
    return (
        <div
            role="radiogroup"
            aria-label="Preview breakpoint"
            data-testid="breakpoint-toggle"
            className="inline-flex rounded-md border border-(--card-border) bg-(--card-bg) p-0.5"
        >
            {BREAKPOINTS.map(({ id, icon: Icon, label }) => {
                const isActive = id === value;
                return (
                    <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={label}
                        data-testid={`breakpoint-${id}`}
                        onClick={() => onChange(id)}
                        className={cn(
                            "flex h-7 w-9 items-center justify-center rounded-sm transition-colors",
                            isActive
                                ? "bg-primary/10 text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Locale select                                                        */
/* ─────────────────────────────────────────────────────────────────── */

export interface LocaleSelectProps {
    value: LocaleCode;
    onChange: (next: LocaleCode) => void;
}

export function LocaleSelect({ value, onChange }: LocaleSelectProps) {
    return (
        <label className="inline-flex items-center gap-1.5 text-sm">
            <Languages
                aria-hidden="true"
                className="h-3.5 w-3.5 text-muted-foreground"
            />
            <select
                aria-label="Preview locale"
                data-testid="locale-select"
                value={value}
                onChange={(e) => onChange(e.target.value as LocaleCode)}
                className="rounded-md border border-(--card-border) bg-(--card-bg) px-2 py-1 text-sm"
            >
                {SUPPORTED_LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                        {LOCALE_LABELS[locale]}
                    </option>
                ))}
            </select>
        </label>
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

function formatRelative(date: Date, now: number): string {
    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function SaveStatePill({
    state,
    lastSavedAt,
    onRetry,
}: SaveStatePillProps) {
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
    let style: React.CSSProperties | undefined;
    switch (state) {
        case "saving":
            label = "Saving…";
            tone = "text-muted-foreground";
            break;
        case "error":
            label = "Save failed";
            tone = "text-destructive";
            break;
        case "saved":
        case "idle":
        default:
            if (showSavedPulse) {
                label = "Saved ✓";
                tone = "text-white border-transparent";
                style = { backgroundColor: "var(--bk-success, #10b981)" };
            } else if (lastSavedAt) {
                label = `Saved ${formatRelative(lastSavedAt, now)}`;
                tone = "text-muted-foreground";
            } else {
                label = "Not saved";
                tone = "text-muted-foreground";
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
                "inline-flex items-center gap-1.5 rounded-full border border-(--card-border) bg-(--card-bg) px-2.5 py-1 text-xs font-medium transition-colors",
                tone,
            )}
            style={style}
        >
            <span>{label}</span>
            {isError && onRetry ? (
                <button
                    type="button"
                    aria-label="Retry save"
                    data-testid="save-state-retry"
                    title="Click to try saving again."
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
    return (
        <button
            type="button"
            data-testid="publish-button"
            onClick={onPublish}
            disabled={disabled || busy}
            title={title}
            className={cn(
                "inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity",
                (disabled || busy) && "cursor-not-allowed opacity-50",
            )}
        >
            {busy ? "Publishing…" : "Publish"}
        </button>
    );
}
