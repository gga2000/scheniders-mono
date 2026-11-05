"use client";

import { useState } from "react";
import { AlertTriangle, Minus, Package, Plus, ScanBarcode, Trash2, UserRound } from "lucide-react";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { useTillCustomer } from "@/hooks/use-till";
import { dateLocale, formatIqd, itemCount, maxDiscount, parseDinars, setQuantity, subtotalOf } from "@/lib/till/cart";
import { CART_TARGET_ID } from "@/lib/till/feedback";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";
import type { Ticket } from "./till-ticket";

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
}

/** The right side of the sell screen: held sales as tabs, the customer, the lines, discount, total. */
export function TillCartPanel({ tickets, activeId, onSwitch, onNew, onChange, onPay, canDiscount, discountLimitPct, isManager, cashierName, sessionId }: Props) {
    const { t } = useLanguage();
    const ticket = tickets.find((x) => x.id === activeId) ?? tickets[0];
    const subtotal = subtotalOf(ticket.cart);
    const limit = maxDiscount(subtotal, discountLimitPct, isManager);
    const total = Math.max(0, subtotal - ticket.discount);
    const [customerOpen, setCustomerOpen] = useState(false);
    const [discountOpen, setDiscountOpen] = useState(false);
    const [discountText, setDiscountText] = useState("");

    const normalPhone = ticket.phone.trim() ? normalizeIraqiMobile(ticket.phone) : null;
    const phoneBad = ticket.phone.trim() !== "" && !normalPhone;
    const customer = useTillCustomer(sessionId, normalPhone);
    const discountTooBig = limit !== null && ticket.discount > limit;

    const applyDiscount = (text: string) => {
        setDiscountText(text);
        onChange({ ...ticket, discount: Math.min(subtotal, parseDinars(text)) });
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
            </div>

            <div className="border-b border-[var(--card-border)] px-4 py-3">
                {customerOpen || ticket.customerName || ticket.phone ? (
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            value={ticket.customerName}
                            onChange={(e) => onChange({ ...ticket, customerName: e.target.value.slice(0, 100) })}
                            placeholder={t("till.cart.customerName")}
                            aria-label={t("till.cart.customerName")}
                            className="h-12 rounded-2xl border border-[var(--card-border)] bg-transparent px-3 text-sm text-foreground outline-none focus:border-[var(--ink)]"
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
                                "h-12 rounded-2xl border border-[var(--card-border)] bg-transparent px-3 text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)]",
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

            <ul id={CART_TARGET_ID} className="min-h-0 flex-1 overflow-y-auto">
                {ticket.cart.length === 0 ? (
                    <li className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--card-border)]/40 text-muted">
                            <ScanBarcode className="h-7 w-7" aria-hidden="true" />
                        </span>
                        <span className="text-sm text-muted" dir="auto">{t("till.cart.empty")}</span>
                    </li>
                ) : (
                    ticket.cart.map((l) => (
                        <li key={l.key} className="flex items-center gap-3 border-b border-[var(--card-border)] px-4 py-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--card-border)]/25 text-muted">
                                {l.image_url ? <img src={l.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                                    {l.name}
                                    {l.variant_name && <span className="font-normal text-muted"> · {l.variant_name}</span>}
                                </span>
                                <span className="text-xs tabular-nums text-muted">{t("till.cart.each", { price: formatIqd(l.price) })}</span>
                            </span>
                            <span className="flex h-12 items-center rounded-2xl border border-[var(--card-border)]">
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...ticket, cart: setQuantity(ticket.cart, l.key, l.quantity - 1) })}
                                    aria-label={l.quantity === 1 ? t("till.cart.remove") : t("till.cart.less")}
                                    className="flex h-12 w-11 items-center justify-center text-foreground"
                                >
                                    {l.quantity === 1 ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                <span className="w-8 text-center text-base font-semibold tabular-nums text-foreground">{l.quantity}</span>
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...ticket, cart: setQuantity(ticket.cart, l.key, l.quantity + 1) })}
                                    aria-label={t("till.cart.more")}
                                    className="flex h-12 w-11 items-center justify-center text-foreground"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </span>
                            <span className="w-[84px] text-right text-base font-bold tabular-nums text-foreground">{formatIqd(l.price * l.quantity)}</span>
                        </li>
                    ))
                )}
            </ul>

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
                                        "h-12 w-32 rounded-2xl border border-[var(--card-border)] bg-transparent px-3 text-right tabular-nums outline-none focus:border-[var(--ink)]",
                                        discountTooBig && "border-red-500",
                                    )}
                                />
                            </label>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setDiscountOpen(true)}
                                className="h-12 rounded-2xl border border-dashed border-[var(--card-border)] px-4 text-sm font-semibold text-foreground"
                            >
                                {t("till.cart.addDiscount")}
                            </button>
                        )}
                        <span className={cn("text-right text-xs", discountTooBig ? "font-semibold text-red-600" : "text-muted")} dir="auto">
                            {limit === null
                                ? t("till.cart.anyDiscount", { name: cashierName })
                                : t("till.cart.upTo", { name: cashierName, pct: discountLimitPct ?? 0, amount: formatIqd(limit) })}
                        </span>
                    </div>
                )}

                <div className="flex items-end justify-between">
                    <span className="text-sm font-semibold text-muted">
                        {t("till.cart.total")}
                        {ticket.cart.length > 0 && <span className="block text-xs font-normal">{t("till.cart.items", { n: itemCount(ticket.cart) })}</span>}
                    </span>
                    <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">{formatIqd(total)}</span>
                </div>
                <button
                    type="button"
                    onClick={onPay}
                    disabled={ticket.cart.length === 0 || phoneBad || discountTooBig}
                    className={cn("h-16 rounded-2xl text-xl font-bold transition-colors", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-muted dark:disabled:bg-white/10 dark:disabled:text-white/40")}
                >
                    {t("till.cart.pay", { total: formatIqd(total) })}
                </button>
            </div>
        </aside>
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
