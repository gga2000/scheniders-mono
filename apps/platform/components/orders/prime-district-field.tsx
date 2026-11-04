"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { matchesAllTokens, searchTokens } from "@scheniders/shared";
import { Label } from "@scheniders/ui/label";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeDistricts } from "@/hooks/use-prime-new-order";
import { primeDistrictsInAddress, readPrimeDistrict, type PrimeDistrict } from "@/lib/prime/district";
import { cn } from "@/lib/utils";

/**
 * A Prime area under an order's governorate (new-order form and order edit):
 * Prime's districts of that governorate to search and pick from, with the
 * ones named in the address offered first. Optional; the pick goes with the
 * parcel to Prime. Shown only for a Prime-linked store, once a governorate
 * is chosen, and only where Prime lists districts for it.
 */
export function PrimeDistrictField(props: PrimeDistrictFieldProps) {
    const { connected } = usePrimeConnection();
    if (!connected || !props.city) return null;
    return <PrimeDistrictPicker {...props} />;
}

interface PrimeDistrictFieldProps {
    /** The order's governorate (orders.city). */
    city: string;
    address: string;
    /** The stored orders.prime_district. */
    value: unknown;
    onChange: (district: PrimeDistrict | null) => void;
    className?: string;
}

function PrimeDistrictPicker({ city, address, value, onChange, className }: PrimeDistrictFieldProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const districts = usePrimeDistricts(city, true);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const listId = useId();

    const answer = districts.data?.connected ? districts.data : null;
    const list = useMemo(() => answer?.districts ?? [], [answer]);
    const searching = query.trim() !== "";
    const matches = useMemo(() => {
        const tokens = searchTokens(query);
        return list.filter((d) => matchesAllTokens(d.name, tokens));
    }, [list, query]);
    const fromAddress = useMemo(() => primeDistrictsInAddress(address, list), [address, list]);

    // Prime lists no districts for this governorate (or the store is not linked after all).
    if (districts.data && (!answer || !answer.state || list.length === 0)) return null;

    const state = answer?.state ?? null;
    const stored = readPrimeDistrict(value);
    const picked = stored && stored.state === state ? stored : null;
    const pick = (d: { id: number; name: string }) => {
        if (!state) return;
        onChange({ id: d.id, name: d.name, state });
        setQuery("");
        setOpen(false);
    };

    return (
        <div className={cn("space-y-1.5", className)} data-prime-district>
            <Label className="flex items-center gap-1.5 text-[11px] text-muted">
                <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded bg-[#315EA8]">
                    <span className="h-1.5 w-3 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                </span>
                {t("orders.prime.newOrder.district")}
                <span className="text-gray-400">{t("orders.create.optional")}</span>
            </Label>

            {picked ? (
                <div className="flex h-9 items-center justify-between gap-3 rounded-lg border border-[#C9D6EC] bg-[#F3F6FC] px-3 dark:border-sky-400/30 dark:bg-sky-400/10">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[#1F3F75] dark:text-sky-200">
                        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span dir={dir} className="truncate text-left">
                            {picked.name}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#315EA8] hover:bg-white dark:text-sky-300 dark:hover:bg-white/10"
                    >
                        {t("orders.prime.newOrder.change")}
                    </button>
                </div>
            ) : (
                <>
                    {fromAddress.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span dir={dir}>{t("orders.prime.newOrder.fromAddress")}</span>
                            {fromAddress.map((d) => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => pick(d)}
                                    dir={dir}
                                    className="rounded-full border border-[#C9D6EC] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#1F3F75] hover:bg-[#F3F6FC] dark:border-sky-400/30 dark:bg-transparent dark:text-sky-200"
                                >
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                        <input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => setOpen(false)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && open && matches[0]) {
                                    e.preventDefault();
                                    pick(matches[0]);
                                }
                            }}
                            placeholder={t("orders.prime.newOrder.search")}
                            dir={dir}
                            role="combobox"
                            aria-expanded={open}
                            aria-controls={listId}
                            className="h-9 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] pl-8 pr-3 text-left text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--card-border)]"
                        />
                        {open && (
                            <ul
                                id={listId}
                                role="listbox"
                                className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--card-border)] bg-white py-1 shadow-lg dark:bg-[#1E1E1E]"
                            >
                                {districts.isPending ? (
                                    <li className="px-3 py-2 text-xs text-muted">{t("orders.prime.newOrder.loading")}</li>
                                ) : districts.isError ? (
                                    <li className="px-3 py-2 text-xs text-[#8A4B00] dark:text-amber-300">{t("orders.prime.newOrder.failed")}</li>
                                ) : matches.length === 0 ? (
                                    <li className="px-3 py-2 text-xs text-muted">{t("orders.prime.newOrder.noMatch")}</li>
                                ) : (
                                    matches.map((d, i) => (
                                        <li key={d.id} role="option" aria-selected={false}>
                                            <button
                                                type="button"
                                                // Keeps the input focused so the click lands before the list closes.
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => pick(d)}
                                                dir={dir}
                                                className={cn(
                                                    "block w-full px-3 py-1.5 text-left text-sm hover:bg-[#F3F6FC] dark:hover:bg-white/5",
                                                    i === 0 && searching && "bg-[#F7F9FD] dark:bg-white/[0.03]",
                                                )}
                                            >
                                                {d.name}
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                </>
            )}
            <p dir={dir} className="text-left text-[11px] text-muted">
                {t("orders.prime.newOrder.hint")}
            </p>
        </div>
    );
}
