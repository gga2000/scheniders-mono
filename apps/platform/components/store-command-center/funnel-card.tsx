"use client";

// =====================================================================
// FunnelCard — the merchant's own storefront funnel, first-party
// =====================================================================
// Visitors → product viewers → checkout starts → buyers over the last 7
// days, from storefront_events (recorded by the storefront's beacon and
// the checkout server). Each stage shows its share of the stage before it,
// which is the number a merchant can act on: a weak product→checkout step
// is a price or trust problem; a weak checkout→order step is the form.
// =====================================================================

import { Eye, PackageSearch, ClipboardList, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import type { StorefrontFunnel } from "@/hooks/use-storefront-funnel";

interface FunnelCardProps {
    funnel: StorefrontFunnel | undefined;
    isLoading: boolean;
    /** The RPC failed. Shown as such — an empty funnel would claim "no
     *  visits", which is a different and false statement. */
    isError: boolean;
    locale: LocaleCode;
}

const NUM = new Intl.NumberFormat("en-US");

function pct(part: number, whole: number): string {
    if (whole <= 0) return "—";
    return `${Math.round((part / whole) * 100)}%`;
}

export function FunnelCard({ funnel, isLoading, isError, locale }: FunnelCardProps) {
    const s = STRINGS.command_center;
    const stages: { key: string; label: string; icon: LucideIcon; value: number }[] = funnel
        ? [
              { key: "visitors", label: t(s.funnel_visitors, locale), icon: Eye, value: funnel.visitors },
              { key: "product", label: t(s.funnel_product_viewers, locale), icon: PackageSearch, value: funnel.product_viewers },
              { key: "checkout", label: t(s.funnel_checkout_starters, locale), icon: ClipboardList, value: funnel.checkout_starters },
              { key: "buyers", label: t(s.funnel_buyers, locale), icon: ShoppingBag, value: funnel.buyers },
          ]
        : [];
    const max = Math.max(1, ...stages.map((x) => x.value));
    const empty = !isLoading && !isError && (!funnel || funnel.page_views === 0);

    return (
        <section
            data-testid="funnel-card"
            aria-labelledby="funnel-heading"
            className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-5"
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="funnel-heading" className="text-sm font-semibold text-foreground">
                    {t(s.funnel_title, locale)}
                </h2>
                <span className="text-xs text-muted-foreground">{t(s.kpi_last_7_days, locale)}</span>
            </div>

            {isLoading ? (
                <div className="mt-4 space-y-2" aria-busy="true">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-9 animate-pulse rounded-lg bg-black/5" />
                    ))}
                </div>
            ) : isError ? (
                <p data-testid="funnel-error" role="alert" className="mt-3 max-w-prose text-xs text-destructive">
                    {t(s.funnel_error, locale)}
                </p>
            ) : empty ? (
                <p data-testid="funnel-empty" className="mt-3 max-w-prose text-xs text-muted-foreground">
                    {t(s.funnel_empty, locale)}
                </p>
            ) : (
                <>
                    <ol className="mt-4 space-y-2">
                        {stages.map((stage, i) => {
                            const prev = i === 0 ? null : stages[i - 1].value;
                            return (
                                <li key={stage.key} data-testid={`funnel-stage-${stage.key}`} className="grid grid-cols-[auto_9rem_1fr_auto_auto] items-center gap-3">
                                    <stage.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    <span className="truncate text-xs font-medium text-foreground">{stage.label}</span>
                                    <div className="relative h-6 overflow-hidden rounded-md bg-black/5" aria-hidden="true">
                                        <div
                                            className={cn("absolute inset-y-0 start-0 rounded-md", i === 3 ? "bg-emerald-500" : "bg-primary/70")}
                                            style={{ width: `${Math.max(2, (stage.value / max) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="min-w-12 text-end text-sm font-semibold tabular-nums text-foreground" dir="ltr">{NUM.format(stage.value)}</span>
                                    <span className="w-10 text-end text-xs tabular-nums text-muted-foreground" dir="ltr" title={prev === null ? undefined : t(s.funnel_of_previous, locale)}>
                                        {prev === null ? "" : pct(stage.value, prev)}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                    <p className="mt-3 text-xs text-muted-foreground">
                        {t(s.funnel_conversion, locale)}{" "}
                        <bdi dir="ltr" className="font-semibold tabular-nums text-foreground" data-testid="funnel-conversion">
                            {funnel ? pct(funnel.buyers, funnel.visitors) : "—"}
                        </bdi>
                    </p>
                    {funnel && funnel.top_products.length > 0 && (
                        <div className="mt-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(s.funnel_top_products, locale)}</h3>
                            <ul className="mt-2 divide-y divide-(--card-border)">
                                {funnel.top_products.slice(0, 5).map((p) => (
                                    <li key={p.product_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                                        <span className="min-w-0 truncate text-foreground">{p.name ?? "—"}</span>
                                        <span dir="ltr" className="shrink-0 tabular-nums text-xs text-muted-foreground">
                                            {NUM.format(p.viewers)} → {NUM.format(p.buyers)} · {pct(p.buyers, p.viewers)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
