"use client";

import { useState } from "react";
import { Plus, Store } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { useShops, useTillMembers, type Shop } from "@/hooks/use-shops";
import { ShopsTable } from "./shops-table";
import { ShopDialog } from "./shop-dialog";
import { TillRulesCard } from "./till-rules-card";
import { TillPinsCard } from "./till-pins-card";
import { TillChipsCard } from "./till-chips-card";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";

/**
 * Shops & rules (Shop Till phase 0): the store's physical shops, who works in
 * each, the till rules and cashier PINs. Staff without shops.manage see only
 * their own PIN card.
 */
export function ShopsPage() {
    const { t } = useLanguage();
    const { can } = usePermission();
    const manage = can(PERMISSIONS.MANAGE_SHOPS);
    const shops = useShops();
    const members = useTillMembers();
    // null = closed; "new" = adding; a shop = editing it.
    const [editing, setEditing] = useState<Shop | "new" | null>(null);

    return (
        <div className="min-h-screen p-6 md:p-8">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("till.shops.title")}</h1>
                        <p className="mt-0.5 text-left text-sm text-muted" dir="auto">{t("till.shops.subtitle")}</p>
                    </div>
                    {manage && (
                        <button
                            type="button"
                            onClick={() => setEditing("new")}
                            className={`${CARD} inline-flex h-12 items-center gap-2 px-5 text-sm font-semibold text-foreground hover:bg-[var(--card-hover,transparent)]`}
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {t("till.shops.add")}
                        </button>
                    )}
                </header>

                {manage && (
                    <section className={`${CARD} p-5`} aria-label={t("till.shops.title")}>
                        {shops.isError ? (
                            <p className="text-sm text-muted">{t("till.shops.loadFailed")}</p>
                        ) : shops.isPending || members.isPending ? (
                            <div className="h-32 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
                        ) : shops.data.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-10 text-center">
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B8E8E0] text-[#1E1E1E]">
                                    <Store className="h-6 w-6" aria-hidden="true" />
                                </span>
                                <p className="text-base font-semibold text-foreground">{t("till.shops.emptyTitle")}</p>
                                <p className="max-w-md text-sm text-muted" dir="auto">{t("till.shops.emptyBody")}</p>
                                <button
                                    type="button"
                                    onClick={() => setEditing("new")}
                                    className="mt-1 inline-flex h-12 items-center rounded-2xl bg-[var(--ink)] px-6 text-sm font-semibold text-white dark:bg-[#EFFF00] dark:text-[#121212]"
                                >
                                    {t("till.shops.addFirst")}
                                </button>
                            </div>
                        ) : (
                            <ShopsTable shops={shops.data} members={members.data ?? []} onEdit={setEditing} />
                        )}
                    </section>
                )}

                <div className={manage ? "grid gap-5 lg:grid-cols-2" : "max-w-xl"}>
                    {manage && <TillRulesCard />}
                    <TillPinsCard members={members.data ?? []} loading={members.isPending} manage={manage} />
                    {manage && <TillChipsCard />}
                </div>
            </div>

            {editing !== null && (
                <ShopDialog
                    shop={editing === "new" ? null : editing}
                    members={members.data ?? []}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
