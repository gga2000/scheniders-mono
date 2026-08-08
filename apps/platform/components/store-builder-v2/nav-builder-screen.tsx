"use client";

// =====================================================================
// NavBuilderScreen — site header navigation links (E3)
// =====================================================================
// Friendly editor for globals.header.base.nav_links (the site_header section's
// nav). Add / rename (en + ar) / re-point / reorder / remove. When no header
// exists yet it's seeded from the section's defaultProps so the resulting base
// still satisfies the site_header schema (a partial base would be dropped).
// =====================================================================

import { useCallback } from "react";
import { X, Plus, Trash2, Menu, ArrowUp, ArrowDown } from "lucide-react";
import { getSection } from "@scheniders/sections";
import type { I18nString } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface NavBuilderScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

interface NavLink {
    label_i18n: I18nString;
    href: string;
}

function newId(): string {
    const c = globalThis.crypto;
    return c && typeof c.randomUUID === "function"
        ? c.randomUUID()
        : `nav_${Math.random().toString(36).slice(2, 12)}`;
}

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function NavBuilderScreen({
    builder,
    onClose,
}: NavBuilderScreenProps): React.ReactElement {
    const locale = useResolvedEditorLocale();
    const header = builder.config.globals?.header;
    const base = (header?.base ?? {}) as Record<string, unknown>;
    const links = (Array.isArray(base.nav_links) ? base.nav_links : []) as NavLink[];

    const setLinks = useCallback(
        (next: NavLink[]): void => {
            builder.setConfig((prev) => {
                const existing = prev.globals?.header;
                const prevBase = (existing?.base ?? {}) as Record<string, unknown>;
                const nextHeader = existing
                    ? { ...existing, base: { ...prevBase, nav_links: next } }
                    : {
                          id: newId(),
                          type: "site_header",
                          enabled: true,
                          base: {
                              ...((getSection("site_header")?.defaultProps as
                                  | Record<string, unknown>
                                  | undefined) ?? {}),
                              nav_links: next,
                          },
                      };
                return {
                    ...prev,
                    globals: { ...prev.globals, header: nextHeader },
                };
            }, "Edited navigation");
        },
        [builder],
    );

    const addLink = (): void =>
        setLinks([...links, { label_i18n: { en: "New link" }, href: "/" }]);
    const updateLink = (i: number, patch: Partial<NavLink>): void =>
        setLinks(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const removeLink = (i: number): void =>
        setLinks(links.filter((_, idx) => idx !== i));
    const move = (i: number, dir: -1 | 1): void => {
        const j = i + dir;
        if (j < 0 || j >= links.length) return;
        const next = [...links];
        [next[i], next[j]] = [next[j], next[i]];
        setLinks(next);
    };

    return (
        <div
            data-testid="nav-builder-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label={t(STRINGS.advanced_chrome.nav_close_aria, locale)}
                        data-testid="nav-builder-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <Menu className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-foreground">{t(STRINGS.advanced_chrome.nav_heading, locale)}</h2>
                </div>
                <button
                    type="button"
                    data-testid="nav-builder-add"
                    onClick={addLink}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t(STRINGS.advanced_chrome.nav_add_link, locale)}
                </button>
            </header>

            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    {t(STRINGS.advanced_chrome.nav_intro_prefix, locale)}{" "}
                    <code className="rounded bg-black/5 px-1">/products</code>,{" "}
                    <code className="rounded bg-black/5 px-1">/p/&lt;slug&gt;</code>
                    {t(STRINGS.advanced_chrome.nav_intro_suffix, locale)}
                </p>

                {links.length === 0 ? (
                    <button
                        type="button"
                        data-testid="nav-builder-empty-add"
                        onClick={addLink}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Menu className="h-6 w-6" />
                        {t(STRINGS.advanced_chrome.nav_empty, locale)}
                    </button>
                ) : (
                    <ul className="flex flex-col gap-2.5">
                        {links.map((l, i) => (
                            <li
                                key={i}
                                data-testid={`nav-link-row-${i}`}
                                className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                            >
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <input
                                        type="text"
                                        aria-label={t(STRINGS.advanced_chrome.nav_label_en_aria, locale)}
                                        data-testid={`nav-link-label-en-${i}`}
                                        value={l.label_i18n?.en ?? ""}
                                        placeholder={t(STRINGS.advanced_chrome.nav_label_en_placeholder, locale)}
                                        onChange={(e) =>
                                            updateLink(i, {
                                                label_i18n: { ...l.label_i18n, en: e.target.value },
                                            })
                                        }
                                        className={cn(inputCls, "w-32")}
                                    />
                                    <input
                                        type="text"
                                        dir="rtl"
                                        aria-label={t(STRINGS.advanced_chrome.nav_label_ar_aria, locale)}
                                        data-testid={`nav-link-label-ar-${i}`}
                                        value={l.label_i18n?.ar ?? ""}
                                        placeholder="التسمية"
                                        onChange={(e) =>
                                            updateLink(i, {
                                                label_i18n: { ...l.label_i18n, ar: e.target.value },
                                            })
                                        }
                                        className={cn(inputCls, "w-32")}
                                    />
                                    <input
                                        type="text"
                                        dir="ltr"
                                        aria-label={t(STRINGS.advanced_chrome.nav_href_aria, locale)}
                                        data-testid={`nav-link-href-${i}`}
                                        value={l.href}
                                        placeholder="/products"
                                        onChange={(e) => updateLink(i, { href: e.target.value })}
                                        className={cn(inputCls, "flex-1 min-w-32")}
                                    />
                                    <div className="ml-auto flex items-center gap-1">
                                        <button
                                            type="button"
                                            aria-label={t(STRINGS.advanced_chrome.nav_move_up, locale)}
                                            data-testid={`nav-link-up-${i}`}
                                            disabled={i === 0}
                                            onClick={() => move(i, -1)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-30"
                                        >
                                            <ArrowUp className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t(STRINGS.advanced_chrome.nav_move_down, locale)}
                                            data-testid={`nav-link-down-${i}`}
                                            disabled={i === links.length - 1}
                                            onClick={() => move(i, 1)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-30"
                                        >
                                            <ArrowDown className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t(STRINGS.advanced_chrome.nav_remove_link, locale)}
                                            data-testid={`nav-link-remove-${i}`}
                                            onClick={() => removeLink(i)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
