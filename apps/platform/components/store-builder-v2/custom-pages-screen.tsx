"use client";

// =====================================================================
// CustomPagesScreen — merchant-authored custom pages (E4)
// =====================================================================
// Manages config.custom_pages: create / rename / re-slug / hide / delete. Each
// page is served at /s/<tenant>/p/<slug> by the existing storefront route. Slug
// validation reuses the shared engine (reserved-route + duplicate guards). The
// per-page section tree is edited elsewhere; this screen owns page metadata.
// =====================================================================

import { useCallback, useState } from "react";
import { X, Plus, Trash2, FileText, EyeOff, PencilRuler, BookOpen } from "lucide-react";
import {
    normalizeSlug,
    validateSlug,
    type CustomPage,
    type SlugIssue,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { resolveI18n } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface CustomPagesScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
    /** Author a page's sections — selects it as the canvas edit target and
     *  closes this manager. */
    onEditSections?: (id: string) => void;
}

function newId(): string {
    const c = globalThis.crypto;
    return c && typeof c.randomUUID === "function"
        ? c.randomUUID()
        : `pg_${Math.random().toString(36).slice(2, 12)}`;
}

const SLUG_MESSAGE: Record<NonNullable<SlugIssue>, string> = {
    empty: "Slug is required",
    invalid: "Use lowercase letters, numbers, and dashes",
    reserved: "This slug is reserved by a system page",
    duplicate: "Another page already uses this slug",
};

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function CustomPagesScreen({
    builder,
    onClose,
    onEditSections,
}: CustomPagesScreenProps): React.ReactElement {
    const pages: CustomPage[] = builder.config.custom_pages ?? [];
    const [draftTitle, setDraftTitle] = useState("");

    const setPages = useCallback(
        (next: CustomPage[]): void => {
            builder.setConfig(
                (prev) => ({ ...prev, custom_pages: next }),
                "Edited custom pages",
            );
        },
        [builder],
    );

    const addPage = (): void => {
        const title = draftTitle.trim();
        if (!title) return;
        // Derive a unique slug from the title (append -2, -3… on collision).
        const base = normalizeSlug(title) || "page";
        let slug = base;
        let n = 2;
        while (validateSlug(slug, pages) !== null) slug = `${base}-${n++}`;
        setPages([
            ...pages,
            { id: newId(), slug, title: { en: title }, sections: [], hidden: false },
        ]);
        setDraftTitle("");
    };

    const updatePage = (i: number, patch: Partial<CustomPage>): void =>
        setPages(pages.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const removePage = (i: number): void =>
        setPages(pages.filter((_, idx) => idx !== i));

    return (
        <div
            data-testid="custom-pages-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label="Close custom pages"
                    data-testid="custom-pages-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <FileText className="h-4 w-4 text-violet-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Custom pages</h2>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Build campaign, landing, or lookbook pages served at{" "}
                    <code className="rounded bg-black/5 px-1">/p/&lt;slug&gt;</code>. Add
                    a page here, then add sections to it from the page list.
                </p>

                {/* New page */}
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        data-testid="custom-pages-title"
                        value={draftTitle}
                        placeholder="New page title"
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") addPage();
                        }}
                        className={cn(inputCls, "flex-1")}
                    />
                    <button
                        type="button"
                        data-testid="custom-pages-add"
                        onClick={addPage}
                        disabled={!draftTitle.trim()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                    </button>
                </div>

                {pages.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-center text-sm text-muted-foreground">
                        No custom pages yet.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2.5">
                        {pages.map((p, i) => {
                            const issue = validateSlug(p.slug, pages, p.id);
                            return (
                                <li
                                    key={p.id}
                                    data-testid={`custom-page-row-${i}`}
                                    className={cn(
                                        "rounded-xl border border-(--card-border) bg-(--card-bg) p-3",
                                        p.hidden && "opacity-60",
                                    )}
                                >
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <input
                                            type="text"
                                            aria-label="Page title"
                                            data-testid={`custom-page-title-${i}`}
                                            value={resolveI18n(p.title, "en")}
                                            onChange={(e) =>
                                                updatePage(i, { title: { ...p.title, en: e.target.value } })
                                            }
                                            className={cn(inputCls, "flex-1 min-w-32")}
                                        />
                                        <span className="text-xs text-muted-foreground">/p/</span>
                                        <input
                                            type="text"
                                            dir="ltr"
                                            aria-label="Page slug"
                                            data-testid={`custom-page-slug-${i}`}
                                            value={p.slug}
                                            onChange={(e) =>
                                                updatePage(i, { slug: normalizeSlug(e.target.value) })
                                            }
                                            className={cn(
                                                inputCls,
                                                "w-40",
                                                issue && "border-rose-400 focus:border-rose-400 focus:ring-rose-300/40",
                                            )}
                                        />
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                            <input
                                                type="checkbox"
                                                data-testid={`custom-page-hidden-${i}`}
                                                checked={p.hidden === true}
                                                onChange={(e) => updatePage(i, { hidden: e.target.checked })}
                                            />
                                            <EyeOff className="h-3.5 w-3.5" />
                                            Hidden
                                        </label>
                                        {onEditSections && (
                                            <button
                                                type="button"
                                                data-testid={`custom-page-edit-sections-${i}`}
                                                onClick={() => onEditSections(p.id)}
                                                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) px-3 text-xs font-medium text-foreground/80 transition-colors hover:border-(--border-hover) hover:text-foreground"
                                            >
                                                <PencilRuler className="h-3.5 w-3.5" />
                                                Edit sections
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            aria-label="Delete page"
                                            data-testid={`custom-page-remove-${i}`}
                                            onClick={() => removePage(i)}
                                            className={cn(
                                                "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600",
                                                !onEditSections && "ml-auto",
                                            )}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {issue && (
                                        <p
                                            data-testid={`custom-page-error-${i}`}
                                            className="mt-1.5 text-xs text-rose-600"
                                        >
                                            {SLUG_MESSAGE[issue]}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {p.sections.length} section(s)
                                    </p>

                                    {/* Guide details. A page is an ordinary page until
                                        the merchant says otherwise; unticking removes
                                        the whole block, so a page that is not a guide
                                        carries nothing and behaves exactly as before. */}
                                    <label className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            data-testid={`custom-page-is-article-${i}`}
                                            checked={p.article !== undefined}
                                            onChange={(e) =>
                                                updatePage(i, {
                                                    article: e.target.checked ? {} : undefined,
                                                })
                                            }
                                        />
                                        <BookOpen className="h-3.5 w-3.5" />
                                        This page is a guide
                                    </label>

                                    {p.article && (
                                        <div
                                            data-testid={`custom-page-article-${i}`}
                                            className="mt-2 flex flex-wrap items-end gap-2.5 rounded-lg bg-black/[0.03] p-2.5"
                                        >
                                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                Published
                                                <input
                                                    type="date"
                                                    dir="ltr"
                                                    data-testid={`custom-page-article-date-${i}`}
                                                    value={p.article.published_at ?? ""}
                                                    onChange={(e) =>
                                                        updatePage(i, {
                                                            article: {
                                                                ...p.article,
                                                                published_at: e.target.value || undefined,
                                                            },
                                                        })
                                                    }
                                                    className={cn(inputCls, "w-40")}
                                                />
                                            </label>
                                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                Author
                                                <input
                                                    type="text"
                                                    data-testid={`custom-page-article-author-${i}`}
                                                    value={p.article.author ?? ""}
                                                    placeholder="Optional"
                                                    onChange={(e) =>
                                                        updatePage(i, {
                                                            article: {
                                                                ...p.article,
                                                                author: e.target.value || undefined,
                                                            },
                                                        })
                                                    }
                                                    className={cn(inputCls, "w-40")}
                                                />
                                            </label>
                                            <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
                                                Cover image URL
                                                <input
                                                    type="url"
                                                    dir="ltr"
                                                    data-testid={`custom-page-article-cover-${i}`}
                                                    value={p.article.cover_url ?? ""}
                                                    placeholder="Falls back to the page's social image"
                                                    onChange={(e) =>
                                                        updatePage(i, {
                                                            article: {
                                                                ...p.article,
                                                                cover_url: e.target.value || undefined,
                                                            },
                                                        })
                                                    }
                                                    className={cn(inputCls, "w-full")}
                                                />
                                            </label>
                                            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground">
                                                Summary
                                                <input
                                                    type="text"
                                                    data-testid={`custom-page-article-excerpt-${i}`}
                                                    value={resolveI18n(p.article.excerpt, "ar")}
                                                    placeholder="One line for the guides list"
                                                    onChange={(e) =>
                                                        updatePage(i, {
                                                            article: {
                                                                ...p.article,
                                                                excerpt: e.target.value
                                                                    ? { ...p.article?.excerpt, ar: e.target.value }
                                                                    : undefined,
                                                            },
                                                        })
                                                    }
                                                    className={cn(inputCls, "w-full")}
                                                />
                                            </label>
                                            <p className="w-full text-[11px] text-muted-foreground">
                                                Guides appear in the “Guides list” section,
                                                newest first. A date in the future keeps the
                                                page reachable but out of the list until then.
                                            </p>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
