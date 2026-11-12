"use client";

import type { ReactNode } from "react";
import {
    ArrowRight, BadgeCheck, CircleSlash, Copy, Flag, Gift, Link2, MessageCircle, PackagePlus, PencilLine,
    Pin, Printer, Reply, StickyNote, Truck, Undo2,
} from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { CONFIRMATION_TEMPLATE_NAMES, REMINDER_TEMPLATE_NAMES } from "@scheniders/shared/whatsapp-templates";
import { cn, formatIQD, getBaseOrderId } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { toast } from "@/hooks/use-toast";
import { orderStatusTone } from "@/lib/order-status-labels";
import { formatScheduledDate, formatTime } from "@/lib/order-format-utils";
import { formatBaghdadDate } from "@/lib/baghdad-date";
import { formatDeliverySlot, parseDeliverySlot } from "@/lib/orders/delivery-slot";
import { formatDuration, type ActivityEvent, type FieldChange, type OrderActivity } from "@/lib/orders/order-activity";
import { HistoryActor } from "./history-actor";

type Tone = { icon: typeof ArrowRight; ring: string };

const TONES: Record<string, Tone> = {
    created: { icon: PackagePlus, ring: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200" },
    status: { icon: ArrowRight, ring: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200" },
    edit: { icon: PencilLine, ring: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" },
    flag: { icon: Flag, ring: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" },
    note: { icon: StickyNote, ring: "bg-[var(--pastel-yellow)] text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-100" },
    label_printed: { icon: Printer, ring: "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-200" },
    courier: { icon: Truck, ring: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200" },
    payment: { icon: BadgeCheck, ring: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" },
    refund: { icon: Undo2, ring: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-200" },
    whatsapp: { icon: MessageCircle, ring: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200" },
    whatsapp_reply: { icon: Reply, ring: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200" },
    related: { icon: Link2, ring: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200" },
};

const MONEY_FIELDS = new Set(["price", "delivery_fee", "discount"]);
/** The confirmation and reminder templates under every name they were sent as. */
const CONFIRM_TEMPLATES = new Set(CONFIRMATION_TEMPLATE_NAMES);
const REMINDER_TEMPLATES = new Set(REMINDER_TEMPLATE_NAMES);

function StatusPill({ status, isReturn }: { status: string; isReturn: boolean }) {
    const statusLabel = useStatusLabel();
    return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", orderStatusTone(status))}>
            {statusLabel(status, isReturn)}
        </span>
    );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
    return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", className)}>{children}</span>;
}

function useFieldValue() {
    const { t, language } = useLanguage();
    return (f: string, value: string | null): string => {
        if (value === null || value.trim() === "") return t("orders.history.emptyValue");
        if (MONEY_FIELDS.has(f)) {
            const n = Number(value);
            return Number.isFinite(n) ? formatIQD(n) : value;
        }
        if (f === "governorate") return governorateLabel(value, language);
        if (f === "scheduled_date") return formatScheduledDate(value);
        if (f === "order_date") return formatBaghdadDate(value);
        if (f === "delivery_slot") {
            const slot = parseDeliverySlot(value);
            return slot ? formatDeliverySlot(slot, language) : value;
        }
        if (f === "priority") return t(`orderDetail.priority.${value}`, value);
        if (f === "payment_status") return t(`orders.confirm.payment.${value}`, value);
        if (f === "order_number") return `#${getBaseOrderId(value)}`;
        return value;
    };
}

function FieldDiff({ fields }: { fields: FieldChange[] }) {
    const { t } = useLanguage();
    const value = useFieldValue();
    return (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
            {fields.map((c, i) => (
                <div key={`${c.f}-${i}`} className="contents">
                    <dt className="pt-0.5 text-xs text-[var(--foreground-muted)]">{t(`orders.history.field.${c.f}`, c.f)}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {c.f === "raw" ? (
                            <span dir="auto" className="break-words">{c.new}</span>
                        ) : c.f === "items" && c.old === null && c.new === null ? (
                            <span>{t("orders.history.itemsChanged")}</span>
                        ) : (
                            <>
                                <span dir="auto" className="rounded-md bg-rose-50 px-1.5 text-rose-700 line-through decoration-rose-400/70 dark:bg-rose-500/10 dark:text-rose-300 break-words">
                                    {value(c.f, c.old)}
                                </span>
                                <ArrowRight aria-hidden="true" className="h-3 w-3 shrink-0 text-[var(--foreground-subtle)]" />
                                <span dir="auto" className="rounded-md bg-emerald-50 px-1.5 font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200 break-words">
                                    {value(c.f, c.new)}
                                </span>
                            </>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function CopyTracking({ number }: { number: string }) {
    const { t } = useLanguage();
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(number);
            toast.success(t("orders.history.courier.copied"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("toast.fetchFailed"));
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            title={t("orders.history.courier.copy")}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--foreground)] transition-colors hover:border-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
            {number}
            <Copy aria-hidden="true" className="h-3 w-3 text-[var(--foreground-muted)]" />
        </button>
    );
}

const SOURCE_KEYS = new Set(["storefront", "manual", "meta", "tiktok", "whatsapp", "lightfunnels", "other"]);

/** Title, chips and details for one event. */
function EventBody({ e, order, isReturn }: { e: ActivityEvent; order: OrderActivity["order"]; isReturn: boolean }) {
    const { t } = useLanguage();
    const company = (c: string) => t(`orders.history.company.${c}`, c);
    const title = (s: string) => <bdi className="text-sm font-semibold text-[var(--foreground)]">{s}</bdi>;
    const sub = (s: ReactNode) => <p dir="auto" className="mt-1 text-left text-[13px] text-[var(--foreground-muted)] break-words">{s}</p>;

    switch (e.kind) {
        case "created": {
            const source = order.source && SOURCE_KEYS.has(order.source) ? t(`orders.history.source.${order.source}`) : order.source;
            const facts = [
                source ? t("orders.history.created.source", { source }) : null,
                order.created_via === "claude" ? t("orders.history.created.viaClaude") : order.entered_by ? t("orders.history.created.enteredBy", { name: order.entered_by }) : null,
                order.original?.order_number
                    ? t(order.is_return ? "orders.history.created.refundOf" : "orders.history.created.replacementOf", { number: getBaseOrderId(order.original.order_number) })
                    : null,
            ].filter(Boolean);
            return (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {title(t("orders.history.created"))}
                        <StatusPill status={isReturn ? "return_pending" : "new"} isReturn={isReturn} />
                        {facts.map((f) => <Chip key={f} className="bg-[var(--card-bg)] text-[var(--foreground-muted)] ring-1 ring-[var(--card-border)]"><bdi>{f}</bdi></Chip>)}
                    </div>
                    {(order.items || order.price !== null) && sub(
                        [order.items, order.pieces ? t("orders.history.pieces", { count: order.pieces }) : null, order.price !== null ? formatIQD(order.price) : null]
                            .filter(Boolean).join(" · "),
                    )}
                </>
            );
        }
        case "status":
            return (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={e.from} isReturn={isReturn} />
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-[var(--foreground-subtle)]" />
                        <StatusPill status={e.to} isReturn={isReturn} />
                        {e.stayedMs !== null && (
                            <StayedChip ms={e.stayedMs} status={e.from} isReturn={isReturn} />
                        )}
                    </div>
                    {e.notes && sub(e.to === "rejected" || e.to === "cancelled" ? t("orders.history.reason", { reason: e.notes }) : e.notes)}
                </>
            );
        case "edit":
            return (
                <>
                    {title(t("orders.history.edit"))}
                    <FieldDiff fields={e.fields} />
                </>
            );
        case "flag":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    {e.flags.map((f, i) => {
                        if (f.f === "gift") return <Chip key={i} className="bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-200"><Gift className="h-3 w-3" /><bdi>{t(f.on ? "orders.history.flag.giftOn" : "orders.history.flag.giftOff")}</bdi></Chip>;
                        if (f.f === "pinned") return <Chip key={i} className="bg-stone-100 text-stone-700 dark:bg-white/10 dark:text-stone-200"><Pin className="h-3 w-3" /><bdi>{t(f.on ? "orders.history.flag.pinnedOn" : "orders.history.flag.pinnedOff")}</bdi></Chip>;
                        const p = (v: string | null | undefined) => t(`orderDetail.priority.${v || "normal"}`, v || "normal");
                        return <Chip key={i} className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"><Flag className="h-3 w-3" /><bdi>{t("orders.history.flag.priority", { from: p(f.old), to: p(f.new) })}</bdi></Chip>;
                    })}
                </div>
            );
        case "note":
            return (
                <>
                    {title(t("orders.history.note"))}
                    <p dir="auto" className="mt-1 whitespace-pre-wrap text-left rounded-lg bg-[var(--pastel-yellow-light)] px-2.5 py-1.5 text-[13px] text-[var(--foreground)] dark:bg-yellow-500/10 break-words">{e.text}</p>
                </>
            );
        case "label_printed":
            return title(e.count !== null && e.count > 1 ? t("orders.history.labelAgain", { count: e.count }) : t("orders.history.label"));
        case "courier": {
            const name = company(e.company);
            const heading = {
                submitted: t("orders.history.courier.submitted", { company: name }),
                resent: t("orders.history.courier.resent", { company: name }),
                status: t("orders.history.courier.status", { company: name }),
                synced: t("orders.history.courier.synced", { company: name }),
                sync_failed: t("orders.history.courier.syncFailed", { company: name }),
                cancelled: t("orders.history.courier.cancelled", { company: name }),
            }[e.action];
            return (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {title(heading)}
                        {e.step && <Chip className="bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200"><bdi>{e.step}</bdi></Chip>}
                        {e.tracking && <CopyTracking number={e.tracking} />}
                    </div>
                    {e.reason && sub(e.reason)}
                </>
            );
        }
        case "payment":
            return title(t(e.checked ? "orders.history.payment.checked" : "orders.history.payment.unchecked"));
        case "refund":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    {title(t("orders.history.refund", { status: t(`orders.history.refund.${e.to ?? "none"}`, e.to ?? "") }))}
                    {e.amount !== null && e.amount > 0 && <Chip className="bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-200">{formatIQD(e.amount)}</Chip>}
                </div>
            );
        case "whatsapp": {
            const name = CONFIRM_TEMPLATES.has(e.template ?? "") ? t("orders.history.wa.confirm") : REMINDER_TEMPLATES.has(e.template ?? "") ? t("orders.history.wa.reminder") : t("orders.history.wa");
            const tone = e.state === "failed"
                ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200"
                : e.state === "read"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
                    : "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200";
            const timing = [
                e.deliveredAt && e.state !== "failed" ? t("orders.history.wa.deliveredAt", { time: formatTime(e.deliveredAt) }) : null,
                e.readAt ? t("orders.history.wa.readAt", { time: formatTime(e.readAt) }) : null,
            ].filter(Boolean).join(" · ");
            return (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {title(name)}
                        <Chip className={tone}>
                            {e.state === "failed" ? <CircleSlash className="h-3 w-3" /> : <span aria-hidden="true" className="tracking-[-0.2em]">{e.state === "sent" ? "✓" : "✓✓"}</span>}
                            <bdi>{t(`orders.history.wa.${e.state}`)}</bdi>
                        </Chip>
                    </div>
                    {(timing || e.reason) && sub([timing, e.reason].filter(Boolean).join(" · "))}
                </>
            );
        }
        case "whatsapp_reply":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    {title(t("orders.history.wa.reply"))}
                    {e.button && <Chip className="bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200"><bdi>{t("orders.history.wa.pressed", { button: e.button })}</bdi></Chip>}
                </div>
            );
        case "related":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    {title(t(`orders.history.related.${e.relation}`))}
                    {e.orderNumber && <Chip className="bg-fuchsia-100 font-mono text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-200">#{getBaseOrderId(e.orderNumber)}</Chip>}
                </div>
            );
    }
}

function StayedChip({ ms, status, isReturn }: { ms: number; status: string; isReturn: boolean }) {
    const { t, language } = useLanguage();
    const statusLabel = useStatusLabel();
    return (
        <span className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--foreground-muted)]">
            <bdi>{t("orders.history.stayed", { duration: formatDuration(ms, language), status: statusLabel(status, isReturn) })}</bdi>
        </span>
    );
}

/** One row of the feed: the icon on the rail, then the card. */
export function HistoryEvent({ e, order, isReturn, isLast }: { e: ActivityEvent; order: OrderActivity["order"]; isReturn: boolean; isLast: boolean }) {
    const tone = e.kind === "flag" && e.flags.every((f) => f.f === "gift") ? { ...TONES.flag, icon: Gift } : TONES[e.kind];
    const Icon = tone.icon;
    const exact = new Date(e.at);
    return (
        <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-3">
            {!isLast && <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-[var(--card-border)]" />}
            <span aria-hidden="true" className={cn("relative z-10 grid h-8 w-8 place-items-center rounded-full", tone.ring)}>
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 rounded-xl border border-[var(--card-border)] bg-[var(--background-soft)] px-3 py-2.5">
                <EventBody e={e} order={order} isReturn={isReturn} />
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-[var(--foreground-muted)]">
                    <HistoryActor actor={e.actor} kind={e.actorKind} />
                    <time dateTime={e.at} title={`${formatBaghdadDate(exact)} ${formatTime(exact)}`} className="shrink-0 tabular-nums">
                        {formatTime(exact)}
                    </time>
                </div>
            </div>
        </li>
    );
}
