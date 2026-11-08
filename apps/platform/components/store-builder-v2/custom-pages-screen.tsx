"use client";

// =====================================================================
// CustomPagesScreen — merchant-authored custom pages (E4)
// =====================================================================
// Manages config.custom_pages: create / rename / re-slug / hide / delete. Each
// page is served at /s/<tenant>/p/<slug> by the existing storefront route. Slug
// validation reuses the shared engine (reserved-route + duplicate guards). The
// per-page section tree is edited elsewhere; this screen owns page metadata.
// =====================================================================

import { useCallback, useRef, useState } from "react";
import { Plus, Trash2, EyeOff, PencilRuler, BookOpen } from "lucide-react";
import {
    normalizeSlug,
    validateSlug,
    type CustomPage,
    type RedirectRule,
    type SlugIssue,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { resolveI18n } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { ScreenHeader } from "./screen-header";

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

const SLUG_MESSAGE: Record<NonNullable<SlugIssue>, EditorString> = {
    empty: STRINGS.custom_pages.slug_empty,
    invalid: STRINGS.custom_pages.slug_invalid,
    reserved: STRINGS.custom_pages.slug_reserved,
    duplicate: STRINGS.custom_pages.slug_duplicate,
};

/**
 * Redirect rules after a page moves from `/p/<from>` to `/p/<to>`: old links
 * (ads, WhatsApp shares, search results) keep working. Rules that pointed at
 * the old address now point at the new one (no chains), and a rule FROM the
 * new address is dropped so it cannot shadow the page.
 */
export function redirectsAfterSlugChange(
    rules: RedirectRule[],
    fromSlug: string,
    toSlug: string,
): RedirectRule[] {
    const from = `/p/${fromSlug}`;
    const to = `/p/${toSlug}`;
    const next = rules
        .filter((r) => r.from !== to)
        .map((r) => (r.to === from ? { ...r, to } : r));
    if (!next.some((r) => r.from === from)) next.push({ from, to, permanent: true });
    return next;
}

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function CustomPagesScreen({
    builder,
    onClose,
    onEditSections,
}: CustomPagesScreenProps): React.ReactElement {
    const pages: CustomPage[] = builder.config.custom_pages ?? [];
    // Titles are written in the store's main language (an Arabic store sees
    // and edits its Arabic title, not an empty English one).
    const locale = builder.config.default_locale ?? "ar";
    const ui = useEditorLocale();
    const C = STRINGS.custom_pages;
    const [draftTitle, setDraftTitle] = useState("");
    // Slug each page had when its slug field was focused, so a finished
    // rename (on blur) can forward the old address.
    const slugAtFocus = useRef<Map<string, string>>(new Map());
    const [forwarded, setForwarded] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const setPages = useCallback(
        (next: CustomPage[]): void => {
            builder.setConfig(
                (prev) => ({ ...prev, custom_pages: next }),
                tFormat(STRINGS.history.edit_named, ui, { name: t(C.heading, ui) }),
            );
        },
        [builder, ui, C],
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
            { id: newId(), slug, title: { [locale]: title }, sections: [], hidden: false },
        ]);
        setDraftTitle("");
    };

    const updatePage = (i: number, patch: Partial<CustomPage>): void =>
        setPages(pages.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const removePage = (i: number): void => {
        setConfirmDelete(null);
        setPages(pages.filter((_, idx) => idx !== i));
    };

    const finishSlugEdit = (page: CustomPage): void => {
        const before = slugAtFocus.current.get(page.id);
        slugAtFocus.current.delete(page.id);
        if (!before || before === page.slug) return;
        if (validateSlug(page.slug, pages, page.id) !== null) return;
        builder.setConfig(
            (prev) => ({
                ...prev,
                redirects: redirectsAfterSlugChange(prev.redirects ?? [], before, page.slug),
            }),
            t(C.forward_history, ui),
        );
        setForwarded((f) => ({ ...f, [page.id]: before }));
    };

    return (
        <div
            data-testid="custom-pages-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <ScreenHeader
                setting="custom_pages"
                title={t(C.heading, ui)}
                onBack={onClose}
                backLabel={t(C.close, ui)}
                backTestId="custom-pages-close"
            />

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p dir="auto" className="max-w-prose text-xs text-muted-foreground">
                    {t(C.intro, ui)}
                </p>

                {/* New page */}
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        data-testid="custom-pages-title"
                        value={draftTitle}
                        placeholder={t(C.new_title, ui)}
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
                        {t(C.add, ui)}
                    </button>
                </div>

                {pages.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-center text-sm text-muted-foreground">
                        {t(C.empty, ui)}
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
                                            aria-label={t(C.page_title, ui)}
                                            data-testid={`custom-page-title-${i}`}
                                            value={resolveI18n(p.title, locale)}
                                            onChange={(e) =>
                                                updatePage(i, { title: { ...p.title, [locale]: e.target.value } })
                                            }
                                            className={cn(inputCls, "flex-1 min-w-32")}
                                        />
                                        <span className="text-xs text-muted-foreground">/p/</span>
                                        <input
                                            type="text"
                                            dir="ltr"
                                            aria-label={t(C.page_slug, ui)}
                                            data-testid={`custom-page-slug-${i}`}
                                            value={p.slug}
                                            onFocus={() => slugAtFocus.current.set(p.id, p.slug)}
                                            onBlur={() => finishSlugEdit(p)}
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
                                            {t(C.hidden, ui)}
                                        </label>
                                        {onEditSections && (
                                            <button
                                                type="button"
                                                data-testid={`custom-page-edit-sections-${i}`}
                                                onClick={() => onEditSections(p.id)}
                                                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) px-3 text-xs font-medium text-foreground/80 transition-colors hover:border-(--border-hover) hover:text-foreground"
                                            >
                                                <PencilRuler className="h-3.5 w-3.5" />
                                                {t(C.edit_sections, ui)}
                                            </button>
                                        )}
                                        {confirmDelete === p.id ? (
                                            <span className={cn("inline-flex items-center gap-1.5", !onEditSections && "ms-auto")}>
                                                <span dir="auto" className="text-xs text-rose-700">
                                                    {tFormat(C.delete_confirm, ui, { path: `/p/${p.slug}` })}
                                                </span>
                                                <button
                                                    type="button"
                                                    data-testid={`custom-page-remove-confirm-${i}`}
                                                    onClick={() => removePage(i)}
                                                    className="inline-flex h-8 items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                                                >
                                                    {t(C.delete, ui)}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDelete(null)}
                                                    className="inline-flex h-8 items-center rounded-lg border border-(--card-border) px-3 text-xs font-medium"
                                                >
                                                    {t(C.keep, ui)}
                                                </button>
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                aria-label={t(C.delete_aria, ui)}
                                                data-testid={`custom-page-remove-${i}`}
                                                onClick={() => setConfirmDelete(p.id)}
                                                className={cn(
                                                    "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600",
                                                    !onEditSections && "ms-auto",
                                                )}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    {issue && (
                                        <p
                                            data-testid={`custom-page-error-${i}`}
                                            className="mt-1.5 text-xs text-rose-600"
                                        >
                                            {t(SLUG_MESSAGE[issue], ui)}
                                        </p>
                                    )}
                                    {forwarded[p.id] && !issue && (
                                        <p
                                            data-testid={`custom-page-forwarded-${i}`}
                                            className="mt-1.5 text-xs text-emerald-700"
                                        >
                                            {tFormat(C.forwarded, ui, { path: `/p/${forwarded[p.id]}` })}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {tFormat(C.section_count, ui, { n: p.sections.length })}
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
                                        {t(C.is_guide, ui)}
                                    </label>

                                    {p.article && (
                                        <div
                                            data-testid={`custom-page-article-${i}`}
                                            className="mt-2 flex flex-wrap items-end gap-2.5 rounded-lg bg-black/[0.03] p-2.5"
                                        >
                                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                {t(C.published, ui)}
                                                <input
                                                    type="date"
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
                                                {t(C.author, ui)}
                                                <input
                                                    type="text"
                                                    data-testid={`custom-page-article-author-${i}`}
                                                    value={p.article.author ?? ""}
                                                    placeholder={t(C.optional, ui)}
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
                                                {t(C.cover, ui)}
                                                <input
                                                    type="url"
                                                    data-testid={`custom-page-article-cover-${i}`}
                                                    value={p.article.cover_url ?? ""}
                                                    placeholder={t(C.cover_placeholder, ui)}
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
                                                {t(C.summary, ui)}
                                                <input
                                                    type="text"
                                                    data-testid={`custom-page-article-excerpt-${i}`}
                                                    value={resolveI18n(p.article.excerpt, "ar")}
                                                    placeholder={t(C.summary_placeholder, ui)}
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
                                                {t(C.guide_help, ui)}
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
