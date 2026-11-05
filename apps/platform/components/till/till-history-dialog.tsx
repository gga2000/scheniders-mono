"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Printer, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { useTillSalesToday, type TillHistorySale } from "@/hooks/use-till";
import type { Shop } from "@/hooks/use-shops";
import { formatIqd, type PayMethod } from "@/lib/till/cart";
import { printReceipt, receiptDocument, receiptWhatsAppText, whatsAppReceiptLink, type ReceiptData } from "@/lib/till/receipt";

interface Props {
    sessionId: string;
    shop: Shop;
    storeName: string;
    onClose: () => void;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" });

function toReceipt(s: TillHistorySale, shop: Shop, storeName: string): ReceiptData {
    const lines = s.items.map((i) => ({ name: i.name, variant_name: i.variant_name, quantity: i.quantity, price: i.price }));
    const payments = s.payments.map((p) => (p.tendered === null ? { method: p.method, amount: p.amount } : { method: p.method, amount: p.amount, tendered: p.tendered }));
    return {
        storeName,
        shop,
        orderNumber: s.order_id,
        cashier: s.cashier,
        at: s.created_at,
        lines,
        subtotal: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
        discount: s.discount,
        total: s.total,
        payments,
        change: s.payments.reduce((sum, p) => sum + (p.tendered !== null ? Math.max(0, p.tendered - p.amount) : 0), 0),
        customerName: s.customer_name,
    };
}

/** Today's sales at this shop: find one by number, phone or product, then reprint or resend it. */
export function TillHistoryDialog({ sessionId, shop, storeName, onClose }: Props) {
    const { t } = useLanguage();
    const sales = useTillSalesToday(sessionId, true);
    const [q, setQ] = useState("");

    const shown = useMemo(() => {
        const text = q.trim().toLowerCase();
        const all = sales.data ?? [];
        if (!text) return all;
        const digits = text.replace(/\D/g, "");
        return all.filter(
            (s) =>
                s.order_id.includes(text) ||
                (digits.length >= 3 && (s.phone ?? "").replace(/\D/g, "").includes(digits)) ||
                (s.customer_name ?? "").toLowerCase().includes(text) ||
                s.items.some((i) => i.name.toLowerCase().includes(text)),
        );
    }, [sales.data, q]);

    const total = (sales.data ?? []).reduce((sum, s) => sum + s.total, 0);

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="till-screen flex max-h-[86vh] flex-col md:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-left">{t("till.history.title")}</DialogTitle>
                    <DialogDescription className="text-left tabular-nums" dir="auto">
                        {sales.data ? t("till.history.summary", { n: sales.data.length, total: formatIqd(total) }) : " "}
                    </DialogDescription>
                </DialogHeader>
                <label className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--card-border)] px-3 focus-within:border-[var(--ink)]">
                    <Search className="h-4 w-4 text-muted" aria-hidden="true" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("till.history.search")}
                        aria-label={t("till.history.search")}
                        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                        dir="auto"
                    />
                </label>
                <div className="-mx-1 min-h-[200px] flex-1 overflow-y-auto px-1">
                    {sales.isPending ? (
                        <div className="flex flex-col gap-2">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--card-border)]/40" />
                            ))}
                        </div>
                    ) : sales.isError ? (
                        <p className="py-10 text-center text-sm text-muted">{t("till.history.failed")}</p>
                    ) : shown.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted">{sales.data.length ? t("till.history.noMatch") : t("till.history.none")}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                            {shown.map((s) => (
                                <SaleRow key={s.id} sale={s} receipt={toReceipt(s, shop, storeName)} />
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SaleRow({ sale, receipt }: { sale: TillHistorySale; receipt: ReceiptData }) {
    const { t } = useLanguage();
    const phone = sale.phone ? normalizeIraqiMobile(sale.phone) : null;
    const methods = [...new Set(sale.payments.map((p) => p.method))] as PayMethod[];
    const items = sale.items.reduce((n, i) => n + i.quantity, 0);
    return (
        <li className="flex items-center gap-4 py-3">
            <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-foreground">{time(sale.created_at)}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-left text-sm font-semibold text-foreground" dir="auto">
                    {sale.customer_name || t("till.history.walkIn")}
                    <span className="font-normal tabular-nums text-muted"> · #{sale.order_id}</span>
                </span>
                <span className="block truncate text-left text-xs text-muted" dir="auto">
                    {t("till.cart.items", { n: items })} · {sale.items.map((i) => i.name).join("، ")}
                </span>
            </span>
            <span className="hidden shrink-0 gap-1 sm:flex">
                {methods.map((m) => (
                    <span key={m} className="rounded-full bg-[var(--card-border)]/40 px-2 py-0.5 text-xs font-semibold text-muted">
                        {t(`till.pay.method.${m}`)}
                    </span>
                ))}
            </span>
            <span className="w-24 shrink-0 text-right text-base font-bold tabular-nums text-foreground">{formatIqd(sale.total)}</span>
            <span className="flex shrink-0 gap-1">
                <button
                    type="button"
                    onClick={() => printReceipt(receiptDocument(receipt))}
                    aria-label={t("till.history.reprint")}
                    title={t("till.history.reprint")}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground"
                >
                    <Printer className="h-4 w-4" aria-hidden="true" />
                </button>
                {phone ? (
                    <a
                        href={whatsAppReceiptLink(phone, receiptWhatsAppText(receipt))}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("till.history.resend")}
                        title={t("till.history.resend")}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground"
                    >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    </a>
                ) : (
                    <span className="h-11 w-11" aria-hidden="true" />
                )}
            </span>
        </li>
    );
}
