"use client";

import Link from "next/link";
import { LayoutGrid, ArrowRight } from "lucide-react";
import type { LocaleCode, PageId, StoreConfigV2 } from "@scheniders/shared";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";

interface PagesCardProps {
    config: StoreConfigV2 | null;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

const PAGE_LABELS: Record<PageId, EditorString> = {
    home: STRINGS.command_center.page_home,
    category: STRINGS.command_center.page_category,
    product: STRINGS.command_center.page_product,
    search: STRINGS.command_center.page_search,
    cart: STRINGS.command_center.page_cart,
    checkout: STRINGS.command_center.page_checkout,
    checkout_success: STRINGS.command_center.page_checkout_success,
    track: STRINGS.command_center.page_track,
    about: STRINGS.command_center.page_about,
    faq: STRINGS.command_center.page_faq,
    contact: STRINGS.command_center.page_contact,
    policy_shipping: STRINGS.command_center.page_policy_shipping,
    policy_returns: STRINGS.command_center.page_policy_returns,
    policy_privacy: STRINGS.command_center.page_policy_privacy,
    policy_terms: STRINGS.command_center.page_policy_terms,
    not_found: STRINGS.command_center.page_not_found,
};

export function PagesCard({ config, locale }: PagesCardProps) {
    const pages = config?.pages ?? [];

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-violet-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                    {t(STRINGS.command_center.pages_heading, locale)}
                </h3>
                <span className="ms-auto text-xs text-muted-foreground">
                    {tFormat(STRINGS.command_center.pages_count, locale, { n: pages.length })}
                </span>
            </div>

            {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                    {t(STRINGS.command_center.pages_empty, locale)}
                </p>
            ) : (
                <ul className="grid grid-cols-2 gap-1.5">
                    {pages.map((page) => (
                        <li key={page.page_id}>
                            <Link
                                href={`/store/edit?page=${page.page_id}`}
                                className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                        {PAGE_LABELS[page.page_id]
                                            ? t(PAGE_LABELS[page.page_id], locale)
                                            : page.page_id}
                                    </span>
                                    <span className={page.sections.length === 0 ? "block text-[11px] text-amber-600" : "block text-[11px] text-muted-foreground"}>
                                        {tFormat(
                                            page.sections.length === 1
                                                ? STRINGS.command_center.pages_section_count_one
                                                : STRINGS.command_center.pages_section_count_other,
                                            locale,
                                            { n: page.sections.length },
                                        )}
                                    </span>
                                </span>
                                <ArrowRight
                                    className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                                    aria-hidden="true"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
