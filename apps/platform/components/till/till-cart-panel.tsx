"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, ArrowUp, Bookmark, FlaskConical, Minus, Package, Pencil, Plus, ScanBarcode, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { logRemovedLines, useTillCustomer } from "@/hooks/use-till";
import type { TillMember } from "@/hooks/use-shops";
import { dateLocale, discountGiven, formatIqd, itemCount, listSubtotalOf, maxDiscount, parseDinars, setLinePrice, setQuantity, subtotalOf, type CartLine } from "@/lib/till/cart";
import { CART_TARGET_ID } from "@/lib/till/feedback";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";
import { TillManagerDialog } from "./till-manager-dialog";
import { APPROVAL_MS, approvalClock, approvalCovers, approvalTone, type Ticket } from "./till-ticket";
import { useLinesAbove, useShowChangedLine } from "./use-show-changed-line";

interface Props {
    tickets: Ticket[];
    activeId: string;
    onSwitch: (id: string) => void;
    onNew: () => void;
    onChange: (ticket: Ticket) => void;
    onPay: () => void;
    /** Discount rules for the cashier at the till. */
    canDiscount: boolean;
    discountLimitPct: number | null;
    isManager: boolean;
    cashierName: string;
    sessionId: string;
    /** Managers with a PIN who can allow a discount over the limit here. */
    managers: TillMember[];
    /** Put this cart's bottles aside for the customer. */
    onKeepAside: () => void;
    /** Bottles kept aside in this shop right now. */
    holdsCount: number;
    onHolds: () => void;
    /** Open the shop's tester bottles (open one, mark one used up). */
    onTesters: () => void;
    /** Cart lines selling more than the system shows in stock (allowed; the count needs fixing). */
    overSold: ReadonlySet<string>;
}

