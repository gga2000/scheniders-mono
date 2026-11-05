"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { FinancialValue } from "@/components/ui/financial-value";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { useShopsLive, type LiveShop } from "@/hooks/use-shops";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const CARD = "flex flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5";

/**
 * The store's shops right now, on the home page: today's sales, cash taken at
 * the till, who is selling and who is clocked in. Refreshes every 30 seconds.
 * Owners and managers only, and only for a store that has a shop.
 */
export function ShopsLiveRow() {
    const { can } = usePermission();
    const manage = can(PERMISSIONS.MANAGE_SHOPS);
    const live = useShopsLive(manage);

    if (!manage) return null;
    if (live.isError) return <WidgetLoadError onRetry={() => void live.refetch()} className="min-h-[140px]" />;
    if (!live.data) return <WidgetPending className="min-h-[140px]" />;
    if (live.data.length === 0) return null;

    return <ShopsLiveCard shops={live.data} asOf={live.dataUpdatedAt} />;
}

function ShopsLiveCard({ shops, asOf }: { shops: LiveShop[]; asOf: number }) {
    const { t } = useLanguage();
    const total = shops.reduce((sum, s) => sum + s.total, 0);
    const sales = shops.reduce((sum, s) => sum + s.sales, 0);

    return (
        <section data-shops-live className={CARD}>
            <header className="flex items-center gap-3">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--card-border)]/40 text-foreground">
                    <Store className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-left text-[15px] font-bold text-foreground" dir="auto">{t("till.live.title")}</p>
                    <p className="text-left text-xs text-muted" dir="auto">{t("till.live.subtitle")}</p>
                </div>
                {shops.length > 1 && (
                    <div className="flex flex-col items-end">
                        <FinancialValue amount={total} className="text-lg font-bold tabular-nums text-foreground" hideToggle />
                        <span className="text-xs text-muted">{t("till.live.salesCount", { n: sales })}</span>
                    </div>
                )}
                <Link href="/shops" className="shrink-0 rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-foreground hover:bg-[var(--background)]">
                    {t("till.live.manage")}
                </Link>
            </header>
            <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                {shops.map((s) => (
                    <ShopLine key={s.id} shop={s} asOf={asOf} />
                ))}
            </ul>
        </section>
    );
}

type Translate = ReturnType<typeof useLanguage>["t"];

function sinceLabel(at: string, asOf: number, t: Translate): string {
    const minutes = Math.max(0, Math.floor((asOf - Date.parse(at)) / 60_000));
    if (minutes < 1) return t("till.live.justNow");
    if (minutes < 60) return t("till.live.minAgo", { n: minutes });
    return t("till.live.hoursAgo", { n: Math.floor(minutes / 60) });
}

function ShopLine({ shop, asOf }: { shop: LiveShop; asOf: number }) {
    const { t } = useLanguage();
    const open = shop.on_till.length > 0;
    const cash = shop.cash_in - shop.payouts;
    const goal = shop.daily_goal && shop.daily_goal > 0 ? shop.daily_goal : null;
    const pct = goal ? Math.min(100, Math.round((shop.total / goal) * 100)) : 0;

    return (
        <li className="grid grid-cols-1 gap-4 py-4 first:pt-1 last:pb-0 items-start lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
            <div className="flex min-w-0 flex-col gap-1">
                <p className="flex items-center gap-2 text-base font-bold text-foreground">
                    <span
                        aria-hidden="true"
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", open ? "bg-emerald-500 shadow-[0_0_0_4px] shadow-emerald-500/15" : "bg-[var(--card-border)]")}
                    />
                    <span className="truncate" dir="auto">{shop.name}</span>
                </p>
                <p className="text-left text-xs text-muted" dir="auto">
                    {open ? t("till.live.onTill", { names: shop.on_till.join("، ") }) : t("till.live.closed")}
                </p>
                {shop.clocked_in.length > 0 && (
                    <p className="text-left text-xs text-muted" dir="auto">
                        {t("till.live.clockedIn", { names: shop.clocked_in.join("، ") })}
                    </p>
                )}
            </div>

            <Figure label={t("till.live.salesToday")}>
                <FinancialValue amount={shop.total} className="text-xl font-bold tabular-nums text-foreground" hideToggle />
                <span className="text-xs text-muted">
                    {shop.sales > 0 ? t("till.live.salesCount", { n: shop.sales }) : t("till.live.noSales")}
                </span>
                {goal && (
                    <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--card-border)]/50">
                            <span className={cn("block h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-foreground")} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums text-muted" dir="auto">{t("till.live.goal", { pct })}</span>
                    </span>
                )}
            </Figure>

            <Figure label={t("till.live.cash")}>
                <FinancialValue amount={cash} className="text-xl font-bold tabular-nums text-foreground" hideToggle />
                {shop.payouts > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-muted">
                        <span dir="auto">{t("till.live.payouts")}</span>
                        <FinancialValue amount={shop.payouts} className="text-xs" hideToggle />
                    </span>
                ) : (
                    <span className="text-xs text-muted">{t("till.live.cashHint")}</span>
                )}
            </Figure>

            <Figure label={t("till.live.lastSale")}>
                <span className="text-left text-xl font-bold text-foreground">
                    {shop.last_sale_at ? sinceLabel(shop.last_sale_at, asOf, t) : t("till.live.noneYet")}
                </span>
            </Figure>
        </li>
    );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted" dir="auto">{label}</span>
            {children}
        </div>
    );
}
