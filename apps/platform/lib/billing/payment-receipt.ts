/**
 * The receipt a shop prints for one transfer our team approved (Fermi B3): one
 * Arabic page (right to left, which printed documents may use), numbered, with
 * the issuer's legal name from the staff console setting.
 */
import { escapeHtml } from "@/lib/html-escape";
import { ISSUER_FALLBACK, METHOD_AR, iqd } from "./monthly-invoice";

export interface PaymentReceipt {
    /** The number the database gave the payment when it was approved. */
    receiptNo: number;
    /** Our legal name (staff console, How shops pay us); null until it is set. */
    legalName: string | null;
    storeName: string;
    displayId: number | null;
    method: string;
    /** What the shop said it sent. */
    sentIqd: number;
    /** What arrived and was added to the wallet. */
    creditedIqd: number;
    sentAt: string;
    approvedAt: string;
}

/** "R-000042": the printed form of a receipt number. */
export function paymentReceiptNumber(receiptNo: number): string {
    return `R-${String(receiptNo).padStart(6, "0")}`;
}

const MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];

/** "16 تشرين الثاني 2026، 14:05", Baghdad time, Latin digits. */
function baghdadDateTime(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")} ${MONTHS_AR[Number(get("month")) - 1]} ${get("year")}، <span class="num">${get("hour")}:${get("minute")}</span>`;
}

function row(label: string, value: string, cls = ""): string {
    return `<tr${cls ? ` class="${cls}"` : ""}><td>${label}</td><td class="num">${value}</td></tr>`;
}

/** A full A5 HTML document for one approved payment. */
export function paymentReceiptDocument(r: PaymentReceipt): string {
    const number = paymentReceiptNumber(r.receiptNo);
    const issuer = escapeHtml(r.legalName?.trim() || ISSUER_FALLBACK);
    const store = r.displayId ? `${escapeHtml(r.storeName)} (#${r.displayId})` : escapeHtml(r.storeName);
    const method = escapeHtml(METHOD_AR[r.method] ?? r.method);
    const differs = r.sentIqd !== r.creditedIqd;

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>وصل دفع ${number}</title>
<style>
  @page { size: A5; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 4mm; margin-bottom: 5mm; }
  .brand { font-size: 20px; font-weight: 700; }
  .muted { color: #555; font-size: 12px; line-height: 1.8; }
  .to { margin-bottom: 5mm; line-height: 1.8; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2.2mm 0; border-bottom: 1px solid #ddd; }
  .num { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
  td.num { text-align: left; }
  tr.total td { font-weight: 700; font-size: 15px; border-bottom: none; padding-top: 3mm; }
  .foot { margin-top: 8mm; color: #555; font-size: 11px; line-height: 1.8; }
</style>
</head>
<body>
<div class="head">
  <div><div class="brand">${issuer}</div><div class="muted">وصل دفع</div></div>
  <div class="muted">رقم الوصل: <span class="num">${number}</span><br>تاريخ القبول: ${baghdadDateTime(r.approvedAt)}</div>
</div>
<div class="to">استلمنا من: ${store}</div>
<table>
${row("طريقة الدفع", method)}
${row("تاريخ الإرسال", baghdadDateTime(r.sentAt))}
${differs ? row("المبلغ الذي ذكره المتجر", iqd(r.sentIqd)) : ""}
${row("المبلغ المستلم والمضاف إلى المحفظة", iqd(r.creditedIqd), "total")}
</table>
<div class="foot">${differs ? "أُضيف إلى المحفظة المبلغ الذي وصلنا فعلاً. " : ""}لا توجد ضريبة. جميع المبالغ بالدينار العراقي.</div>
</body>
</html>`;
}
