"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { useSaveTillChips, useTillChips } from "@/hooks/use-shops";
import type { Category } from "@/types/product";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";
const ICON_BTN =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground transition-colors hover:bg-[var(--card-border)]/30 disabled:opacity-30";

/** The category buttons along the top of the till: all of them in store order, or the owner's own pick and order. */
export function TillChipsCard() {
    const chips = useTillChips();
    const categories = useCategoriesQuery();
    return (
        <section className={`${CARD} p-5 lg:col-span-2`}>
            {chips.isError || categories.isError ? (
                <ChipsError />
            ) : chips.isPending || categories.isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
            ) : (
                <ChipsForm initial={chips.data} categories={categories.data} />
            )}
        </section>
    );
}

function ChipsError() {
    const { t } = useLanguage();
    return <p className="text-sm text-muted">{t("till.chips.loadFailed")}</p>;
}

function ChipsForm({ initial, categories }: { initial: string[] | null; categories: Category[] }) {
    const { t } = useLanguage();
    const save = useSaveTillChips();
    const byId = new Map(categories.map((c) => [c.id, c]));
    // A saved id whose category was since deleted is dropped from the draft.
    const [picked, setPicked] = useState<string[] | null>(() => (initial === null ? null : initial.filter((id) => byId.has(id))));
    const dirty = JSON.stringify(picked) !== JSON.stringify(initial === null ? null : initial.filter((id) => byId.has(id)));
    const rest = picked === null ? [] : categories.filter((c) => !picked.includes(c.id));

    const move = (i: number, by: -1 | 1) =>
        setPicked((p) => {
            if (!p) return p;
            const next = [...p];
            [next[i], next[i + by]] = [next[i + by], next[i]];
            return next;
        });

    const submit = () =>
        save.mutate(picked, {
            onSuccess: () => toast({ title: t("till.chips.saved"), variant: "success" }),
            onError: () => toast({ title: t("till.chips.saveFailed"), variant: "error" }),
        });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{t("till.chips.title")}</h2>
                    <p className="text-left text-sm text-muted" dir="auto">{t("till.chips.subtitle")}</p>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--card-border)]/30 p-1" role="group" aria-label={t("till.chips.title")}>
                    {([null, "own"] as const).map((mode) => {
                        const on = mode === null ? picked === null : picked !== null;
                        return (
                            <button
                                key={mode ?? "all"}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setPicked(mode === null ? null : (picked ?? categories.filter((c) => c.is_visible).map((c) => c.id)))}
                                className={cn("h-10 rounded-xl px-4 text-sm font-semibold", on ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted")}
                            >
                                {mode === null ? t("till.chips.all") : t("till.chips.own")}
                            </button>
                        );
                    })}
                </div>
            </div>

            {picked === null ? (
                <p className="text-left text-sm text-muted" dir="auto">{t("till.chips.allHint")}</p>
            ) : (
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.chips.shown", { n: picked.length })}</p>
                        {picked.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-6 text-center text-sm text-muted">{t("till.chips.none")}</p>
                        ) : (
                            <ol className="flex flex-col gap-2">
                                {picked.map((id, i) => (
                                    <li key={id} className="flex items-center gap-2 rounded-2xl border border-[var(--card-border)] py-1.5 pe-1.5 ps-4">
                                        <span className="w-5 text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                                        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                            {byId.get(id)?.name}
                                        </span>
                                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={ICON_BTN} aria-label={t("till.chips.up")}>
                                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                        <button type="button" onClick={() => move(i, 1)} disabled={i === picked.length - 1} className={ICON_BTN} aria-label={t("till.chips.down")}>
                                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                        <button type="button" onClick={() => setPicked(picked.filter((x) => x !== id))} className={ICON_BTN} aria-label={t("till.chips.remove")}>
                                            <X className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.chips.add")}</p>
                        {rest.length === 0 ? (
                            <p className="text-sm text-muted">{t("till.chips.allAdded")}</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {rest.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setPicked([...picked, c.id])}
                                        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground hover:bg-[var(--card-border)]/30"
                                    >
                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span dir="auto">{c.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={submit}
                    disabled={!dirty || save.isPending}
                    className="h-12 rounded-2xl bg-[var(--ink)] px-6 text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#EFFF00] dark:text-[#121212]"
                >
                    {save.isPending ? t("till.shops.saving") : t("till.chips.save")}
                </button>
            </div>
        </div>
    );
}
