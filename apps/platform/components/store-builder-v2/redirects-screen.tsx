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
    Plus,
    Trash2,
    Signpost,
    ArrowRight,
    AlertTriangle,
} from "lucide-react";
import { redirectIssues } from "@scheniders/shared";
import type { RedirectIssue, RedirectRule } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import type { LocaleCode } from "@scheniders/shared";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { ScreenHeader, screenHeaderActionCls } from "./screen-header";
import { removeWithUndo } from "./undo-toast";

export interface RedirectsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

function issueText(issue: RedirectIssue, locale: LocaleCode): string {
    const A = STRINGS.advanced_chrome;
    switch (issue.code) {
        case "missing":
            return t(A.redir_issue_missing, locale);
        case "self":
            return t(A.redir_issue_self, locale);
        case "duplicate":
            return tFormat(A.redir_issue_duplicate, locale, { n: issue.other + 1 });
        case "chain":
            return t(A.redir_issue_chain, locale);
    }
}

export function RedirectsScreen({
    builder,
    onClose,
}: RedirectsScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const redirects: RedirectRule[] = builder.config.redirects ?? [];
    const issues = redirectIssues(redirects);

    const setRedirects = useCallback(
        (next: RedirectRule[]): void => {
            builder.setConfig(
                (prev) => ({ ...prev, redirects: next }),
                tFormat(STRINGS.history.edit_named, locale, { name: t(STRINGS.advanced_chrome.redir_heading, locale) }),
            );
        },
        [builder, locale],
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
    const removeRow = (i: number): void =>
        removeWithUndo(redirects, i, setRedirects, {
            title: t(STRINGS.advanced_chrome.redir_removed, locale),
            // «القاعدة» is feminine: the bundle hint's «استعادتها» fits it.
            hint: t(STRINGS.advanced_chrome.bun_removed_hint, locale),
            restoreLabel: t(STRINGS.advanced_chrome.redir_restore, locale),
        });

    return (
        <div
            data-testid="redirects-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <ScreenHeader
                setting="redirects"
                subtitle={t(STRINGS.advanced_chrome.redir_intro, locale)}
                onBack={onClose}
                backTestId="redirects-close"
                actions={
                    <>
                        <button
                            type="button"
                            data-testid="redirects-add"
                            onClick={addRow}
                            className={screenHeaderActionCls}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t(STRINGS.advanced_chrome.redir_add, locale)}
                        </button>
                    </>
                }
            />

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 *:max-w-3xl">

                {redirects.length === 0 ? (
                    <button
                        type="button"
                        onClick={addRow}
                        data-testid="redirects-empty-add"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Signpost className="h-6 w-6" />
                        {t(STRINGS.advanced_chrome.red_empty, locale)}
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
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                        <label className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left! text-xs text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.redir_col_from, locale)}
                                        <input
                                            type="text"
                                            dir="ltr"
                                            data-testid={`redirect-from-${i}`}
                                            value={rule.from}
                                            onChange={(e) =>
                                                updateRow(i, { from: e.target.value })
                                            }
                                            placeholder="/products/old-slug"
                                            className="text-foreground placeholder:text-muted-foreground w-full min-w-0 rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                        </label>
                                        <ArrowRight
                                            className="mb-2.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block"
                                            aria-hidden="true"
                                        />
                                        <label className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left! text-xs text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.redir_col_to, locale)}
                                        <input
                                            type="text"
                                            dir="ltr"
                                            data-testid={`redirect-to-${i}`}
                                            value={rule.to}
                                            onChange={(e) =>
                                                updateRow(i, { to: e.target.value })
                                            }
                                            placeholder="/products/new-slug"
                                            className="text-foreground placeholder:text-muted-foreground w-full min-w-0 rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        />
                                        </label>
                                        <div className="flex h-[38px] shrink-0 items-center gap-2">
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
                                                {t(STRINGS.advanced_chrome.redir_permanent, locale)}
                                            </label>
                                            <button
                                                type="button"
                                                aria-label={t(STRINGS.advanced_chrome.redir_remove_aria, locale)}
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
                                            dir="auto"
                                            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300"
                                        >
                                            <AlertTriangle className="h-3 w-3" />
                                            {issueText(issue, locale)}
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {redirects.length > 0 ? (
                    <p className="max-w-prose text-left! text-xs text-muted-foreground">
                        {t(STRINGS.advanced_chrome.redir_permanent_hint, locale)}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
