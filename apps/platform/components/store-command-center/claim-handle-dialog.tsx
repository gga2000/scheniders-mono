"use client";

// =====================================================================
// ClaimHandleDialog — rename the store slug (UX2-13)
// =====================================================================
// The published URL is the merchant's shareable identity; old tenants
// carry machine slugs (tenant-<ts>). This dialog claims a readable
// handle with live availability feedback. Old links keep working via
// tenant_slug_history + the storefront's 301 fallback.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";

interface ClaimHandleDialogProps {
    currentSlug: string;
    onClose: () => void;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

const CLIENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function ClaimHandleDialog({
    currentSlug,
    onClose,
    locale,
}: ClaimHandleDialogProps) {
    const queryClient = useQueryClient();
    const [value, setValue] = useState(currentSlug);
    // Last server verdict, keyed by the slug it answered for — availability
    // is DERIVED from this + the current input, so the debounce effect only
    // ever sets state asynchronously (react-hooks/set-state-in-effect).
    const [checked, setChecked] = useState<{
        slug: string;
        available: boolean;
        reason?: string;
    } | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const candidate = value.trim().toLowerCase();
    const formatOk =
        CLIENT_SLUG_PATTERN.test(candidate) && !candidate.includes("--");

    // Debounced availability check against GET /api/tenant/slug.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (candidate === currentSlug || candidate === "" || !formatOk) return;
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/tenant/slug?slug=${encodeURIComponent(candidate)}`,
                );
                const data = (await res.json()) as {
                    available: boolean;
                    reason?: string;
                };
                setChecked({ slug: candidate, ...data });
            } catch {
                /* transient — leave the last verdict in place */
            }
        }, 350);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [candidate, currentSlug, formatOk]);

    const availability: Availability =
        candidate === currentSlug || candidate === ""
            ? "idle"
            : !formatOk
              ? "invalid"
              : checked?.slug === candidate
                ? checked.available
                    ? "available"
                    : checked.reason === "taken"
                      ? "taken"
                      : "invalid"
                : "checking";

    const canSave = availability === "available" && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(false);
        try {
            const res = await fetch("/api/tenant/slug", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: value.trim().toLowerCase() }),
            });
            if (!res.ok) {
                setError(true);
                setSaving(false);
                return;
            }
            // The hub reads the tenant row via react-query — refresh it so
            // the preview URL + iframe follow the new handle immediately.
            await queryClient.invalidateQueries({ queryKey: ["tenant-store"] });
            onClose();
        } catch {
            setError(true);
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t(STRINGS.command_center.handle_title, locale)}
                data-testid="claim-handle-dialog"
                className="relative w-full max-w-md rounded-2xl border border-border bg-(--card-bg) p-6 shadow-xl"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t(STRINGS.common.close, locale)}
                    className="absolute end-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-foreground">
                    {t(STRINGS.command_center.handle_title, locale)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t(STRINGS.command_center.handle_body, locale)}
                </p>

                <input
                    type="text"
                    dir="ltr"
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void save();
                    }}
                    data-testid="claim-handle-input"
                    className="mt-4 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-sm text-foreground focus:border-foreground focus:outline-none"
                />

                <div className="mt-1.5 min-h-5 text-xs" aria-live="polite">
                    {availability === "checking" && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                    )}
                    {availability === "available" && (
                        <span className="font-medium text-emerald-600" data-testid="claim-handle-available">
                            {t(STRINGS.command_center.handle_available, locale)}
                        </span>
                    )}
                    {availability === "taken" && (
                        <span className="font-medium text-rose-600">
                            {t(STRINGS.command_center.handle_taken, locale)}
                        </span>
                    )}
                    {availability === "invalid" && (
                        <span className="text-muted-foreground">
                            {t(STRINGS.command_center.handle_invalid, locale)}
                        </span>
                    )}
                </div>

                <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {t(STRINGS.command_center.handle_redirect_note, locale)}
                </p>

                {error && (
                    <p role="alert" className="mt-2 text-xs text-rose-600">
                        {t(STRINGS.command_center.handle_error, locale)}
                    </p>
                )}

                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!canSave}
                    data-testid="claim-handle-save"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t(STRINGS.command_center.handle_saving, locale)}
                        </>
                    ) : (
                        <>
                            <Check className="h-4 w-4" />
                            {t(STRINGS.command_center.handle_save, locale)}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
