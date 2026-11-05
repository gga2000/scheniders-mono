"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeBoard } from "@/hooks/use-prime-board";
import { usePrimeTickets } from "@/hooks/use-prime-tickets";
import { isAdminRole } from "@/lib/permissions";
import { primeLastChecked } from "@/lib/prime/track";
import { readPrimeBoardList, type PrimeBoardList } from "@/lib/prime/board";
import { primeProblemsFrom } from "@/lib/prime/problems";
import { cn } from "@/lib/utils";
import { PrimePipeline } from "./prime-pipeline";
import { PrimeParcelList } from "./prime-parcel-list";
import { PrimeProblemsTab } from "./prime-problems-tab";
import { PrimeReturnsTab } from "./prime-returns-tab";
import { PrimeStatementCard } from "./prime-statement-card";
import { PrimeStatementsTab } from "./prime-statements-tab";
import { PrimeTicketsCard } from "./prime-tickets-card";
import { PrimeTicketsTab } from "./prime-tickets-tab";

const PRIME_TABS = ["now", "problems", "statements", "returns", "tickets"] as const;
export type PrimeTab = (typeof PRIME_TABS)[number];

/**
 * The one small Prime page: where today's parcels are along the way, the
 * ones that need a decision, what Prime paid (administrators), why parcels
 * come back, and the tickets with Prime. Everything else about Prime lives on the orders page
 * and the dispatch desk. Hidden for a tenant without a switched-on link.
 */
export function PrimePage() {
    const { t } = useLanguage();
    const { role } = useAuth();
    const admin = isAdminRole(role);
    const connection = usePrimeConnection();
    const { data, isPending, isError } = usePrimeBoard(connection.connected);
    const tickets = usePrimeTickets(connection.connected);
    // The home page's Prime cards and the Prime notifications link straight to a list or a tab.
    const params = useSearchParams();
    const linkedList = readPrimeBoardList(params.get("list"));
    const linkedTicket = Number(params.get("ticket")) || null;
    const linkedTab = PRIME_TABS.find((id) => id === params.get("tab") && (id !== "statements" || admin)) ?? "now";
    const [tab, setTab] = useState<PrimeTab>(linkedTab);
    // A notice clicked while the page is open (a reply from Prime, say) moves it to the linked tab.
    const [seenLink, setSeenLink] = useState(params.toString());
    if (seenLink !== params.toString()) {
        setSeenLink(params.toString());
        setTab(linkedTab);
    }
    const [list, setList] = useState<PrimeBoardList>(linkedList ?? "needs");
    const [statementId, setStatementId] = useState<number | null>(null);
    // «اسأل برايم» on an orders-page card links here with the order to ask about.
    const linkedAsk = params.get("ask");
    const [ticketFor, setTicketFor] = useState<{ orderId: string; draft?: string; label?: string } | null>(linkedAsk ? { orderId: linkedAsk } : null);
    const problemCount = useMemo(() => (data ? primeProblemsFrom(data.views, data.orders, data.readAt).filter((p) => !p.handled).length : 0), [data]);

    if (!connection.checked) return <div className="min-h-screen p-8" aria-busy="true" />;
    if (!connection.connected) {
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="max-w-md rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center">
                    <h1 className="text-xl font-bold text-foreground">{t("prime.page.title")}</h1>
                    <p className="mt-2 text-sm text-muted">{t("prime.page.notConnected")}</p>
                </div>
            </div>
        );
    }

    const lastRead = data ? primeLastChecked(data.views.values()) : null;
    const minutesAgo = data && lastRead !== null ? Math.max(0, Math.round((data.readAt - lastRead) / 60_000)) : null;
    const openTickets = tickets.data?.connected ? tickets.data.tickets.filter((x) => x.open).length : 0;
    const tabs: { id: PrimeTab; label: string; count?: number }[] = [
        { id: "now", label: t("prime.page.tabNow") },
        { id: "problems", label: t("prime.page.tabProblems"), count: problemCount },
        ...(admin ? [{ id: "statements" as const, label: t("prime.page.tabStatements") }] : []),
        { id: "returns", label: t("prime.returns.tab") },
        { id: "tickets", label: t("prime.page.tabTickets"), count: openTickets },
    ];
    const askPrime = (orderId: string, draft?: string, label?: string) => {
        setTicketFor({ orderId, draft, label });
        setTab("tickets");
    };

    return (
        <div className="min-h-screen p-6 md:p-8">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <span aria-hidden="true" className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-[#315EA8]">
                            <span className="h-3.5 w-[46px] bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("prime.page.title")}</h1>
                            <p className="mt-0.5 text-sm text-muted">
                                {connection.branchName ?? t("orders.prime.stop.branch")} · {t("prime.page.connected")}
                                {minutesAgo !== null && <> · {t("orders.prime.row.checked", { min: minutesAgo })}</>}
                            </p>
                        </div>
                    </div>
                    <div role="tablist" className="flex rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
                        {tabs.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === item.id}
                                onClick={() => setTab(item.id)}
                                className={cn(
                                    "inline-flex h-10 items-center gap-2 rounded-full px-[18px] text-sm font-semibold transition-colors",
                                    tab === item.id ? "bg-[var(--ink)] text-white dark:bg-white dark:text-[var(--ink)]" : "text-muted hover:text-foreground",
                                )}
                            >
                                {item.label}
                                {!!item.count && (
                                    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#E8EEF8] px-1.5 text-xs font-bold text-[#1F3F75] tabular-nums">
                                        {item.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </header>

                {tab === "now" &&
                    (isError ? (
                        <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("prime.page.loadFailed")}</p>
                    ) : isPending || !data ? (
                        <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />
                    ) : (
                        <>
                            <PrimePipeline board={data.board} branchName={connection.branchName} selected={list} onSelect={setList} />
                            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-[18px]">
                                <PrimeParcelList data={data} list={list} onShowNeeds={() => setList("needs")} onAskPrime={askPrime} />
                                <div className="flex min-w-0 flex-col gap-[18px]">
                                    {admin && (
                                        <PrimeStatementCard
                                            onOpen={(id) => {
                                                setStatementId(id);
                                                setTab("statements");
                                            }}
                                        />
                                    )}
                                    <PrimeTicketsCard tickets={tickets.data?.connected ? tickets.data.tickets : null} onOpen={() => setTab("tickets")} />
                                </div>
                            </div>
                        </>
                    ))}
                {tab === "problems" &&
                    (isError ? (
                        <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("prime.page.loadFailed")}</p>
                    ) : isPending || !data ? (
                        <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />
                    ) : (
                        <PrimeProblemsTab data={data} onAskPrime={(orderId) => askPrime(orderId)} />
                    ))}
                {tab === "statements" && admin && <PrimeStatementsTab selected={statementId} onSelect={setStatementId} onAskPrime={askPrime} />}
                {tab === "returns" && <PrimeReturnsTab />}
                {tab === "tickets" && (
                    <PrimeTicketsTab
                        key={linkedTicket ?? "tickets"}
                        tickets={tickets}
                        linkedTicket={linkedTicket}
                        newFor={ticketFor ? { ...ticketFor, order: data?.orders.get(ticketFor.orderId) ?? null } : null}
                        onNew={(orderId, label) => setTicketFor({ orderId, label })}
                        onNewDone={() => setTicketFor(null)}
                    />
                )}
            </div>
        </div>
    );
}
