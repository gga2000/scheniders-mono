"use client";

// =====================================================================
// Editor banners & one-shot dialogs (extracted from editor-shell, 4.1)
// =====================================================================
// Presentational overlays the shell mounts around the canvas: first-run
// banner, post-wizard welcome, mode-intro popover, deep-link elevation
// toast, publish celebration, and crash-recovery banner. All state that
// spans sessions (dismissals) lives in localStorage keyed per tenant.
// =====================================================================

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";

/* ─────────────────────────────────────────────────────────────────── */
/* FirstRunBanner                                                       */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Tiny bento-styled banner shown above the canvas for first-time
 * tenants. Dismissal is persisted per-tenant in localStorage so it
 * doesn't reappear across sessions.
 */
export function FirstRunBanner({
    tenantId,
    visible,
    isHome,
    pageLabel,
}: {
    tenantId: string;
    visible: boolean;
    /** Home gets the "this is your homepage" welcome; other pages get page-aware copy. */
    isHome: boolean;
    pageLabel: string;
}): React.ReactElement | null {
    const locale = useEditorLocale();
    const storageKey = `schneiders.builder.first_run_banner.dismissed.${tenantId}`;
    const [dismissed, setDismissed] = useState<boolean>(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = window.localStorage.getItem(storageKey);
            setDismissed(stored === "true");
        } catch {
            setDismissed(false);
        }
    }, [storageKey]);

    if (!visible || dismissed) return null;

    const handleDismiss = (): void => {
        setDismissed(true);
        try {
            if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, "true");
            }
        } catch {
            /* ignore */
        }
    };

    return (
        <div
            data-testid="editor-shell-first-run-banner"
            className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-(--card-border) bg-gradient-to-r from-pink-500/10 via-amber-500/10 to-violet-500/10 px-4 py-3 text-sm"
        >
            <span aria-hidden="true" className="text-base">
                ✨
            </span>
            <p className="flex-1 text-foreground/90">
                {isHome
                    ? t(STRINGS.first_run.message_home, locale)
                    : tFormat(STRINGS.first_run.message_page, locale, { page: pageLabel })}
            </p>
            <button
                type="button"
                aria-label={t(STRINGS.first_run.dismiss, locale)}
                data-testid="editor-shell-first-run-banner-dismiss"
                onClick={handleDismiss}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
            >
                ×
            </button>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* WelcomeCard — post-wizard handoff                                    */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * One-time welcome shown when the merchant lands from the onboarding
 * wizard: continues the wizard's warm voice into the editor with the
 * three facts that kill first-session fear (click-to-edit, autosave,
 * publish-when-ready).
 */
export function WelcomeCard({
    locale,
    onDismiss,
}: {
    locale: LocaleCode;
    onDismiss: () => void;
}): React.ReactElement {
    const bullets = [
        STRINGS.welcome.bullet_edit,
        STRINGS.welcome.bullet_autosave,
        STRINGS.welcome.bullet_publish,
    ];
    return (
        <div
            data-testid="editor-welcome-card"
            role="dialog"
            aria-modal="true"
            aria-label={t(STRINGS.welcome.title, locale)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
            onClick={onDismiss}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-(--card-border) bg-(--card-bg) p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">
                    <span aria-hidden="true">🎉</span>
                </div>
                <h2 className="text-lg font-bold text-foreground">
                    {t(STRINGS.welcome.title, locale)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t(STRINGS.welcome.subtitle, locale)}
                </p>
                <ul className="mt-4 space-y-2.5">
                    {bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
                            <span
                                aria-hidden="true"
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-foreground"
                            >
                                {i + 1}
                            </span>
                            {t(b, locale)}
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    data-testid="editor-welcome-dismiss"
                    onClick={onDismiss}
                    className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {t(STRINGS.welcome.cta, locale)}
                </button>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Mode intro popover + deep-link elevation toast                       */
/* ─────────────────────────────────────────────────────────────────── */

/** One-time card shown under the toolbar on the first manual switch to Advanced. */
export function ModeIntroPopover({
    locale,
    onDismiss,
}: {
    locale: LocaleCode;
    onDismiss: () => void;
}): React.ReactElement {
    return (
        <div
            data-testid="mode-intro-popover"
            role="dialog"
            aria-label={t(STRINGS.mode.intro_title, locale)}
            className="fixed left-1/2 top-16 z-50 w-full max-w-sm -translate-x-1/2 rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)]"
        >
            <h3 className="text-sm font-bold text-foreground">
                {t(STRINGS.mode.intro_title, locale)}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(STRINGS.mode.intro_body, locale)}
            </p>
            <button
                type="button"
                data-testid="mode-intro-dismiss"
                onClick={onDismiss}
                className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
                {t(STRINGS.mode.intro_dismiss, locale)}
            </button>
        </div>
    );
}

/** Transient pill: a deep link opened an Advanced-only screen this visit. */
export function ModeElevatedToast({
    locale,
    onDone,
}: {
    locale: LocaleCode;
    onDone: () => void;
}): React.ReactElement {
    useEffect(() => {
        const timer = setTimeout(onDone, 5000);
        return () => clearTimeout(timer);
    }, [onDone]);
    return (
        <div
            data-testid="mode-elevated-toast"
            role="status"
            className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full border border-(--card-border) bg-(--card-bg) px-4 py-2 text-xs font-medium text-foreground shadow-(--card-shadow-hover)"
        >
            {t(STRINGS.mode.elevated_for_link, locale)}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* PublishSuccessDialog                                                 */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Post-publish celebration. Publishing is the emotional peak of a
 * merchant's first session — hand them the live link (view / copy /
 * WhatsApp-share) instead of silently closing the sheet.
 */
export function PublishSuccessDialog({
    open,
    onClose,
    storeUrl,
}: {
    open: boolean;
    onClose: () => void;
    storeUrl: string;
}): React.ReactElement | null {
    const locale = useEditorLocale();
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
        if (!open) return;
        setCopied(false);
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const handleCopy = (): void => {
        void navigator.clipboard
            ?.writeText(storeUrl)
            .then(() => setCopied(true))
            .catch(() => {
                /* clipboard unavailable — the URL stays selectable in the box */
            });
    };

    const whatsappHref = `https://wa.me/?text=${encodeURIComponent(storeUrl)}`;

    return (
        <div
            data-testid="publish-success-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t(STRINGS.publish.success_title, locale)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-(--card-border) bg-(--card-bg) p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-3xl">
                    <span aria-hidden="true">🎉</span>
                </div>
                <h2 className="text-lg font-bold text-foreground">
                    {t(STRINGS.publish.success_title, locale)}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(STRINGS.publish.success_subtitle, locale)}
                </p>

                <div className="mt-4 flex items-center gap-1.5 rounded-xl border border-(--card-border) bg-(--background-soft) px-3 py-2">
                    <span
                        data-testid="publish-success-url"
                        className="min-w-0 flex-1 select-all truncate text-left text-xs text-foreground/80"
                        dir="ltr"
                    >
                        {storeUrl}
                    </span>
                    <button
                        type="button"
                        data-testid="publish-success-copy"
                        onClick={handleCopy}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-(--card-border) bg-(--card-bg) px-2 text-[11px] font-semibold text-foreground/80 transition-colors hover:text-foreground"
                    >
                        {copied
                            ? t(STRINGS.publish.success_copied, locale)
                            : t(STRINGS.publish.success_copy, locale)}
                    </button>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    <a
                        href={storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="publish-success-view"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        {t(STRINGS.publish.success_view, locale)}
                    </a>
                    <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="publish-success-whatsapp"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20"
                    >
                        {t(STRINGS.publish.success_whatsapp, locale)}
                    </a>
                    <button
                        type="button"
                        data-testid="publish-success-close"
                        onClick={onClose}
                        className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {t(STRINGS.publish.success_close, locale)}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Relative "N min ago" label for the recovery banner timestamp. */
function relativeTimeFrom(ms: number, locale: LocaleCode): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return t(STRINGS.recovery.time_just_now, locale);
    const mins = Math.round(diff / 60_000);
    if (mins < 60) return tFormat(STRINGS.recovery.time_minutes, locale, { n: mins });
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return tFormat(STRINGS.recovery.time_hours, locale, { n: hrs });
    const days = Math.round(hrs / 24);
    return tFormat(STRINGS.recovery.time_days, locale, { n: days });
}

/**
 * Crash-recovery banner — shown when a local backup newer than the DB draft is
 * found on mount (BUG4). Restoring is undoable (routes through applyConfig).
 */
export function DraftRecoveryBanner({
    backup,
    onRestore,
    onDismiss,
}: {
    backup: { saved_at: number };
    onRestore: () => void;
    onDismiss: () => void;
}) {
    const locale = useEditorLocale();
    return (
        <div
            data-testid="editor-shell-recovery-banner"
            className="fixed inset-x-0 top-2 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-50/95 px-4 py-2.5 text-sm shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur"
        >
            <span aria-hidden="true" className="text-base">
                ⏱️
            </span>
            <p className="flex-1 text-amber-900">
                {tFormat(STRINGS.recovery.message, locale, {
                    time: relativeTimeFrom(backup.saved_at, locale),
                })}
            </p>
            <button
                type="button"
                onClick={onRestore}
                data-testid="editor-shell-recovery-restore"
                className="inline-flex h-7 items-center rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
                {t(STRINGS.recovery.restore, locale)}
            </button>
            <button
                type="button"
                aria-label={t(STRINGS.recovery.dismiss, locale)}
                onClick={onDismiss}
                data-testid="editor-shell-recovery-dismiss"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900/60 transition-colors hover:bg-amber-500/15 hover:text-amber-900"
            >
                ×
            </button>
        </div>
    );
}
