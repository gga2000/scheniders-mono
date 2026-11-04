/**
 * The till receipt: an 80 mm thermal print (Arabic, right to left, which
 * printed documents may use) and the same receipt as WhatsApp text.
 */
import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import { escapeHtml } from "@/lib/html-escape";
import { formatIqd, type PayMethod, type PaymentLine } from "@/lib/till/cart";

export interface ReceiptData {
    storeName: string;
    shop: { name: string; address: string | null; phone: string | null; receipt_footer: string | null };
    orderNumber: string;
    cashier: string;
    /** ISO time of the sale. */
    at: string;
    lines: { name: string; variant_name: string | null; quantity: number; price: number }[];
    subtotal: number;
    discount: number;
    total: number;
    payments: PaymentLine[];
    change: number;
    customerName: string | null;
}

const METHOD_AR: Record<PayMethod, string> = { cash: "نقداً", card: "بطاقة", zaincash: "زين كاش", fib: "FIB" };

/** Baghdad date and time, e.g. 2026/11/04 · 18:42. */
export function receiptTime(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}/${get("month")}/${get("day")} · ${get("hour")}:${get("minute")}`;
}

function lineName(l: ReceiptData["lines"][number]): string {
    const name = l.variant_name ? `${l.name} ${l.variant_name}` : l.name;
    return l.quantity > 1 ? `${l.quantity} × ${name}` : name;
}

function row(label: string, value: string, strong = false): string {
    return `<div class="row${strong ? " strong" : ""}"><span>${label}</span><span class="num">${value}</span></div>`;
}

/** A full HTML document for one receipt, sized for an 80 mm roll. */
export function receiptDocument(r: ReceiptData): string {
    const head = [
        `<div class="store">${escapeHtml(r.storeName)}</div>`,
        `<div class="muted">${escapeHtml(r.shop.name)}${r.shop.address ? `، ${escapeHtml(r.shop.address)}` : ""}</div>`,
        r.shop.phone ? `<div class="muted num">${escapeHtml(formatIraqiPhoneDisplay(r.shop.phone))}</div>` : "",
    ].join("");
    const meta = [
        row("رقم الفاتورة", escapeHtml(r.orderNumber)),
        row("الكاشير", escapeHtml(r.cashier)),
        row("التاريخ", escapeHtml(receiptTime(r.at))),
        r.customerName ? row("الزبون", escapeHtml(r.customerName)) : "",
    ].join("");
    const items = r.lines.map((l) => row(escapeHtml(lineName(l)), formatIqd(l.price * l.quantity))).join("");
    const cash = r.payments.filter((p) => p.method === "cash").reduce((s, p) => s + (p.tendered ?? p.amount), 0);
    const totals = [
        r.discount > 0 ? row("المجموع قبل الخصم", formatIqd(r.subtotal)) : "",
        r.discount > 0 ? row("الخصم", `−${formatIqd(r.discount)}`) : "",
        row("المجموع", `${formatIqd(r.total)} د.ع`, true),
        ...r.payments
            .filter((p) => p.method !== "cash")
            .map((p) => row(METHOD_AR[p.method], formatIqd(p.amount))),
        cash > 0 ? row(METHOD_AR.cash, formatIqd(cash)) : "",
        r.change > 0 ? row("الباقي للزبون", formatIqd(r.change)) : "",
    ].join("");
    const footer = r.shop.receipt_footer ? `<div class="footer">${escapeHtml(r.shop.receipt_footer)}</div>` : "";

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(r.orderNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; padding: 4mm 4mm 6mm; font-family: Tahoma, Arial, sans-serif; font-size: 12px; color: #000; background: #fff; }
  .store { font-size: 18px; font-weight: 700; text-align: center; }
  .muted { text-align: center; font-size: 11px; margin-top: 1mm; }
  .sep { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; margin: 0.8mm 0; }
  .row.strong { font-weight: 700; font-size: 14px; }
  .num { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
  .footer { text-align: center; font-size: 11px; margin-top: 3mm; }
</style>
</head>
<body>
${head}
<div class="sep"></div>
${meta}
<div class="sep"></div>
${items}
<div class="sep"></div>
${totals}
${footer}
</body>
</html>`;
}

/** The receipt as a WhatsApp message (Arabic). */
export function receiptWhatsAppText(r: ReceiptData): string {
    const lines = [
        r.customerName ? `هلا ${r.customerName}، شكراً لزيارتك ${r.shop.name}.` : `شكراً لزيارتك ${r.shop.name}.`,
        `فاتورتك: ${r.orderNumber}`,
        ...r.lines.map((l) => `${lineName(l)}: ${formatIqd(l.price * l.quantity)}`),
        r.discount > 0 ? `الخصم: ${formatIqd(r.discount)}` : "",
        `المجموع: ${formatIqd(r.total)} د.ع`,
        r.shop.receipt_footer ?? "",
        r.storeName,
    ];
    return lines.filter(Boolean).join("\n");
}

/** wa.me link that opens a chat with the customer, receipt already typed. */
export function whatsAppReceiptLink(phone: string, text: string): string {
    // 07XXXXXXXXX → 9647XXXXXXXXX
    const intl = `964${phone.replace(/^0/, "")}`;
    return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

/** Prints a document through a hidden frame, so the till never opens a new window. */
export function printReceipt(html: string): void {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;";
    frame.srcdoc = html;
    frame.onload = () => {
        const win = frame.contentWindow;
        if (!win) return;
        win.onafterprint = () => frame.remove();
        win.focus();
        win.print();
    };
    document.body.appendChild(frame);
}
