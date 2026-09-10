"use client";

// =====================================================================
// TemplateUpdatesScreen — pulling a direction's improvements into a store
// =====================================================================
// The store's look came from a direction (a template). When that direction
// gains a section, this screen offers it — and only ever offers: it cannot
// overwrite a word the merchant wrote, and it cannot remove anything. The
// planner in lib/store-templates/upgrade.ts compares the store's actual
// sections against the direction's current definition, so the answer is true
// even for a store seeded before template stamps existed.
// =====================================================================

import { useCallback, useMemo, useState } from "react";
import { X, Sparkles, Check, Lock, Plus } from "lucide-react";
import { resolveI18n } from "@scheniders/shared";
import type { PageId } from "@scheniders/shared";
import { applyTemplateUpgrade, planTemplateUpgrade } from "@/lib/store-templates/upgrade";
import { getManifestEntry } from "@/lib/sections-manifest";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

export interface TemplateUpdatesScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

export function TemplateUpdatesScreen({ builder, onClose }: TemplateUpdatesScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const s = STRINGS.template_updates;
    const plan = useMemo(() => planTemplateUpgrade(builder.config), [builder.config]);
    // Everything on offer starts ticked: the merchant is here to take the update.
    const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
    const [applied, setApplied] = useState(false);

    const pageLabel = useCallback(
        (id: PageId) => tx(STRINGS.page_tree[`page_${id}` as keyof typeof STRINGS.page_tree] ?? s.page_other, locale),
        [locale, s.page_other],
    );
    const sectionLabel = useCallback(
        (type: string) => {
            const entry = getManifestEntry(type);
            return entry ? resolveI18n(entry.name, locale) : type;
        },
        [locale],
    );

    const apply = () => {
        if (!plan) return;
        const selected = new Set(plan.additions.map((_, i) => i).filter((i) => !skipped.has(i)));
        if (selected.size === 0) return;
        builder.applyConfig(applyTemplateUpgrade(builder.config, plan, selected));
        setApplied(true);
    };

    const chosenCount = plan ? plan.additions.length - skipped.size : 0;

    return (
        <div data-testid="template-updates-screen" className="flex h-full w-full flex-col bg-background">
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label={tx(s.close, locale)}
                    data-testid="template-updates-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <Sparkles className="h-4 w-4 text-violet-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">{tx(s.title, locale)}</h2>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                {!plan ? (
                    <p data-testid="template-updates-unknown" className="max-w-prose text-xs text-muted-foreground">
                        {tx(s.unknown_origin, locale)}
                    </p>
                ) : (
                    <>
                        <p className="max-w-prose text-xs text-muted-foreground">
                            {tx(s.intro, locale).replace("{template}", resolveI18n(plan.direction_name_i18n, locale))}
                        </p>

                        {plan.additions.length === 0 ? (
                            <p
                                data-testid="template-updates-current"
                                className="inline-flex items-center gap-2 text-sm text-emerald-700"
                            >
                                <Check className="h-4 w-4" aria-hidden="true" />
                                {tx(s.up_to_date, locale)}
                            </p>
                        ) : applied ? (
                            <p data-testid="template-updates-applied" role="status" className="max-w-prose text-sm text-emerald-700">
                                {tx(s.applied, locale)}
                            </p>
                        ) : (
                            <>
                                <ul className="flex flex-col gap-2">
                                    {plan.additions.map((add, i) => (
                                        <li key={`${add.page_id}:${add.type}:${add.index}`}>
                                            <label
                                                data-testid={`template-update-${add.type}`}
                                                className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 accent-primary"
                                                    checked={!skipped.has(i)}
                                                    onChange={(e) =>
                                                        setSkipped((prev) => {
                                                            const next = new Set(prev);
                                                            if (e.target.checked) next.delete(i);
                                                            else next.add(i);
                                                            return next;
                                                        })
                                                    }
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium text-foreground">
                                                        {sectionLabel(add.type)}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        {tx(s.placement, locale)
                                                            .replace("{page}", pageLabel(add.page_id))
                                                            .replace(
                                                                "{after}",
                                                                add.after_type ? sectionLabel(add.after_type) : tx(s.at_top, locale),
                                                            )}
                                                    </span>
                                                    {getManifestEntry(add.type) && (
                                                        <span className="mt-1 block text-xs text-muted-foreground">
                                                            {resolveI18n(getManifestEntry(add.type)!.description, locale)}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    type="button"
                                    data-testid="template-updates-apply"
                                    onClick={apply}
                                    disabled={chosenCount === 0}
                                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    {tx(s.apply, locale).replace("{count}", String(chosenCount))}
                                </button>
                                <p className="max-w-prose text-xs text-muted-foreground">{tx(s.draft_note, locale)}</p>
                            </>
                        )}

                        {/* What the update deliberately does not touch. */}
                        {plan.customised.length > 0 && (
                            <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                                <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                    {tx(s.yours_heading, locale)}
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">{tx(s.yours_body, locale)}</p>
                                <ul data-testid="template-updates-customised" className="mt-2 flex flex-wrap gap-1.5">
                                    {plan.customised.map((c, i) => (
                                        <li
                                            key={`${c.page_id}:${c.type}:${i}`}
                                            className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-muted-foreground"
                                        >
                                            {sectionLabel(c.type)} · {pageLabel(c.page_id)}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
