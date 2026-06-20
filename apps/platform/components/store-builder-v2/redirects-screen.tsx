"use client";

// =====================================================================
// RedirectsScreen — URL redirects manager (N3)
// =====================================================================
// Edits config.redirects: a list of from→to rules the storefront honors
// when a slug-driven page would otherwise 404 (keeps ad/WhatsApp/search
// links alive after a slug change). Live validation surfaces empty
// fields, self-redirects, duplicate sources, and two-hop chains.
// =====================================================================

import { useCallback } from "react";
import {
    X,
    Plus,
    Trash2,
    Signpost,
    ArrowRight,
    AlertTriangle,
} from "lucide-react";
import { validateRedirects } from "@scheniders/shared";
import type { RedirectRule } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface RedirectsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

export function RedirectsScreen({
    builder,
    onClose,
}: RedirectsScreenProps): React.ReactElement {
    const redirects: RedirectRule[] = builder.config.redirects ?? [];
    const issues = validateRedirects(redirects);

    const setRedirects = useCallback(
        (next: RedirectRule[]): void => {
            builder.setConfig(
                (prev) => ({ ...prev, redirects: next }),
                "Edited redirects",
            );
        },
        [builder],
    );

    const addRow = useCallback((): void => {
        setRedirects([
            ...(builder.config.redirects ?? []),
            { from: "", to: "", permanent: true },
        ]);
    }, [builder.config.redirects, setRedirects]);

    const updateRow = (i: number, patch: Partial<RedirectRule>): void => {
        setRedirects(
            redirects.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
        );
    };
    const removeRow = (i: number): void => {
        setRedirects(redirects.filter((_, idx) => idx !== i));
    };

    return (
        <div
            data-testid="redirects-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="Close redirects"
                        data-testid="redirects-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Signpost className="h-4 w-4 text-amber-600" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-foreground">
                            Redirects
                        </h2>
                    </div>
                </div>
                <button
                    type="button"
                    data-testid="redirects-add"
                    onClick={addRow}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add redirect
                </button>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Send an old URL to a new one — useful after you change a
                    product or category slug, so links you&apos;ve shared on
                    WhatsApp, ads, or that Google has indexed don&apos;t break.
                    Paths are relative to your store (e.g. <code>/products/old</code>).
                </p>

                {redirects.length === 0 ? (
                    <button
                        type="button"
                        onClick={addRow}
                        data-testid="redirects-empty-add"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Signpost className="h-6 w-6" />
                        No redirects yet — add your first
                    </button>
                ) : (
                    <ul className="flex flex-col gap-2.5">
                        {redirects.map((rule, i) => {
                            const issue = issues[i];
                            return (
                                <li
                                    key={i}
                                    data-testid={`redirect-row-${i}`}
                                    className={cn(
                                        "rounded-xl border bg-(--card-bg) p-3",
                                        issue
                                            ? "border-amber-400/60"
                                            : "border-(--card-border)",
                                    )}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                            type="text"
                                            dir="ltr"
                                            data-testid={`redirect-from-${i}`}
                                            value={rule.from}
                                            onChange={(e) =>
                                                updateRow(i, { from: e.target.value })
                                            }
                                            placeholder="/products/old-slug"
                                            className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                        <ArrowRight
                                            className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block"
                                            aria-hidden="true"
                                        />
                                        <input
                                            type="text"
                                            dir="ltr"
                                            data-testid={`redirect-to-${i}`}
                                            value={rule.to}
                                            onChange={(e) =>
                                                updateRow(i, { to: e.target.value })
                                            }
                                            placeholder="/products/new-slug"
                                            className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                        <div className="flex shrink-0 items-center gap-2">
                                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    data-testid={`redirect-permanent-${i}`}
                                                    checked={rule.permanent !== false}
                                                    onChange={(e) =>
                                                        updateRow(i, {
                                                            permanent: e.target.checked,
                                                        })
                                                    }
                                                />
                                                Permanent
                                            </label>
                                            <button
                                                type="button"
                                                aria-label="Remove redirect"
                                                data-testid={`redirect-remove-${i}`}
                                                onClick={() => removeRow(i)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {issue ? (
                                        <p
                                            data-testid={`redirect-issue-${i}`}
                                            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700"
                                        >
                                            <AlertTriangle className="h-3 w-3" />
                                            {issue}
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
