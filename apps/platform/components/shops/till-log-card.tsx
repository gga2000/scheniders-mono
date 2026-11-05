"use client";

import { useState } from "react";
import { HandCoins, MinusCircle, Pencil, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTillEvents, type Shop, type TillEvent, type TillMember } from "@/hooks/use-shops";
import { dateLocale, formatIqd } from "@/lib/till/cart";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]";
type Kind = TillEvent["kind"];
const KINDS: Kind[] = ["line_removed", "price_changed", "discount_approved", "payout"];
const ICON: Record<Kind, typeof HandCoins> = { line_removed: MinusCircle, price_changed: Pencil, discount_approved: ShieldCheck, payout: HandCoins };
const TINT: Record<Kind, string> = {
    line_removed: "bg-[#FDE7EA] text-[#991B1B]",
    price_changed: "bg-[#FBE38E] text-[#1E1E1E]",
    discount_approved: "bg-[#B8E8E0] text-[#1E1E1E]",
    payout: "bg-[#E4C1F9] text-[#1E1E1E]",
};

type Line = { name?: unknown; variant_name?: unknown; quantity?: unknown; price?: unknown; list_price?: unknown };
const asLines = (v: unknown): Line[] => (Array.isArray(v) ? (v as Line[]) : []);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What happened at the tills that the owner may want to check: removed items, price cuts, manager OKs, pay-outs. */
export function TillLogCard({ shops, members }: { shops: Shop[]; members: TillMember[] }) {
    const { t, language } = useLanguage();
    const events = useTillEvents();
    const [kind, setKind] = useState<Kind | "all">("all");
    const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? "";
    const shopOf = (id: string) => shops.find((s) => s.id === id)?.name ?? "";
    const shown = (events.data ?? []).filter((e) => kind === "all" || e.kind === kind);
    const when = (iso: string) =>
        new Date(iso).toLocaleString(dateLocale(language), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Baghdad" });

    const describe = (e: TillEvent): { text: string; amount: number } => {
        if (e.kind === "payout") return { text: str(e.data.note), amount: num(e.data.amount) };
        if (e.kind === "discount_approved") {
            return { text: t("till.log.approvedBy", { name: nameOf(e.approved_by) }), amount: num(e.data.discount) + num(e.data.line_off) };
        }
        const lines = asLines(e.data.lines);
        const text = lines.map((l) => `${str(l.name)}${str(l.variant_name) ? ` ${str(l.variant_name)}` : ""}${num(l.quantity) > 1 ? ` ×${num(l.quantity)}` : ""}`).join("، ");
        const amount =
            e.kind === "price_changed"
                ? lines.reduce((sum, l) => sum + (num(l.list_price) - num(l.price)) * num(l.quantity), 0)
                : lines.reduce((sum, l) => sum + num(l.price) * num(l.quantity), 0);
        return { text, amount };
    };

    return (
        <section className={`${CARD} flex flex-col gap-4 p-5 lg:col-span-2`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{t("till.log.title")}</h2>
                    <p className="text-left text-sm text-muted" dir="auto">{t("till.log.subtitle")}</p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--card-border)]/30 p-1" role="group" aria-label={t("till.log.title")}>
                    {(["all", ...KINDS] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            aria-pressed={kind === k}
                            onClick={() => setKind(k)}
                            className={cn("h-10 rounded-xl px-3 text-sm font-semibold", kind === k ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted")}
                        >
                            {t(`till.log.kind.${k}`)}
                        </button>
                    ))}
                </div>
            </div>

            {events.isError ? (
                <p className="text-sm text-muted">{t("till.log.loadFailed")}</p>
            ) : events.isPending ? (
                <div className="h-32 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
            ) : shown.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-sm text-muted" dir="auto">
                    {t("till.log.empty")}
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                    {shown.map((e) => {
                        const Icon = ICON[e.kind];
                        const d = describe(e);
                        return (
                            <li key={e.id} className="flex items-center gap-3 py-3">
                                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TINT[e.kind])} aria-hidden="true">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                        {t(`till.log.kind.${e.kind}`)} · {d.text}
                                    </span>
                                    <span className="block truncate text-left text-xs text-muted" dir="auto">
                                        {nameOf(e.cashier_id)} · {shopOf(e.shop_id)} · {when(e.created_at)}
                                    </span>
                                </span>
                                <span className="shrink-0 text-base font-bold tabular-nums text-foreground">{formatIqd(d.amount)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
