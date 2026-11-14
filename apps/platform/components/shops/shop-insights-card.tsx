"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useShopInsights, type Shop, type ShopInsights } from "@/hooks/use-shops";
import { formatIqdNumber } from "@scheniders/shared";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";
// Iraq's week starts on Saturday. Values are Postgres dow (0 = Sunday).
const WEEK = [6, 0, 1, 2, 3, 4, 5] as const;
const RANGES = [7, 30, 90] as const;

/** When the shops are busy, and what sells in the shop compared with online. */
export function ShopInsightsCard({ shops }: { shops: Shop[] }) {
    const { t, language } = useLanguage();
    const [days, setDays] = useState<(typeof RANGES)[number]>(30);
    const [shopId, setShopId] = useState<string | null>(null);
    const insights = useShopInsights(days);

    return (
        <section className={`${CARD} flex flex-col gap-6 p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{t("till.insights.title")}</h2>
                    <p className="text-left text-sm text-muted" dir="auto">{t("till.insights.subtitle")}</p>
                </div>
                <div className="flex gap-1 rounded-full border border-[var(--card-border)] p-1" role="radiogroup" aria-label={t("till.insights.range")}>
                    {RANGES.map((d) => (
                        <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={days === d}
                            onClick={() => setDays(d)}
                            className={cn(
                                "h-9 rounded-full px-3 text-sm font-semibold tabular-nums",
                                days === d ? "bg-[var(--ink)] text-white dark:bg-[#EFFF00] dark:text-[#121212]" : "text-foreground",
                            )}
                        >
                            {t("till.insights.days", { n: d })}
                        </button>
                    ))}
                </div>
            </div>

            {insights.isError ? (
                <p className="text-sm text-muted">{t("till.insights.failed")}</p>
            ) : insights.isPending ? (
                <div className="h-64 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
            ) : (
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <BusyHours data={insights.data} shops={shops} shopId={shopId} onShop={setShopId} language={language} />
                    <TopLists data={insights.data} />
                </div>
            )}
        </section>
    );
}

function BusyHours({
    data,
    shops,
    shopId,
    onShop,
    language,
}: {
    data: ShopInsights;
    shops: Shop[];
    shopId: string | null;
    onShop: (id: string | null) => void;
    language: string;
}) {
    const { t } = useLanguage();
    const rows = data.hours.filter((h) => shopId === null || h.shop_id === shopId);
    const { cells, max, hours, best } = useMemo(() => {
        const map = new Map<string, { sales: number; total: number }>();
        for (const r of rows) {
            const key = `${r.dow}-${r.hour}`;
            const cur = map.get(key) ?? { sales: 0, total: 0 };
            map.set(key, { sales: cur.sales + r.sales, total: cur.total + r.total });
        }
        const used = rows.map((r) => r.hour);
        // Show the shop's real opening span, at least 10:00 to 22:00.
        const from = Math.min(10, ...used);
        const to = Math.max(22, ...used);
        let top: { dow: number; hour: number; sales: number } | null = null;
        for (const [key, v] of map) {
            const [dow, hour] = key.split("-").map(Number);
            if (!top || v.sales > top.sales) top = { dow, hour, sales: v.sales };
        }
        return {
            cells: map,
            max: Math.max(0, ...[...map.values()].map((v) => v.sales)),
            hours: Array.from({ length: to - from + 1 }, (_, i) => from + i),
            best: top,
        };
    }, [rows]);
    const dayName = (dow: number) => {
        // 2023-01-01 was a Sunday, so day 1 + dow gives that weekday.
        const d = new Date(Date.UTC(2023, 0, 1 + dow, 12));
        return d.toLocaleDateString(language === "ar" ? "ar-IQ" : "en-GB", { weekday: "short", timeZone: "UTC" });
    };

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{t("till.insights.hoursTitle")}</h3>
                {shops.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                        {[null, ...shops.map((s) => s.id)].map((id) => (
                            <button
                                key={id ?? "all"}
                                type="button"
                                onClick={() => onShop(id)}
                                aria-pressed={shopId === id}
                                className={cn(
                                    "h-9 rounded-full border px-3 text-xs font-semibold",
                                    shopId === id ? "border-transparent bg-[var(--ink)] text-white dark:bg-[#EFFF00] dark:text-[#121212]" : "border-[var(--card-border)] text-foreground",
                                )}
                                dir="auto"
                            >
                                {id === null ? t("till.insights.allShops") : shops.find((s) => s.id === id)?.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {max === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-10 text-center text-sm text-muted" dir="auto">
                    {t("till.insights.noShopSales")}
                </p>
            ) : (
                <>
                    {best && (
                        <p className="text-left text-sm text-muted" dir="auto">
                            {t("till.insights.busiest", { day: dayName(best.dow), hour: `${String(best.hour).padStart(2, "0")}:00`, n: best.sales })}
                        </p>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-1 text-xs tabular-nums">
                            <thead>
                                <tr>
                                    <th className="w-14" />
                                    {hours.map((h) => (
                                        <th key={h} scope="col" className="font-medium text-muted">
                                            {String(h).padStart(2, "0")}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {WEEK.map((dow) => (
                                    <tr key={dow}>
                                        <th scope="row" className="pe-2 text-left font-semibold text-foreground" dir="auto">
                                            {dayName(dow)}
                                        </th>
                                        {hours.map((h) => {
                                            const v = cells.get(`${dow}-${h}`);
                                            const share = v ? v.sales / max : 0;
                                            const label = v ? t("till.insights.cell", { n: v.sales, total: formatIqdNumber(v.total) }) : t("till.insights.cellNone");
                                            return (
                                                <td key={h} className="p-0">
                                                    <span
                                                        title={`${dayName(dow)} ${String(h).padStart(2, "0")}:00 · ${label}`}
                                                        aria-label={`${dayName(dow)} ${String(h).padStart(2, "0")}:00, ${label}`}
                                                        className="block h-8 rounded-md"
                                                        style={{
                                                            background: v
                                                                ? `color-mix(in oklch, #E0B400 ${Math.round(18 + share * 82)}%, var(--card-bg))`
                                                                : "color-mix(in oklch, var(--card-border) 45%, transparent)",
                                                        }}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function TopLists({ data }: { data: ShopInsights }) {
    const { t } = useLanguage();
    const shopNames = new Set(data.shop_top.map((p) => p.name));
    return (
        <div className="grid min-w-0 gap-6 sm:grid-cols-2">
            <TopList title={t("till.insights.inShop")} items={data.shop_top} empty={t("till.insights.noShopSales")} />
            <TopList
                title={t("till.insights.online")}
                items={data.online_top}
                empty={t("till.insights.noOnline")}
                // A strong online seller the shops are not selling may be missing from the shelf.
                flag={(name) => data.shop_top.length > 0 && !shopNames.has(name)}
                flagLabel={t("till.insights.notInShop")}
            />
        </div>
    );
}

function TopList({
    title,
    items,
    empty,
    flag,
    flagLabel,
}: {
    title: string;
    items: { name: string; pieces: number }[];
    empty: string;
    flag?: (name: string) => boolean;
    flagLabel?: string;
}) {
    const max = Math.max(1, ...items.map((i) => i.pieces));
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {items.length === 0 ? (
                <p className="text-left text-sm text-muted" dir="auto">{empty}</p>
            ) : (
                <ol className="flex flex-col gap-2">
                    {items.map((item, i) => (
                        <li key={item.name} className="flex flex-col gap-1">
                            <span className="flex items-baseline justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate text-left font-medium text-foreground" dir="auto">
                                    <span className="me-1.5 tabular-nums text-muted">{i + 1}</span>
                                    {item.name}
                                    {flag?.(item.name) && <span className="ms-2 rounded-full bg-[#FBE38E] px-2 py-0.5 text-[11px] font-semibold text-[#1E1E1E]">{flagLabel}</span>}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted">{item.pieces}</span>
                            </span>
                            <span className="h-1.5 rounded-full bg-[var(--card-border)]/50">
                                <span className="block h-full rounded-full bg-[var(--ink)] dark:bg-[#EFFF00]" style={{ width: `${(item.pieces / max) * 100}%` }} />
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
