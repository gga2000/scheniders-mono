"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeTicketView } from "@/hooks/use-prime-tickets";
import { primeWhen } from "@/lib/prime/when";

/** «تذاكر» on the Now tab: the latest open ticket with Prime and its last message. */
export function PrimeTicketsCard({ tickets, onOpen }: { tickets: readonly PrimeTicketView[] | null; onOpen: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const latest = tickets?.find((x) => x.open) ?? null;
    const openCount = tickets?.filter((x) => x.open).length ?? 0;

    return (
        <section className="flex flex-col gap-3.5 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-foreground">{t("prime.page.tabTickets")}</h2>
                <span className="text-xs text-muted">{t("prime.page.openTickets", { count: openCount })}</span>
            </div>
            {tickets === null ? (
                <div className="h-14 animate-pulse rounded-xl bg-black/[0.03] dark:bg-white/5" aria-busy="true" />
            ) : latest ? (
                <button type="button" onClick={onOpen} className="flex items-start gap-3 rounded-2xl bg-[#F1F5FB] p-3 text-left transition-colors hover:bg-[#E8EEF8] dark:bg-sky-400/[0.06]">
                    <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[#315EA8]" />
                    <span dir={dir} className="min-w-0 text-left text-sm leading-relaxed">
                        <b className="block truncate text-foreground">
                            {latest.customerName || latest.orderNumber} · {latest.subject ?? t("prime.page.ticket")}
                        </b>
                        <span className="block truncate text-[#4A4A4A] dark:text-white/70">{latest.latestMessage ?? "—"}</span>
                        {latest.at && <span className="block text-xs text-muted">{primeWhen(latest.at, t)}</span>}
                    </span>
                </button>
            ) : (
                <p dir={dir} className="text-left text-sm text-muted">
                    {t("prime.page.noTickets")}
                </p>
            )}
        </section>
    );
}
