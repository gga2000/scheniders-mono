"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTillClockWeek, type TillMember } from "@/hooks/use-shops";
import { hoursByPerson } from "@/lib/till/hours";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";

/** Who worked how long this week, from clocking in and out on the till. */
export function TillHoursCard({ members }: { members: TillMember[] }) {
    const { t } = useLanguage();
    const clock = useTillClockWeek();
    // Open shifts count up to when the card loaded.
    const [now] = useState(() => Date.now());
    const people = hoursByPerson(clock.data ?? [], now);
    const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "";

    return (
        <section className={`${CARD} flex flex-col gap-4 p-5`}>
            <div>
                <h2 className="text-lg font-bold text-foreground">{t("till.hours.title")}</h2>
                <p className="text-left text-sm text-muted" dir="auto">{t("till.hours.subtitle")}</p>
            </div>
            {clock.isError ? (
                <p className="text-sm text-muted">{t("till.hours.failed")}</p>
            ) : clock.isPending ? (
                <div className="h-24 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
            ) : people.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-sm text-muted" dir="auto">
                    {t("till.hours.empty")}
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                    {people.map((p) => (
                        <li key={p.userId} className="flex items-center gap-3 py-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBE38E] text-[#1E1E1E]" aria-hidden="true">
                                <Clock3 className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                    {nameOf(p.userId)}
                                    {p.onNow && (
                                        <span className="ms-2 rounded-full bg-[#E3F6DA] px-2 py-0.5 text-xs font-semibold text-[#14532D]">{t("till.hours.onNow")}</span>
                                    )}
                                </span>
                                <span className="block truncate text-left text-xs text-muted" dir="auto">
                                    {t("till.hours.days", { n: p.days })}
                                    {p.forgot > 0 && <span className="text-[#991B1B]"> · {t("till.hours.forgot", { n: p.forgot })}</span>}
                                </span>
                            </span>
                            <span className="shrink-0 text-base font-bold tabular-nums text-foreground" dir="auto">
                                {t("till.hours.hours", { h: Math.floor(p.minutes / 60), m: p.minutes % 60 })}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