/** The right side of the sell screen: held sales as tabs, the customer, the lines, discount, total. */
export function TillCartPanel({ tickets, activeId, onSwitch, onNew, onChange, onPay, canDiscount, discountLimitPct, isManager, cashierName, sessionId, managers, onKeepAside, holdsCount, onHolds, onTesters, overSold }: Props) {
    const { t } = useLanguage();
    const ticket = tickets.find((x) => x.id === activeId) ?? tickets[0];
    const subtotal = subtotalOf(ticket.cart);
    const limit = maxDiscount(listSubtotalOf(ticket.cart), discountLimitPct, isManager);
    const given = discountGiven(ticket.cart, ticket.discount);
    const total = Math.max(0, subtotal - ticket.discount);
    const [customerOpen, setCustomerOpen] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);
    const [discountText, setDiscountText] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const [askManager, setAskManager] = useState(false);
    const listRef = useRef<HTMLUListElement>(null);
    const shownLines = useMemo(() => ticket.cart.map((l) => ({ id: l.key, quantity: l.quantity })), [ticket.cart]);
    useShowChangedLine(listRef, shownLines, ticket.id);
    const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
    const above = useLinesAbove(listEl);

    const normalPhone = ticket.phone.trim() ? normalizeIraqiMobile(ticket.phone) : null;
    const phoneBad = ticket.phone.trim() !== "" && !normalPhone;
    const customer = useTillCustomer(sessionId, normalPhone);
    const overLimit = limit !== null && given > limit;
    // A manager's OK covers the amount they saw for 15 minutes; tick so the chip counts down and drops when it runs out.
    const [now, setNow] = useState(() => Date.now());
    const approval = ticket.approval;
    useEffect(() => {
        if (!approval) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [approval]);
    const approved = approvalCovers(approval, given, now);
    const discountTooBig = overLimit && !approved;
    // Line price cuts count toward the limit too, so spell out where the total comes from.
    const lineCuts = given - ticket.discount;
    const overText = limit === null ? "" : t("till.manager.overShort", { given: formatIqd(given), limit: formatIqd(limit), extra: formatIqd(given - limit) });
    const overParts = lineCuts > 0 && ticket.discount > 0 ? t("till.manager.overParts", { lines: formatIqd(lineCuts), discount: formatIqd(ticket.discount) }) : null;

    // Items taken out before payment go to the owner's log; the sale never waits on it.
    const changeQuantity = (l: CartLine, quantity: number) => {
        const removed = l.quantity - Math.max(0, quantity);
        if (removed > 0) {
            void logRemovedLines(sessionId, [
                { product_id: l.product_id, variant_id: l.variant_id, name: l.name, variant_name: l.variant_name, quantity: removed, price: l.price },
            ]).catch((err: unknown) => Sentry.captureException(err, { tags: { area: "till", op: "log_removed" } }));
        }
        onChange({ ...ticket, cart: setQuantity(ticket.cart, l.key, quantity) });
    };

    const applyDiscount = (text: string) => {
        const amount = parseDinars(text);
        setDiscountText(amount > 0 ? formatIqd(amount) : "");
        onChange({ ...ticket, discount: Math.min(subtotal, amount) });
    };

    return (
        <aside className="flex min-h-0 w-[420px] shrink-0 flex-col border-l border-[var(--card-border)] bg-[var(--card-bg)]">
            <div className="flex gap-2 overflow-x-auto border-b border-[var(--card-border)] p-3">
                {tickets.map((x, i) => {
                    const on = x.id === ticket.id;
                    const label = x.customerName.trim() || t("till.cart.walkIn", { n: i + 1 });
                    return (
                        <button
                            key={x.id}
                            type="button"
                            onClick={() => {
                                setDiscountText("");
                                setDiscountOpen(false);
                                setCustomerOpen(false);
                                onSwitch(x.id);
                            }}
                            className={cn(
                                "flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold",
                                on ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                            )}
                        >
                            <span dir="auto" className="max-w-[110px] truncate">{label}</span>
                            <span className={cn("text-xs tabular-nums", on ? "opacity-80" : "text-muted")}>{formatIqd(Math.max(0, subtotalOf(x.cart) - x.discount))}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={onNew}
                    className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("till.cart.newSale")}
                </button>
                {holdsCount > 0 && (
                    <button
                        type="button"
                        onClick={onHolds}
                        className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                    >
                        <Bookmark className="h-4 w-4" aria-hidden="true" />
                        {t("till.holds.tab", { n: holdsCount })}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onTesters}
                    className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                >
                    <FlaskConical className="h-4 w-4" aria-hidden="true" />
                    {t("till.testers.title")}
                </button>
            </div>

            <div className="border-b border-[var(--card-border)] px-4 py-3">
                {customerOpen || ticket.customerName || ticket.phone ? (
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            value={ticket.customerName}
                            onChange={(e) => onChange({ ...ticket, customerName: e.target.value.slice(0, 100) })}
                            placeholder={t("till.cart.customerName")}
                            aria-label={t("till.cart.customerName")}
                            className="h-12 rounded-2xl border border-stone-400 dark:border-white/25 bg-transparent px-3 text-sm text-foreground outline-none focus:border-[var(--ink)]"
                            dir="auto"
                        />
                        <input
                            value={ticket.phone}
                            onChange={(e) => onChange({ ...ticket, phone: e.target.value.slice(0, 20) })}
                            placeholder={t("till.cart.phone")}
                            aria-label={t("till.cart.phone")}
                            aria-invalid={phoneBad || undefined}
                            inputMode="tel"
                            className={cn(
                                "h-12 rounded-2xl border border-stone-400 dark:border-white/25 bg-transparent px-3 text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)]",
                                phoneBad && "border-red-500",
                            )}
                        />
                        {phoneBad && <p className="col-span-2 text-xs text-red-600">{t("till.cart.phoneBad")}</p>}
                        {customer.data && (
                            <CustomerCard
                                c={customer.data}
                                nameEmpty={!ticket.customerName.trim()}
                                onUseName={(name) => onChange({ ...ticket, customerName: name })}
                            />
                        )}
                        {customer.data === null && normalPhone && <p className="col-span-2 text-xs text-muted">{t("till.cart.newCustomer")}</p>}
                    </div>
                ) : (
                    <button type="button" onClick={() => setCustomerOpen(true)} className="flex h-12 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                        {t("till.cart.addCustomer")}
                    </button>
                )}
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
            {above > 0 && (
                <>
                    {/* A soft edge so a half-hidden line reads as "more up there", not as a cut row. */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-[var(--card-bg)] from-50% to-transparent" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={() => listRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                        className="absolute left-1/2 top-1 z-20 flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--ink)] px-4 text-sm font-semibold text-white shadow-md dark:bg-white dark:text-zinc-900"
                        dir="auto"
                    >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        {t("till.cart.moreAbove", { n: above })}
                    </button>
                </>
            )}
            <ul
                ref={(el) => {
                    listRef.current = el;
                    setListEl(el);
                }}
                id={CART_TARGET_ID} className="min-h-0 flex-1 overflow-y-auto">
                {ticket.cart.length === 0 ? (
                    <li className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--card-border)]/40 text-muted">
                            <ScanBarcode className="h-7 w-7" aria-hidden="true" />
                        </span>
                        <span className="text-sm text-muted" dir="auto">{t("till.cart.empty")}</span>
                    </li>
                ) : (
                    ticket.cart.map((l) => (
                        <li key={l.key} className="border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--card-border)]/25 text-muted">
                                {l.image_url ? <img src={l.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                                    {l.name}
                                    {l.variant_name && <span className="font-normal text-muted"> · {l.variant_name}</span>}
                                </span>
                                {overSold.has(l.key) && (
                                    <span className="mt-0.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" dir="auto">
                                        {t("till.cart.overSold")}
                                    </span>
                                )}
                                {canDiscount ? (
                                    <button
                                        type="button"
                                        onClick={() => setEditing(editing === l.key ? null : l.key)}
                                        aria-expanded={editing === l.key}
                                        className="-my-2 flex min-h-11 max-w-full items-center gap-1 text-left text-xs leading-tight tabular-nums text-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {l.price < l.list_price ? (
                                            <span className="font-semibold text-foreground" dir="auto">{t("till.cart.each", { price: formatIqd(l.price) })}</span>
                                        ) : (
                                            <span dir="auto">{t("till.cart.each", { price: formatIqd(l.price) })}</span>
                                        )}
                                    </button>
                                ) : (
                                    <span className="text-xs tabular-nums text-muted">{t("till.cart.each", { price: formatIqd(l.price) })}</span>
                                )}
                            </span>
                            <span className="flex h-12 items-center rounded-2xl border border-[var(--card-border)]">
                                <button
                                    type="button"
                                    onClick={() => changeQuantity(l, l.quantity - 1)}
                                    aria-label={l.quantity === 1 ? t("till.cart.remove") : t("till.cart.less")}
                                    className="flex h-12 w-11 items-center justify-center text-foreground"
                                >
                                    {l.quantity === 1 ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                <span className="w-8 text-center text-base font-semibold tabular-nums text-foreground">{l.quantity}</span>
                                <button
                                    type="button"
                                    onClick={() => changeQuantity(l, l.quantity + 1)}
                                    aria-label={t("till.cart.more")}
                                    className="flex h-12 w-11 items-center justify-center text-foreground"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </span>
                            <span className="flex w-[84px] flex-col items-end">
                                <span className="text-base font-bold tabular-nums text-foreground">{formatIqd(l.price * l.quantity)}</span>
                                {l.price < l.list_price && <span className="text-xs tabular-nums text-muted line-through">{formatIqd(l.list_price * l.quantity)}</span>}
                            </span>
                        </div>
                        {editing === l.key && (
                            <LinePriceEditor
                                line={l}
                                onPrice={(price) => onChange({ ...ticket, cart: setLinePrice(ticket.cart, l.key, price) })}
                                onDone={() => setEditing(null)}
                            />
                        )}
                        </li>
                    ))
                )}
            </ul>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--card-border)] p-4">
                {canDiscount && ticket.cart.length > 0 && (
                    <div className="flex items-center justify-between gap-3">
                        {discountOpen || ticket.discount > 0 ? (
                            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                {t("till.cart.discount")}
                                <input
                                    autoFocus={discountOpen}
                                    value={discountText || (ticket.discount ? formatIqd(ticket.discount) : "")}
                                    onChange={(e) => applyDiscount(e.target.value)}
                                    onBlur={() => setDiscountText("")}
                                    inputMode="numeric"
                                    className={cn(
                                        "h-12 w-32 rounded-2xl border bg-transparent px-3 text-right tabular-nums outline-none",
                                        // Over the limit stays red while the cashier is still typing the amount.
                                        discountTooBig ? "border-red-500 focus:border-red-600" : "border-stone-400 focus:border-[var(--ink)] dark:border-white/25",
                                    )}
                                />
                            </label>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setDiscountOpen(true)}
                                className="h-12 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                            >
                                {t("till.cart.addDiscount")}
                            </button>
                        )}
                        {approval && approved && overLimit ? (
                            <span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors", approvalTone(approval.expiresAt - now))} dir="auto">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                    {t("till.manager.allowedFor", { name: approval.managerName, amount: formatIqd(approval.maxOff) })}{" "}
                                    <span className="whitespace-nowrap font-bold tabular-nums">· {approvalClock(approval.expiresAt - now)}</span>
                                </span>
                            </span>
                        ) : discountTooBig ? null : (
                            <span className="text-right text-xs text-muted" dir="auto">
                                {limit === null
                                    ? t("till.cart.anyDiscount", { name: cashierName })
                                    : given > 0
                                      ? t("till.cart.limitLeft", { left: formatIqd(limit - given), amount: formatIqd(limit) })
                                      : t("till.cart.upTo", { name: cashierName, pct: discountLimitPct ?? 0, amount: formatIqd(limit) })}
                            </span>
                        )}
                    </div>
                )}
                {discountTooBig && limit !== null && (
                    <div className="flex flex-col gap-1 rounded-2xl bg-red-50 px-3 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        {/* Three figures side by side, so the cart above keeps its room while the manager looks. */}
                        <dl className="grid grid-cols-3 gap-2 text-center">
                            <div>
                                <dt className="text-xs" dir="auto">{t("till.manager.rowGiven")}</dt>
                                <dd className="text-base font-semibold tabular-nums">{formatIqd(given)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs" dir="auto">{t("till.manager.rowLimit")}</dt>
                                <dd className="text-base font-semibold tabular-nums">{formatIqd(limit)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold" dir="auto">{t("till.manager.rowOver")}</dt>
                                <dd className="text-base font-bold tabular-nums">{formatIqd(given - limit)}</dd>
                            </div>
                        </dl>
                        {overParts && <p className="text-center text-xs" dir="auto">{overParts}</p>}
                    </div>
                )}

                {ticket.discount > 0 && (
                    <p className="flex justify-between text-sm tabular-nums text-muted">
                        <span>{t("till.cart.subtotal")}</span>
                        <span>{formatIqd(subtotal)}</span>
                    </p>
                )}
                <div className="flex items-end justify-between">
                    <span className="text-sm font-semibold text-muted">
                        {t("till.cart.total")}
                        {ticket.cart.length > 0 && <span className="block text-xs font-normal">{t("till.cart.items", { n: itemCount(ticket.cart) })}</span>}
                    </span>
                    <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
                        {formatIqd(total)} <span className="text-lg font-semibold text-muted">{t("till.iqd")}</span>
                    </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-2">
                <button
                    type="button"
                    onClick={onKeepAside}
                    disabled={ticket.cart.length === 0 || phoneBad}
                    title={t("till.hold.title")}
                    className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-[var(--card-border)] px-4 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                    <Bookmark className="h-5 w-5" aria-hidden="true" />
                    {t("till.hold.button")}
                </button>
                <button
                    type="button"
                    // Over the limit, the one big button takes the next step: asking a manager.
                    onClick={discountTooBig ? () => setAskManager(true) : onPay}
                    disabled={ticket.cart.length === 0 || phoneBad}
                    className={cn("h-16 rounded-2xl text-xl font-bold transition-colors", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-foreground/70 dark:disabled:bg-white/10 dark:disabled:text-white/70")}
                >
                    {phoneBad ? (
                        // Says why it can't be pressed, even with the customer row folded away.
                        <span className="text-base" dir="auto">{t("till.cart.phoneBad")}</span>
                    ) : discountTooBig ? (
                        <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                            {t("till.manager.ask")}
                        </span>
                    ) : (
                        t("till.cart.pay", { total: formatIqd(total) })
                    )}
                </button>
                </div>
            </div>
            {askManager && limit !== null && (
                <TillManagerDialog
                    sessionId={sessionId}
                    managers={managers}
                    reason={overText}
                    maxOff={given}
                    purpose="sale"
                    onApproved={(ok) => {
                        setAskManager(false);
                        onChange({ ...ticket, approval: { ...ok, maxOff: given, expiresAt: Date.now() + APPROVAL_MS } });
                    }}
                    onClose={() => setAskManager(false)}
                />
            )}
        </aside>
    );
}

/** Sell one line for less: quick cuts or a typed price, never above the catalog price. */
function LinePriceEditor({ line, onPrice, onDone }: { line: CartLine; onPrice: (price: number) => void; onDone: () => void }) {
    const { t } = useLanguage();
    const [text, setText] = useState(line.price < line.list_price ? formatIqd(line.price) : "");
    const cuts = [5, 10, 15];
    return (
        <div className="flex flex-wrap items-center gap-2 bg-[var(--card-border)]/20 px-4 py-3">
            {cuts.map((pct) => {
                const price = Math.round((line.list_price * (100 - pct)) / 100 / 250) * 250;
                return (
                    <button
                        key={pct}
                        type="button"
                        onClick={() => {
                            onPrice(price);
                            setText(formatIqd(price));
                        }}
                        className={cn(
                            "h-10 rounded-xl border px-3 text-sm font-semibold tabular-nums",
                            line.price === price ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground",
                        )}
                    >
                        −{pct}%
                    </button>
                );
            })}
            <input
                value={text}
                // Applied when the cashier finishes typing, so the total and the customer screen never flash 4, 40, 407...
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                    const n = parseDinars(text);
                    if (n > 0 && n !== line.price) onPrice(n);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
                inputMode="numeric"
                placeholder={formatIqd(line.list_price)}
                aria-label={t("till.cart.linePrice")}
                className="h-10 w-28 rounded-xl border border-stone-400 dark:border-white/25 bg-[var(--card-bg)] px-3 text-right text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)]"
            />
            {line.price < line.list_price && (
                <button
                    type="button"
                    onClick={() => {
                        onPrice(line.list_price);
                        setText("");
                    }}
                    className="h-10 rounded-xl border border-stone-400 bg-[var(--card-bg)] px-3 text-sm font-semibold text-foreground dark:border-white/25"
                >
                    {t("till.cart.fullPrice")}
                </button>
            )}
            <button type="button" onClick={onDone} className={cn("ms-auto h-10 rounded-xl px-4 text-sm font-semibold", INK_BUTTON)}>
                {t("till.cart.done")}
            </button>
        </div>
    );
}

function CustomerCard({
    c,
    nameEmpty,
    onUseName,
}: {
    c: NonNullable<ReturnType<typeof useTillCustomer>["data"]>;
    nameEmpty: boolean;
    onUseName: (name: string) => void;
}) {
    const { t, language } = useLanguage();
    const last = c.last_at ? new Date(c.last_at).toLocaleDateString(dateLocale(language), { day: "numeric", month: "short", timeZone: "Asia/Baghdad" }) : null;
    const facts = [
        t("till.cart.custOrders", { n: c.orders }),
        c.spent > 0 ? t("till.cart.custSpent", { amount: formatIqd(c.spent) }) : null,
        last ? t("till.cart.custLast", { date: last }) : null,
    ].filter((f): f is string => f !== null);
    return (
        <div
            className={cn(
                "col-span-2 flex items-start gap-3 rounded-2xl px-3 py-2.5",
                c.blacklisted ? "bg-[#FDE7EA] text-[#991B1B] dark:bg-red-500/15 dark:text-red-300" : "bg-[var(--card-border)]/30 text-foreground",
            )}
        >
            <span
                className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    c.blacklisted ? "bg-[#991B1B] text-white" : "bg-[#B8E8E0] text-[#1E1E1E]",
                )}
                aria-hidden="true"
            >
                {c.blacklisted ? <AlertTriangle className="h-4 w-4" /> : (c.name ?? "#").slice(0, 1)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {c.blacklisted && <span className="text-left text-xs font-bold" dir="auto">{t("till.cart.blacklisted")}</span>}
                <span className="flex min-w-0 items-center gap-2">
                    {c.name && (
                        <span className="truncate text-left text-sm font-semibold" dir="auto">
                            {c.name}
                        </span>
                    )}
                    {c.name && nameEmpty && (
                        <button type="button" onClick={() => onUseName(c.name ?? "")} className="ms-auto h-9 shrink-0 rounded-full bg-[var(--card-bg)] px-3 text-xs font-semibold text-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                            {t("till.cart.useName")}
                        </button>
                    )}
                </span>
                <span className="flex flex-wrap gap-x-2 text-xs tabular-nums text-muted">
                    {facts.map((f, i) => (
                        <span key={f} className="flex gap-2">
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <span dir="auto">{f}</span>
                        </span>
                    ))}
                </span>
                {c.returned > 0 && (
                    <span className="text-left text-xs font-semibold text-amber-700 dark:text-amber-400" dir="auto">
                        {t("till.cart.custReturned", { n: c.returned })}
                    </span>
                )}
            </span>
        </div>
    );
}

/** Time left as m:ss, never below 0:00. */
